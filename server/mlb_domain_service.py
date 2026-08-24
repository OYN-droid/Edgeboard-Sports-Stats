from __future__ import annotations

import copy
from typing import Any, Callable

from .cache import MemoryCache
from .errors import ProviderError


class MlbDomainService:
    """Shared dependency wiring and provider-bundle assembly for MLB domains."""

    provider_status_fields: tuple[str, str] | None = None

    def __init__(
        self, cache: MemoryCache, rollout: Any, shadow: Any, schedule_service: Any | None = None, *,
        payload_loader: Callable[[], dict[str, Any]] | None = None,
        shadow_validator: Callable[..., tuple[dict[str, Any] | None, list[dict[str, Any]], ProviderError | None]] | None = None,
    ):
        self.cache = cache
        self.rollout = rollout
        self.shadow = shadow
        self.schedule_service = schedule_service
        self.payload_loader = payload_loader or self._fixture
        self.shadow_validator = shadow_validator

    def provider_bundle(self, base: dict[str, Any]) -> dict[str, Any]:
        return self._build_provider_bundle(base, self.read())

    def _build_provider_bundle(self, base: dict[str, Any], data: dict[str, Any]) -> dict[str, Any]:
        bundle = copy.deepcopy(base)
        self._extend_provider_bundle(bundle, data)
        if self.provider_status_fields is not None:
            source_field, trust_field = self.provider_status_fields
            bundle["provider_status"] = {
                **bundle.get("provider_status", {}),
                source_field: data["source"],
                trust_field: data["edgeTrust"],
            }
        return bundle

    def _extend_provider_bundle(self, bundle: dict[str, Any], data: dict[str, Any]) -> None:
        raise NotImplementedError
