from __future__ import annotations

import re
from dataclasses import dataclass


ERROR_CATEGORIES = {
    "configuration_error", "authentication_error", "authorization_error",
    "validation_error", "provider_error", "provider_rate_limit", "provider_timeout",
    "provider_schema_error", "cache_error", "database_error", "stale_data",
    "partial_data", "entity_resolution_error", "unsupported_feature", "internal_error",
}


class EdgeBoardError(Exception):
    code = "internal_error"
    status = 500
    retryable = False
    partial = False

    def safe(self, request_id: str) -> dict[str, object]:
        return {
            "code": self.code,
            "message": redact(str(self)) or "EdgeBoard could not complete the request.",
            "retryable": self.retryable,
            "requestId": request_id,
            "partialData": self.partial,
            "fallbackUsed": False,
        }


class ConfigurationError(EdgeBoardError):
    code = "configuration_error"
    status = 503


class AuthenticationError(EdgeBoardError):
    code = "authentication_error"
    status = 401


class AuthorizationError(EdgeBoardError):
    code = "authorization_error"
    status = 403


class ValidationError(EdgeBoardError):
    code = "validation_error"
    status = 400


class UnsupportedFeatureError(EdgeBoardError):
    code = "unsupported_feature"
    status = 501


class RateLimitError(EdgeBoardError):
    code = "rate_limit"
    status = 429
    retryable = True

    def __init__(self, message: str, retry_after: float = 1):
        super().__init__(message)
        self.retry_after = max(0.0, retry_after)


class ProviderError(EdgeBoardError):
    code = "provider_error"
    status = 502


class ProviderTimeoutError(ProviderError):
    code = "provider_timeout"
    retryable = True


class ProviderRateLimitError(ProviderError):
    code = "provider_rate_limit"
    retryable = True

    def __init__(self, message: str, retry_after: float | None = None):
        super().__init__(message)
        self.retry_after = retry_after


class ProviderAuthenticationError(ProviderError):
    code = "authentication_error"
    status = 502


class ProviderUnavailableError(ProviderError):
    code = "provider_error"
    retryable = True


class ProviderValidationError(ProviderError):
    code = "provider_schema_error"


class ProviderConfigurationError(ConfigurationError, ProviderError):
    code = "configuration_error"


class DatabaseError(EdgeBoardError):
    code = "database_error"
    status = 503
    retryable = True


class CacheError(EdgeBoardError):
    code = "cache_error"
    status = 503
    retryable = True


class EntityResolutionError(EdgeBoardError):
    code = "entity_resolution_error"
    status = 422


SECRET_PATTERN = re.compile(
    r"(?i)(api[_-]?key|authorization|token|secret|password|dsn)(\s*[:=]\s*)([^\s,;]+)"
)
BEARER_PATTERN = re.compile(r"(?i)\bBearer\s+[A-Za-z0-9._~+/=-]+")


def redact(value: object) -> str:
    text = str(value or "").replace("\r", " ").replace("\n", " ")
    text = SECRET_PATTERN.sub(r"\1\2[REDACTED]", text)
    return BEARER_PATTERN.sub("Bearer [REDACTED]", text)[:1000]


@dataclass(frozen=True)
class ErrorMapping:
    code: str
    message: str
    retryable: bool


def map_provider_error(error: Exception) -> ErrorMapping:
    if isinstance(error, ProviderError):
        return ErrorMapping(error.code, redact(error), error.retryable)
    if isinstance(error, TimeoutError):
        return ErrorMapping("provider_timeout", "Provider request timed out.", True)
    return ErrorMapping("provider_error", "Provider request failed.", False)
