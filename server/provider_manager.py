from __future__ import annotations

import copy
import threading
import time
from dataclasses import dataclass, field
from typing import Any

from .domain_validation import validate_provider_payload
from .errors import ProviderError, ProviderUnavailableError, ProviderValidationError, map_provider_error
from .resilience import CircuitBreaker, RequestCoordinator


@dataclass
class ProviderHealth:
    provider: str
    enabled: bool = True
    successes: int = 0
    failures: int = 0
    total_latency_ms: float = 0
    last_success_at: float | None = None
    last_error_at: float | None = None
    last_error_code: str | None = None
    warnings: list[str] = field(default_factory=list)

    def score(self) -> float:
        total = self.successes + self.failures
        success_rate = self.successes / total if total else 1.0
        latency_penalty = min(0.25, (self.total_latency_ms / max(1, self.successes)) / 20_000)
        return round(max(0, success_rate - latency_penalty), 3)


@dataclass(frozen=True)
class ProviderResult:
    data: Any
    provider: str
    fallback_used: bool
    conflicts: tuple[dict[str, Any], ...]
    warnings: tuple[str, ...]


class ProviderManager:
    def __init__(
        self,
        primary: Any,
        secondary: Any | None = None,
        sample: Any | None = None,
        *,
        coordinator: RequestCoordinator | None = None,
        failure_threshold: int = 3,
        cooldown_seconds: int = 30,
        clock=time.monotonic,
    ):
        self.primary = primary
        self.secondary = secondary
        self.sample = sample
        self.clock = clock
        self.coordinator = coordinator or RequestCoordinator()
        providers = [provider for provider in (primary, secondary, sample) if provider]
        self.health = {provider.name: ProviderHealth(provider.name) for provider in providers}
        self.breakers = {
            provider.name: CircuitBreaker(failure_threshold, cooldown_seconds, clock=clock)
            for provider in providers
        }
        self._lock = threading.Lock()

    def fetch(self, domain: str, scope: dict[str, Any] | None = None, *, allow_sample: bool = False) -> ProviderResult:
        errors: list[str] = []
        for index, provider in enumerate(provider for provider in (self.primary, self.secondary) if provider):
            if not self.health[provider.name].enabled:
                errors.append(f"{provider.name} is manually disabled.")
                continue
            breaker = self.breakers[provider.name]
            if not breaker.allow():
                errors.append(f"{provider.name} circuit is open.")
                continue
            started = self.clock()
            try:
                result = self.coordinator.execute(
                    f"{provider.name}:{domain}:{sorted((scope or {}).items())}",
                    lambda provider=provider: provider.fetch(domain, scope),
                )
                validation = validate_provider_payload(domain, result)
                if validation.rejected and not self._items(validation.data):
                    raise ProviderValidationError(f"Provider returned no valid records for '{domain}'.")
                breaker.success()
                self._record_success(provider.name, (self.clock() - started) * 1000)
                warnings = [
                    *errors,
                    *validation.warnings,
                    *(
                        [f"{len(validation.rejected)} malformed provider record(s) were rejected."]
                        if validation.rejected else []
                    ),
                ]
                return ProviderResult(copy.deepcopy(validation.data), provider.name, index > 0, (), tuple(warnings))
            except Exception as error:
                breaker.failure(error)
                mapping = map_provider_error(error)
                self._record_failure(provider.name, mapping.code)
                errors.append(f"{provider.name}: {mapping.code}")
        if allow_sample and self.sample:
            validation = validate_provider_payload(domain, self.sample.fetch(domain, scope))
            if validation.rejected and not self._items(validation.data):
                raise ProviderValidationError(f"Sample provider returned no valid records for '{domain}'.")
            return ProviderResult(
                copy.deepcopy(validation.data), self.sample.name, True, (),
                tuple([
                    *errors,
                    *validation.warnings,
                    *(
                        [f"{len(validation.rejected)} malformed sample record(s) were rejected."]
                        if validation.rejected else []
                    ),
                    "Sample fixture fallback used; values are not live.",
                ]),
            )
        raise ProviderUnavailableError("All configured providers are unavailable for this domain.")

    def compare(self, domain: str, scope: dict[str, Any] | None = None) -> ProviderResult:
        if not self.secondary:
            return self.fetch(domain, scope)
        primary = self.fetch_from(self.primary, domain, scope)
        secondary = self.fetch_from(self.secondary, domain, scope)
        conflicts = compare_provider_payloads(primary.data, secondary.data)
        warnings = ("Secondary provider was checked but conflicting values were not silently merged.",) if conflicts else ()
        return ProviderResult(primary.data, primary.provider, False, tuple(conflicts), warnings)

    def fetch_from(self, provider: Any, domain: str, scope: dict[str, Any] | None = None) -> ProviderResult:
        validation = validate_provider_payload(domain, provider.fetch(domain, scope))
        if validation.rejected and not self._items(validation.data):
            raise ProviderValidationError(f"Provider returned no valid records for '{domain}'.")
        warnings = [
            *validation.warnings,
            *([f"{len(validation.rejected)} malformed provider record(s) were rejected."] if validation.rejected else []),
        ]
        return ProviderResult(copy.deepcopy(validation.data), provider.name, False, (), tuple(warnings))

    def disable(self, provider_name: str, disabled: bool = True) -> None:
        if provider_name not in self.health:
            raise KeyError("Unknown provider.")
        self.health[provider_name].enabled = not disabled

    def summary(self) -> list[dict[str, Any]]:
        return [{
            "provider": name,
            "enabled": health.enabled,
            "healthScore": health.score(),
            "successes": health.successes,
            "failures": health.failures,
            "lastErrorCode": health.last_error_code,
            "circuit": self.breakers[name].snapshot(),
        } for name, health in self.health.items()]

    def _record_success(self, name: str, latency_ms: float) -> None:
        with self._lock:
            health = self.health[name]
            health.successes += 1
            health.total_latency_ms += latency_ms
            health.last_success_at = self.clock()

    def _record_failure(self, name: str, code: str) -> None:
        with self._lock:
            health = self.health[name]
            health.failures += 1
            health.last_error_at = self.clock()
            health.last_error_code = code

    @staticmethod
    def _items(payload: Any) -> list[Any]:
        if isinstance(payload, list):
            return payload
        if isinstance(payload, dict) and isinstance(payload.get("items"), list):
            return payload["items"]
        return []


def compare_provider_payloads(primary: Any, secondary: Any) -> list[dict[str, Any]]:
    primary_items = primary.get("items", []) if isinstance(primary, dict) else primary if isinstance(primary, list) else []
    secondary_items = secondary.get("items", []) if isinstance(secondary, dict) else secondary if isinstance(secondary, list) else []
    secondary_by_id = {
        str(item.get("id") or item.get("event_id") or item.get("provider_id")): item
        for item in secondary_items if isinstance(item, dict)
    }
    conflicts: list[dict[str, Any]] = []
    for item in primary_items:
        if not isinstance(item, dict):
            continue
        identity = str(item.get("id") or item.get("event_id") or item.get("provider_id"))
        other = secondary_by_id.get(identity)
        if not other:
            continue
        fields = [
            field for field in ("status", "start_time", "starts_at", "score", "line", "odds")
            if field in item and field in other and item[field] != other[field]
        ]
        if fields:
            conflicts.append({"recordId": identity, "fields": fields, "primary": "retained", "secondary": "not merged"})
    return conflicts
