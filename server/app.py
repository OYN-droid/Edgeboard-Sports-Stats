from __future__ import annotations

import argparse
import json
import signal
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path, PurePosixPath
from urllib.parse import unquote, urlparse

from .api import Api
from .config import ProviderConfig
from .errors import ConfigurationError, redact
from .runtime import Runtime, build_runtime


ROOT = Path(__file__).resolve().parent.parent


def create_handler(runtime: Runtime):
    api = Api(runtime)

    class EdgeBoardHandler(SimpleHTTPRequestHandler):
        server_version = "EdgeBoard/9"

        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(ROOT), **kwargs)

        def do_GET(self):
            parsed = urlparse(self.path)
            if parsed.path.startswith("/api/"):
                self._api("GET", parsed.path, parsed.query)
                return
            decoded_path = unquote(parsed.path)
            parts = PurePosixPath(decoded_path).parts
            if (
                any(part.startswith(".") for part in parts if part != "/")
                or decoded_path.startswith(("/server/", "/tests/", "/scripts/"))
                or (runtime.config.app_env == "production" and decoded_path.startswith("/browser-tests/"))
                or "\0" in decoded_path
            ):
                self.send_error(404)
                return
            super().do_GET()

        def do_POST(self):
            parsed = urlparse(self.path)
            if not parsed.path.startswith("/api/"):
                self.send_error(404)
                return
            length_text = self.headers.get("Content-Length", "")
            try:
                length = int(length_text)
            except ValueError:
                self.send_error(400, "Invalid Content-Length")
                return
            if length < 0 or length > runtime.config.request_body_limit_bytes:
                self._json(
                    413,
                    {"error": {
                        "code": "validation_error",
                        "message": "Request body exceeds the configured limit.",
                        "retryable": False,
                        "partialData": False,
                    }},
                )
                return
            self._api("POST", parsed.path, parsed.query, self.rfile.read(length))

        def do_OPTIONS(self):
            origin = self.headers.get("Origin")
            if origin and origin not in runtime.config.allowed_origins:
                self.send_error(403)
                return
            self.send_response(204)
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-CSRF-Token, X-Request-ID")
            self.send_header("Access-Control-Max-Age", "600")
            self.end_headers()

        def _api(self, method: str, path: str, query: str = "", body: bytes = b""):
            status, payload, headers = api.handle(
                method,
                path,
                query=query,
                body=body,
                headers={key: value for key, value in self.headers.items()},
                client_ip=self.client_address[0] if self.client_address else "unknown",
            )
            self._json(status, payload, headers)

        def _json(self, status: int, payload: object, headers: dict[str, str] | None = None):
            encoded = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store, private")
            self.send_header("Content-Length", str(len(encoded)))
            for key, value in (headers or {}).items():
                self.send_header(key, value)
            self.end_headers()
            self.wfile.write(encoded)

        def end_headers(self):
            origin = self.headers.get("Origin")
            if origin and origin in runtime.config.allowed_origins:
                self.send_header("Access-Control-Allow-Origin", origin)
                self.send_header("Vary", "Origin")
            self.send_header("X-Content-Type-Options", "nosniff")
            frame_policy = "DENY" if runtime.config.app_env == "production" else "SAMEORIGIN"
            frame_ancestors = "'none'" if runtime.config.app_env == "production" else "'self'"
            self.send_header("X-Frame-Options", frame_policy)
            self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
            self.send_header("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
            script_policy = "'self' 'unsafe-inline'" if self.path.startswith("/browser-tests/") else "'self'"
            self.send_header(
                "Content-Security-Policy",
                "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; "
                f"script-src {script_policy}; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors {frame_ancestors}",
            )
            super().end_headers()

        def log_message(self, format_string: str, *args):
            runtime.logger.log(
                "info",
                "http_access",
                client=self.client_address[0] if self.client_address else "unknown",
                message=format_string % args,
            )

    return EdgeBoardHandler


def main() -> None:
    config = ProviderConfig.from_env()
    parser = argparse.ArgumentParser(description="Run the EdgeBoard frontend and production-boundary API.")
    parser.add_argument("--host", default=config.host)
    parser.add_argument("--port", type=int, default=config.port)
    parser.add_argument("--check-config", action="store_true")
    args = parser.parse_args()
    errors, warnings = config.validate()
    if args.check_config:
        print(json.dumps({"valid": not errors, "errors": list(errors), "warnings": list(warnings)}))
        raise SystemExit(0 if not errors else 2)
    if errors:
        raise ConfigurationError(" ".join(errors))
    runtime = build_runtime(config)
    server = ThreadingHTTPServer((args.host, args.port), create_handler(runtime))
    server.daemon_threads = True

    def shutdown(_signum=None, _frame=None):
        threading.Thread(target=server.shutdown, daemon=True).start()

    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)
    public = config.public_config()
    print(f"EdgeBoard {public['dataMode']} mode: http://{args.host}:{args.port}/")
    print(
        "No live-data claim is active."
        if not config.live_configured
        else f"Live provider configured; validation is pending: {config.name}"
    )
    try:
        server.serve_forever()
    finally:
        server.server_close()
        runtime.close()


if __name__ == "__main__":
    try:
        main()
    except ConfigurationError as error:
        print(f"Configuration error: {redact(error)}")
        raise SystemExit(2)
