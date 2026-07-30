from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from server.api import Api
from server.config import ProviderConfig
from server.runtime import build_runtime


def main() -> None:
    runtime = build_runtime(ProviderConfig.from_env())
    try:
        api = Api(runtime)
        checks = {}
        for path in ("/api/status", "/api/status/ready", "/api/config/public", "/api/provider-data"):
            status, payload, _headers = api.handle("GET", path, client_ip="smoke")
            checks[path] = {"status": status, "ok": status == 200 and "error" not in payload}
        print(json.dumps(checks, indent=2, sort_keys=True))
        if not all(check["ok"] for check in checks.values()):
            raise SystemExit(1)
    finally:
        runtime.close()


if __name__ == "__main__":
    main()
