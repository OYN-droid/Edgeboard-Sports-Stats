from __future__ import annotations

import os
from dataclasses import dataclass


def _float(name: str, default: float) -> float:
    try:
        return float(os.environ.get(name, default))
    except ValueError:
        return default


def _int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except ValueError:
        return default


@dataclass(frozen=True)
class ProviderConfig:
    mode: str
    name: str
    base_url: str
    api_key: str
    api_key_header: str
    request_timeout_seconds: float
    max_retries: int
    retry_base_seconds: float
    cache_ttl_seconds: int
    cache_stale_seconds: int
    host: str
    port: int

    @classmethod
    def from_env(cls) -> "ProviderConfig":
        mode = os.environ.get("EDGEBOARD_PROVIDER_MODE", "sample").strip().lower()
        return cls(
            mode=mode if mode in {"sample", "live"} else "sample",
            name=os.environ.get("EDGEBOARD_PROVIDER_NAME", "edgeboard-mock").strip() or "edgeboard-mock",
            base_url=os.environ.get("EDGEBOARD_PROVIDER_BASE_URL", "").strip(),
            api_key=os.environ.get("EDGEBOARD_PROVIDER_API_KEY", "").strip(),
            api_key_header=os.environ.get("EDGEBOARD_PROVIDER_API_KEY_HEADER", "Authorization").strip() or "Authorization",
            request_timeout_seconds=max(0.25, _float("EDGEBOARD_REQUEST_TIMEOUT_SECONDS", 5.0)),
            max_retries=max(0, _int("EDGEBOARD_MAX_RETRIES", 2)),
            retry_base_seconds=max(0.0, _float("EDGEBOARD_RETRY_BASE_SECONDS", 0.25)),
            cache_ttl_seconds=max(1, _int("EDGEBOARD_CACHE_TTL_SECONDS", 60)),
            cache_stale_seconds=max(1, _int("EDGEBOARD_CACHE_STALE_SECONDS", 3600)),
            host=os.environ.get("EDGEBOARD_SERVER_HOST", "127.0.0.1").strip() or "127.0.0.1",
            port=max(1, _int("EDGEBOARD_SERVER_PORT", 9010)),
        )

    @property
    def live_configured(self) -> bool:
        return self.mode == "live" and bool(self.base_url and self.api_key)
