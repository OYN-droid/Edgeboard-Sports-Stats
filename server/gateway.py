from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from .adapters import CompositeProviderAdapter
from .cache import MemoryCache
from .config import ProviderConfig
from .contracts import validate_normalized_bundle
from .errors import map_provider_error
from .freshness import FRESHNESS_RULES_SECONDS, freshness_state
from .providers import DOMAIN_METHODS, MockProvider, TemplateHttpProvider


def _payload_updated_at(payload: Any, fallback: str) -> str:
    if isinstance(payload, dict):
        for key in ("updated_at", "last_updated_at", "generated_at"):
            if isinstance(payload.get(key), str) and payload[key]:
                return payload[key]
        items = payload.get("items")
        if isinstance(items, list):
            timestamps = [
                str(item.get("updated_at") or item.get("last_updated_at") or "")
                for item in items
                if isinstance(item, dict)
            ]
            timestamps = [timestamp for timestamp in timestamps if timestamp]
            if timestamps:
                return max(timestamps)
    return fallback


def _freshness_domain(domain: str, payload: Any) -> str:
    if domain != "odds":
        return domain
    items = payload.get("items") if isinstance(payload, dict) else payload if isinstance(payload, list) else []
    is_live = any(
        isinstance(item, dict) and (item.get("is_live") is True or item.get("event_status") == "live")
        for item in items
    )
    return "live_odds" if is_live else "pregame_odds"


class ProviderGateway:
    def __init__(
        self,
        provider: Any,
        cache: MemoryCache | None = None,
        adapter: CompositeProviderAdapter | None = None,
        cache_ttl_seconds: int = 60,
        cache_stale_seconds: int = 3600,
    ):
        self.provider = provider
        self.cache = cache or MemoryCache()
        self.adapter = adapter or CompositeProviderAdapter()
        self.cache_ttl_seconds = cache_ttl_seconds
        self.cache_stale_seconds = cache_stale_seconds
        self.last_successful_update_at: str | None = None

    def get_bundle(self) -> dict[str, Any]:
        now = datetime.now(timezone.utc)
        now_text = now.isoformat().replace("+00:00", "Z")
        raw: dict[str, Any] = {}
        sources = []
        errors = []
        used_stale = False

        for domain, method_name in DOMAIN_METHODS.items():
            cache_key = f"{self.provider.name}:{domain}"
            cached, cache_state = self.cache.get(cache_key)
            if cached is not None:
                raw[domain] = cached
                source_updated_at = _payload_updated_at(cached, self.last_successful_update_at or now_text)
                sources.append({
                    "domain": domain,
                    "provider": self.provider.name,
                    "updated_at": source_updated_at,
                    "state": freshness_state(_freshness_domain(domain, cached), source_updated_at, now),
                    "cache": cache_state,
                })
                continue
            try:
                payload = getattr(self.provider, method_name)()
                raw[domain] = payload
                self.cache.set(
                    cache_key,
                    payload,
                    min(self.cache_ttl_seconds, FRESHNESS_RULES_SECONDS.get(domain, self.cache_ttl_seconds)),
                    self.cache_stale_seconds,
                )
                self.last_successful_update_at = now_text
                source_updated_at = _payload_updated_at(payload, now_text)
                sources.append({
                    "domain": domain,
                    "provider": self.provider.name,
                    "updated_at": source_updated_at,
                    "state": freshness_state(_freshness_domain(domain, payload), source_updated_at, now),
                    "cache": "miss",
                })
            except Exception as error:
                cached, cache_state = self.cache.get(cache_key, allow_stale=True)
                mapping = map_provider_error(error)
                errors.append({"domain": domain, **mapping.__dict__})
                if cached is not None:
                    raw[domain] = cached
                    used_stale = True
                    sources.append({
                        "domain": domain,
                        "provider": self.provider.name,
                        "updated_at": self.last_successful_update_at,
                        "state": "stale",
                        "cache": cache_state,
                    })
                else:
                    raw[domain] = {"items": []}
                    sources.append({
                        "domain": domain,
                        "provider": self.provider.name,
                        "updated_at": None,
                        "state": "unavailable",
                        "cache": cache_state,
                    })

        bundle = self.adapter.adapt(raw, self.provider.name, now_text)
        partial = bool(errors)
        source_states = {source["state"] for source in sources}
        healthy_state = "stale" if "stale" in source_states else "delayed" if "delayed" in source_states else "fresh"
        source_updates = [source["updated_at"] for source in sources if source.get("updated_at")]
        bundle["provider_status"] = {
            "provider": self.provider.name,
            "mode": getattr(self.provider, "mode", "unknown"),
            "state": "offline-fallback" if used_stale else "partial" if partial else healthy_state,
            "last_updated_at": max(source_updates) if source_updates else now_text,
            "last_successful_update_at": self.last_successful_update_at,
            "partial": partial,
            "offline_fallback": used_stale,
            "sources": sources,
            "errors": errors,
        }
        validated = validate_normalized_bundle(bundle, now)
        return validated.data


def build_gateway(config: ProviderConfig | None = None) -> ProviderGateway:
    settings = config or ProviderConfig.from_env()
    provider = TemplateHttpProvider(settings) if settings.live_configured else MockProvider()
    return ProviderGateway(
        provider,
        cache_ttl_seconds=settings.cache_ttl_seconds,
        cache_stale_seconds=settings.cache_stale_seconds,
    )
