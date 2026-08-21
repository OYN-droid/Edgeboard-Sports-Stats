from __future__ import annotations

from typing import Any

from .errors import ProviderValidationError, map_provider_error
from .provider_contracts import CapabilityRegistry, canonical_domain, fixture_capability_registry


class ProviderAdapterBase:
    """Provider-neutral server contract; concrete adapters opt into only supported domains."""

    name = "unconfigured-provider"
    mode = "offline"

    def __init__(self, capabilities: CapabilityRegistry | None = None):
        self._capabilities = capabilities or CapabilityRegistry()

    @property
    def provider_id(self) -> str:
        return self.name

    @property
    def provider_name(self) -> str:
        return self.name

    def get_capabilities(self):
        return self._capabilities.for_provider(self.provider_id)

    def supports_domain(self, domain: str, league_id: str = "sample") -> bool:
        return self._capabilities.supports(self.provider_id, league_id, domain)

    def validate_configuration(self) -> tuple[tuple[str, ...], tuple[str, ...]]:
        return (), ()

    def health_status(self) -> dict[str, Any]:
        return {"providerId": self.provider_id, "state": "not_checked", "liveVerified": False}

    def normalize_error(self, error: Exception) -> dict[str, Any]:
        mapped = map_provider_error(error)
        return {"code": mapped.code, "message": mapped.message, "retryable": mapped.retryable}

    def attribution_metadata(self) -> dict[str, Any]:
        return {"providerId": self.provider_id, "displayName": self.provider_name, "required": True}

    def fetch(self, domain: str, scope: dict[str, Any] | None = None) -> Any:
        resolved = canonical_domain(domain)
        raise ProviderValidationError(
            f"Provider domain '{resolved or str(domain)}' is unsupported by {self.provider_id}."
        )


class FixtureAdapterContract(ProviderAdapterBase):
    def __init__(self):
        super().__init__(fixture_capability_registry())
