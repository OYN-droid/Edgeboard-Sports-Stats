from __future__ import annotations

import argparse
import json
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path, PurePosixPath
from urllib.parse import unquote, urlparse

from .config import ProviderConfig
from .gateway import build_gateway


ROOT = Path(__file__).resolve().parent.parent


def create_handler(gateway):
    class EdgeBoardHandler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(ROOT), **kwargs)

        def do_GET(self):
            path = urlparse(self.path).path
            if path == "/api/provider-data":
                self._json(gateway.get_bundle())
                return
            if path == "/api/provider-status":
                bundle = gateway.get_bundle()
                self._json(bundle.get("provider_status", {}))
                return
            decoded_path = unquote(path)
            parts = PurePosixPath(decoded_path).parts
            if any(part.startswith(".") for part in parts if part != "/") or decoded_path.startswith(("/server/", "/tests/")):
                self.send_error(404)
                return
            super().do_GET()

        def _json(self, payload):
            encoded = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(encoded)))
            self.end_headers()
            self.wfile.write(encoded)

    return EdgeBoardHandler


def main() -> None:
    config = ProviderConfig.from_env()
    parser = argparse.ArgumentParser(description="Run the EdgeBoard static app and provider gateway.")
    parser.add_argument("--host", default=config.host)
    parser.add_argument("--port", type=int, default=config.port)
    args = parser.parse_args()
    gateway = build_gateway(config)
    server = ThreadingHTTPServer((args.host, args.port), create_handler(gateway))
    mode = getattr(gateway.provider, "mode", "sample")
    print(f"EdgeBoard {mode} mode: http://{args.host}:{args.port}/")
    print(f"Gateway view: http://{args.host}:{args.port}/?provider=gateway")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
