#!/usr/bin/env python3
"""Run the complete browser harness in a credential-free headless Chrome session."""

from __future__ import annotations

import argparse
import base64
import json
import os
import shutil
import socket
import struct
import subprocess
import sys
import tempfile
import time
import urllib.parse
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CHROME_PATHS = (
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
)


def available_port() -> int:
    with socket.socket() as candidate:
        candidate.bind(("127.0.0.1", 0))
        return int(candidate.getsockname()[1])


def wait_for_url(url: str, timeout: float = 30) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=2) as response:
                if response.status < 500:
                    return
        except OSError:
            time.sleep(0.2)
    raise TimeoutError(f"Timed out waiting for {url}")


def find_chrome() -> str:
    configured = os.environ.get("CHROME_PATH")
    candidates = ([configured] if configured else []) + list(DEFAULT_CHROME_PATHS)
    for candidate in candidates:
        if candidate and Path(candidate).is_file():
            return candidate
    for name in ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser"):
        resolved = shutil.which(name)
        if resolved:
            return resolved
    raise FileNotFoundError("Chrome/Chromium was not found; set CHROME_PATH to its executable")


def websocket_frame(payload: str) -> bytes:
    data = payload.encode()
    mask = os.urandom(4)
    size = len(data)
    header = bytearray([0x81])
    if size < 126:
        header.append(0x80 | size)
    elif size < 65536:
        header.append(0x80 | 126)
        header.extend(struct.pack("!H", size))
    else:
        header.append(0x80 | 127)
        header.extend(struct.pack("!Q", size))
    header.extend(mask)
    header.extend(bytes(value ^ mask[index % 4] for index, value in enumerate(data)))
    return bytes(header)


def receive_exact(connection: socket.socket, size: int) -> bytes:
    chunks = bytearray()
    while len(chunks) < size:
        chunk = connection.recv(size - len(chunks))
        if not chunk:
            raise RuntimeError("Chrome DevTools websocket closed")
        chunks.extend(chunk)
    return bytes(chunks)


def receive_message(connection: socket.socket) -> dict:
    message = bytearray()
    while True:
        first, second = receive_exact(connection, 2)
        final = bool(first & 0x80)
        opcode = first & 0x0F
        length = second & 0x7F
        if length == 126:
            length = struct.unpack("!H", receive_exact(connection, 2))[0]
        elif length == 127:
            length = struct.unpack("!Q", receive_exact(connection, 8))[0]
        mask = receive_exact(connection, 4) if second & 0x80 else None
        payload = receive_exact(connection, length)
        if mask:
            payload = bytes(value ^ mask[index % 4] for index, value in enumerate(payload))
        if opcode == 8:
            raise RuntimeError("Chrome DevTools websocket sent a close frame")
        if opcode == 9:
            connection.sendall(bytes([0x8A, len(payload)]) + payload)
            continue
        if opcode in (0, 1):
            message.extend(payload)
        if final:
            return json.loads(message.decode())


def connect_devtools(websocket_url: str) -> socket.socket:
    parsed = urllib.parse.urlparse(websocket_url)
    connection = socket.create_connection((parsed.hostname, parsed.port), timeout=60)
    key = base64.b64encode(os.urandom(16)).decode()
    request = (
        f"GET {parsed.path} HTTP/1.1\r\nHost: {parsed.hostname}:{parsed.port}\r\n"
        f"Upgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: {key}\r\n"
        "Sec-WebSocket-Version: 13\r\n\r\n"
    )
    connection.sendall(request.encode())
    response = b""
    while b"\r\n\r\n" not in response:
        response += connection.recv(4096)
    if b" 101 " not in response.split(b"\r\n", 1)[0]:
        raise RuntimeError(response.decode(errors="replace"))
    return connection


def devtools_call(connection: socket.socket, request_id: int, method: str, params: dict | None = None) -> dict:
    request = {"id": request_id, "method": method, "params": params or {}}
    connection.sendall(websocket_frame(json.dumps(request)))
    while True:
        event = receive_message(connection)
        if event.get("id") == request_id:
            if "error" in event:
                raise RuntimeError(f"{method}: {event['error']}")
            return event


def terminate(process: subprocess.Popen | None) -> None:
    if process is None or process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=5)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=0, help="application port; an available port is selected by default")
    parser.add_argument("--timeout", type=int, default=900, help="maximum browser-suite runtime in seconds")
    parser.add_argument("--suite", default="full-regression", help="browser-tests harness name without the .html suffix")
    args = parser.parse_args()
    app_port = args.port or available_port()
    debug_port = available_port()
    app_process = None
    chrome_process = None
    connection = None
    browser_profile = tempfile.TemporaryDirectory(prefix="edgeboard-browser-")
    environment = os.environ.copy()
    environment.update({
        "APP_ENV": "test",
        "DATA_MODE": "sample",
        "SAMPLE_MODE": "true",
        "SAMPLE_MODE_ENABLED": "true",
    })
    try:
        app_process = subprocess.Popen(
            [sys.executable, "-m", "server.app", "--host", "127.0.0.1", "--port", str(app_port)],
            cwd=ROOT,
            env=environment,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        wait_for_url(f"http://127.0.0.1:{app_port}/api/status/ready")

        chrome_process = subprocess.Popen(
            [
                find_chrome(),
                "--headless=new",
                "--no-sandbox",
                "--disable-dev-shm-usage",
                "--disable-background-timer-throttling",
                "--disable-backgrounding-occluded-windows",
                "--disable-renderer-backgrounding",
                f"--remote-debugging-port={debug_port}",
                f"--user-data-dir={browser_profile.name}",
                "about:blank",
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        wait_for_url(f"http://127.0.0.1:{debug_port}/json/version")
        targets = json.load(urllib.request.urlopen(f"http://127.0.0.1:{debug_port}/json/list"))
        page = next(item for item in targets if item.get("type") == "page")
        connection = connect_devtools(page["webSocketDebuggerUrl"])
        suite = "".join(character for character in args.suite if character.isalnum() or character in {"-", "_"})
        if not suite:
            raise ValueError("Browser suite name is invalid")
        devtools_call(connection, 1, "Page.navigate", {"url": f"http://127.0.0.1:{app_port}/browser-tests/{suite}.html"})

        deadline = time.monotonic() + args.timeout
        request_id = 2
        result_text = "Running…"
        status = ""
        while time.monotonic() < deadline:
            result = devtools_call(
                connection,
                request_id,
                "Runtime.evaluate",
                {
                    "expression": "JSON.stringify({status: document.querySelector('#results')?.dataset.status || '', text: document.querySelector('#results')?.textContent || ''})",
                    "returnByValue": True,
                },
            )
            request_id += 1
            value = result.get("result", {}).get("result", {}).get("value")
            if value:
                state = json.loads(value)
                status = state["status"]
                result_text = state["text"]
                if status in {"passed", "failed"}:
                    break
            time.sleep(0.5)
        print(result_text)
        if status != "passed":
            print("FAIL · browser regression did not complete successfully", file=sys.stderr)
            return 1
        return 0
    except Exception as error:
        print(f"FAIL · {error}", file=sys.stderr)
        return 1
    finally:
        if connection:
            connection.close()
        terminate(chrome_process)
        terminate(app_process)
        browser_profile.cleanup()


if __name__ == "__main__":
    raise SystemExit(main())
