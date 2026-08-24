from __future__ import annotations

import copy
from datetime import datetime, timezone
from typing import Any

from .adapters import CompositeProviderAdapter
from .cache import CachePolicy, MemoryCache
from .config import ProviderConfig
from .contracts import validate_normalized_bundle
from .domain_validation import validate_provider_payload
from .errors import map_provider_error
from .freshness import freshness_state
from .errors import ProviderConfigurationError
from .providers import DOMAIN_METHODS, FixtureProvider, MockProvider, OfflineProvider, TemplateHttpProvider


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
        provider_maximum_cache_seconds: int = 3600,
        operating_mode: str | None = None,
        cache_provider_payloads: bool = True,
    ):
        self.provider = provider
        self.cache = cache or MemoryCache()
        self.adapter = adapter or CompositeProviderAdapter()
        self.cache_ttl_seconds = cache_ttl_seconds
        self.cache_stale_seconds = cache_stale_seconds
        self.provider_maximum_cache_seconds = max(1, provider_maximum_cache_seconds)
        self.operating_mode = operating_mode or getattr(provider, "mode", "unknown")
        self.cache_provider_payloads = cache_provider_payloads
        self.last_successful_update_at: str | None = None
        self.cache_policy = CachePolicy(
            cache_ttl_seconds,
            min(8, cache_ttl_seconds),
            self.provider_maximum_cache_seconds,
        )

    def get_bundle(self) -> dict[str, Any]:
        now = datetime.now(timezone.utc)
        now_text = now.isoformat().replace("+00:00", "Z")
        raw: dict[str, Any] = {}
        sources = []
        errors = []
        used_stale = False

        for domain, method_name in DOMAIN_METHODS.items():
            cache_key = CachePolicy.key("v1", self.provider.name, domain)
            cached, cache_state = self.cache.get(cache_key) if self.cache_provider_payloads else (None, "disabled-by-terms")
            if cached is not None:
                raw[domain] = cached
                source_updated_at = _payload_updated_at(cached, self.last_successful_update_at or now_text)
                sources.append({
                    "domain": domain,
                    "provider": self.provider.name,
                    "updated_at": source_updated_at,
                    "state": freshness_state(
                        _freshness_domain(domain, cached), source_updated_at, now,
                        sample=getattr(self.provider, "mode", "") == "sample",
                    ),
                    "cache": cache_state,
                })
                continue
            try:
                payload = getattr(self.provider, method_name)()
                validation = validate_provider_payload(domain, payload)
                payload = validation.data
                raw[domain] = payload
                if validation.rejected:
                    errors.append({
                        "domain": domain,
                        "code": "provider_schema_error",
                        "message": f"{len(validation.rejected)} malformed provider record(s) were rejected before caching.",
                        "retryable": False,
                        "rejectedRecords": [
                            {
                                "index": item["index"],
                                "code": item["code"],
                                "recordId": item.get("recordId"),
                            }
                            for item in validation.rejected
                        ],
                    })
                elif self.cache_provider_payloads:
                    self.cache.set(
                        cache_key,
                        payload,
                        self.cache_policy.ttl(
                            _freshness_domain(domain, payload),
                            provider_maximum=self.provider_maximum_cache_seconds,
                        ),
                        self.cache_stale_seconds,
                        tags=(f"provider:{self.provider.name}", f"domain:{domain}"),
                    )
                self.last_successful_update_at = now_text
                source_updated_at = _payload_updated_at(payload, now_text)
                sources.append({
                    "domain": domain,
                    "provider": self.provider.name,
                    "updated_at": source_updated_at,
                    "state": freshness_state(
                        _freshness_domain(domain, payload), source_updated_at, now,
                        sample=getattr(self.provider, "mode", "") == "sample",
                    ),
                    "cache": "bypassed-invalid" if validation.rejected else cache_state if not self.cache_provider_payloads else "miss",
                    "warnings": list(validation.warnings),
                })
            except Exception as error:
                cached, cache_state = (
                    self.cache.get(cache_key, allow_stale=True)
                    if self.cache_provider_payloads else (None, "disabled-by-terms")
                )
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

        # Raw domain values may be shared with MemoryCache. Detach the complete
        # provider snapshot before adapters can pass through or enrich its items.
        bundle = self.adapter.adapt(copy.deepcopy(raw), self.provider.name, now_text)
        partial = bool(errors)
        source_states = {source["state"] for source in sources}
        healthy_state = (
            "sample" if getattr(self.provider, "mode", "") == "sample"
            else "unavailable" if getattr(self.provider, "mode", "") == "offline"
            else "expired" if "expired" in source_states
            else "stale" if "stale" in source_states
            else "delayed" if "delayed" in source_states
            else "fresh"
        )
        source_updates = [source["updated_at"] for source in sources if source.get("updated_at")]
        bundle["provider_status"] = {
            "provider": self.provider.name,
            "mode": self.operating_mode,
            "state": "offline-fallback" if used_stale else "partial" if partial else healthy_state,
            "fetched_at": now_text,
            "last_updated_at": max(source_updates) if source_updates else now_text,
            "last_successful_update_at": self.last_successful_update_at,
            "partial": partial,
            "offline_fallback": used_stale,
            "sources": sources,
            "errors": errors,
            "cache": self.cache.diagnostics(),
            "sample": getattr(self.provider, "mode", "unknown") == "sample",
        }
        validated = validate_normalized_bundle(bundle, now)
        return validated.data


def build_gateway(config: ProviderConfig | None = None) -> ProviderGateway:
    settings = config or ProviderConfig.from_env()
    errors, _warnings = settings.validate()
    if errors:
        raise ProviderConfigurationError(" ".join(errors))
    provider = (
        TemplateHttpProvider(settings) if settings.live_configured
        else OfflineProvider() if settings.data_mode == "offline"
        else OfflineProvider() if settings.data_mode == "degraded" and not settings.sample_fallback_enabled
        else FixtureProvider()
    )
    return ProviderGateway(
        provider,
        cache_ttl_seconds=settings.cache_ttl_seconds,
        cache_stale_seconds=settings.cache_stale_seconds,
        provider_maximum_cache_seconds=settings.terms.maximum_cache_duration,
        operating_mode=settings.data_mode,
        cache_provider_payloads=(
            settings.terms.raw_payload_retention_allowed
            or not settings.live_configured
        ),
    )
