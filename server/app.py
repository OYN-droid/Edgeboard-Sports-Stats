from __future__ import annotations

import argparse
import gzip
import json
import os
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
SPA_ROUTE_ROOTS = frozenset({"about", "history", "markets", "stories"})
GZIP_MINIMUM_BYTES = 1024
GZIP_SUFFIXES = frozenset({".html", ".js", ".css", ".json", ".svg"})


def is_spa_route(path: str) -> bool:
    """Return true only for known, extensionless client-side application routes."""
    parts = [part for part in PurePosixPath(path).parts if part != "/"]
    return bool(
        parts
        and parts[0] in SPA_ROUTE_ROOTS
        and (parts[0] != "about" or len(parts) == 1)
        and all(not PurePosixPath(part).suffix for part in parts)
    )


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
            if is_spa_route(decoded_path):
                self.path = "/index.html"
            if not self._serve_static_get():
                super().do_GET()

        def _serve_static_get(self) -> bool:
            """Serve regular files with representation-aware caching and gzip."""
            request_path = urlparse(self.path).path
            file_path = Path(self.translate_path(self.path))
            if file_path.is_dir():
                if not request_path.endswith("/"):
                    return False
                file_path = next(
                    (file_path / name for name in ("index.html", "index.htm") if (file_path / name).is_file()),
                    file_path,
                )
                if file_path.is_dir():
                    return False
            if not file_path.is_file():
                self.send_error(404)
                return True
            try:
                source = file_path.open("rb")
            except OSError:
                self.send_error(404)
                return True
            try:
                metadata = os.fstat(source.fileno())
                relative = file_path.relative_to(ROOT)
                content_type = self.guess_type(str(file_path))
                use_gzip = (
                    metadata.st_size >= GZIP_MINIMUM_BYTES
                    and file_path.suffix.casefold() in GZIP_SUFFIXES
                    and self._accepts_gzip()
                )
                etag_suffix = "-gzip" if use_gzip else ""
                etag = f'"{metadata.st_mtime_ns:x}-{metadata.st_size:x}{etag_suffix}"'
                cache_control = self._static_cache_control(relative)
                if self.headers.get("If-None-Match") in {etag, "*"}:
                    self.send_response(304)
                    self.send_header("ETag", etag)
                    if cache_control:
                        self.send_header("Cache-Control", cache_control)
                    if file_path.suffix.casefold() in GZIP_SUFFIXES:
                        self.send_header("Vary", "Accept-Encoding")
                    self.end_headers()
                    return True
                body = gzip.compress(source.read(), compresslevel=6, mtime=0) if use_gzip else None
                self.send_response(200)
                self.send_header("Content-Type", content_type)
                self.send_header("Content-Length", str(len(body) if body is not None else metadata.st_size))
                self.send_header("Last-Modified", self.date_time_string(metadata.st_mtime))
                self.send_header("ETag", etag)
                if cache_control:
                    self.send_header("Cache-Control", cache_control)
                if file_path.suffix.casefold() in GZIP_SUFFIXES:
                    self.send_header("Vary", "Accept-Encoding")
                if use_gzip:
                    self.send_header("Content-Encoding", "gzip")
                self.end_headers()
                if body is not None:
                    self.wfile.write(body)
                else:
                    self.copyfile(source, self.wfile)
                return True
            finally:
                source.close()

        def _accepts_gzip(self) -> bool:
            accepted: dict[str, float] = {}
            for item in self.headers.get("Accept-Encoding", "").split(","):
                parts = [part.strip() for part in item.split(";")]
                if not parts or not parts[0]:
                    continue
                quality = 1.0
                for parameter in parts[1:]:
                    if parameter.startswith("q="):
                        try:
                            quality = float(parameter[2:])
                        except ValueError:
                            quality = 0.0
                accepted[parts[0].casefold()] = quality
            return accepted.get("gzip", accepted.get("*", 0.0)) > 0

        @staticmethod
        def _static_cache_control(relative: Path) -> str:
            parts = relative.parts
            if parts in {("index.html",), ("index.htm",)}:
                return "no-cache"
            if parts in {("app.js",), ("styles.css",)}:
                return "public, max-age=31536000, immutable"
            if len(parts) >= 2 and parts[:2] == ("assets", "illustrations"):
                return "public, max-age=31536000, immutable"
            return ""

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
            if origin and not self._cors_origin_allowed(origin):
                self.send_error(403)
                return
            self.send_response(204)
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-CSRF-Token, X-Request-ID, X-EdgeBoard-Admin")
            self.send_header("Access-Control-Max-Age", "600")
            self.end_headers()

        def _cors_origin_allowed(self, origin: str) -> bool:
            if origin in runtime.config.allowed_origins:
                return True
            parsed = urlparse(origin)
            if (
                parsed.scheme not in {"http", "https"}
                or not parsed.netloc
                or parsed.path not in {"", "/"}
                or parsed.params
                or parsed.query
                or parsed.fragment
                or parsed.username
                or parsed.password
            ):
                return False
            host = self.headers.get("Host", "").strip().lower()
            if not host or any(character in host for character in "\r\n,/"):
                return False
            forwarded_proto = self.headers.get("X-Forwarded-Proto", "").split(",", 1)[0].strip().lower()
            scheme = forwarded_proto if forwarded_proto in {"http", "https"} else (
                "https" if runtime.config.app_env == "production" else "http"
            )
            return origin == f"{scheme}://{host}"

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
            if origin and self._cors_origin_allowed(origin):
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
