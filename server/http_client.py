from __future__ import annotations

import json
import random
import time
import urllib.error
import urllib.request
from email.utils import parsedate_to_datetime
from datetime import datetime, timezone
from typing import Any

from .errors import (
    ProviderAuthenticationError,
    ProviderRateLimitError,
    ProviderTimeoutError,
    ProviderUnavailableError,
    ProviderValidationError,
)
from .resilience import CircuitBreaker, RequestCoordinator


class JsonHttpClient:
    def __init__(
        self,
        timeout_seconds: float = 5.0,
        max_retries: int = 2,
        retry_base_seconds: float = 0.25,
        *,
        maximum_response_bytes: int = 5_000_000,
        coordinator: RequestCoordinator | None = None,
        circuit_breaker: CircuitBreaker | None = None,
        sleeper=time.sleep,
    ):
        self.timeout_seconds = timeout_seconds
        self.max_retries = max_retries
        self.retry_base_seconds = retry_base_seconds
        self.maximum_response_bytes = max(1024, maximum_response_bytes)
        self.coordinator = coordinator or RequestCoordinator()
        self.circuit_breaker = circuit_breaker or CircuitBreaker()
        self.sleeper = sleeper

    def get_json(self, url: str, headers: dict[str, str] | None = None) -> Any:
        if not self.circuit_breaker.allow():
            raise ProviderUnavailableError("Provider circuit is open.")
        try:
            result = self.coordinator.execute(
                f"GET:{url}",
                lambda: self._get_json(url, headers),
                timeout=self.timeout_seconds * (self.max_retries + 1) + 1,
            )
            self.circuit_breaker.success()
            return result
        except Exception as error:
            self.circuit_breaker.failure(error)
            raise

    def _get_json(self, url: str, headers: dict[str, str] | None = None) -> Any:
        last_error: Exception | None = None
        for attempt in range(self.max_retries + 1):
            try:
                request = urllib.request.Request(url, headers=headers or {}, method="GET")
                with urllib.request.urlopen(request, timeout=self.timeout_seconds) as response:
                    content_length = int(response.headers.get("Content-Length") or 0)
                    if content_length > self.maximum_response_bytes:
                        raise ProviderValidationError("Provider response exceeded the configured size limit.")
                    body = response.read(self.maximum_response_bytes + 1)
                    if len(body) > self.maximum_response_bytes:
                        raise ProviderValidationError("Provider response exceeded the configured size limit.")
                    return json.loads(body.decode("utf-8"))
            except urllib.error.HTTPError as error:
                try:
                    retry_after = _retry_after(error.headers.get("Retry-After"))
                    if error.code == 429:
                        last_error = ProviderRateLimitError("Provider rate limit reached.", retry_after)
                    elif error.code in {401, 403}:
                        raise ProviderAuthenticationError("Provider authentication failed.") from error
                    elif error.code >= 500:
                        last_error = ProviderUnavailableError(f"Provider returned HTTP {error.code}.")
                    else:
                        raise ProviderValidationError(f"Provider returned unsupported HTTP {error.code}.") from error
                finally:
                    error.close()
            except TimeoutError as error:
                last_error = ProviderTimeoutError("Provider request timed out.")
            except (urllib.error.URLError, OSError) as error:
                last_error = ProviderUnavailableError(f"Provider request failed: {error.reason if hasattr(error, 'reason') else error}")
            except (UnicodeDecodeError, json.JSONDecodeError) as error:
                raise ProviderValidationError("Provider returned malformed JSON.") from error

            if attempt >= self.max_retries or not getattr(last_error, "retryable", False):
                break
            delay = getattr(last_error, "retry_after", None)
            if delay is None:
                delay = self.retry_base_seconds * (2**attempt) + random.uniform(0, self.retry_base_seconds)
            self.sleeper(max(0.0, delay))
        raise last_error or ProviderUnavailableError("Provider request failed.")


def _retry_after(value: str | None) -> float | None:
    if value is None:
        return None
    try:
        return max(0.0, float(value))
    except ValueError:
        try:
            parsed = parsedate_to_datetime(value)
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            return max(0.0, (parsed - datetime.now(timezone.utc)).total_seconds())
        except (TypeError, ValueError):
            return None
