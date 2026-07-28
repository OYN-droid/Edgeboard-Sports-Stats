from __future__ import annotations

from dataclasses import dataclass


class ProviderError(Exception):
    code = "provider_error"
    retryable = False


class ProviderTimeoutError(ProviderError):
    code = "timeout"
    retryable = True


class ProviderRateLimitError(ProviderError):
    code = "rate_limited"
    retryable = True

    def __init__(self, message: str, retry_after: float | None = None):
        super().__init__(message)
        self.retry_after = retry_after


class ProviderAuthenticationError(ProviderError):
    code = "authentication_failed"


class ProviderUnavailableError(ProviderError):
    code = "provider_unavailable"
    retryable = True


class ProviderValidationError(ProviderError):
    code = "invalid_provider_response"


class ProviderConfigurationError(ProviderError):
    code = "provider_not_configured"


@dataclass(frozen=True)
class ErrorMapping:
    code: str
    message: str
    retryable: bool


def map_provider_error(error: Exception) -> ErrorMapping:
    if isinstance(error, ProviderError):
        return ErrorMapping(error.code, str(error), error.retryable)
    if isinstance(error, TimeoutError):
        return ErrorMapping("timeout", "Provider request timed out.", True)
    return ErrorMapping("unexpected_provider_error", str(error) or "Unexpected provider error.", False)
