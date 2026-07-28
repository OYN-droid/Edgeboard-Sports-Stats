from __future__ import annotations

import json
import random
import time
import urllib.error
import urllib.request
from typing import Any

from .errors import (
    ProviderAuthenticationError,
    ProviderRateLimitError,
    ProviderTimeoutError,
    ProviderUnavailableError,
    ProviderValidationError,
)


class JsonHttpClient:
    def __init__(self, timeout_seconds: float = 5.0, max_retries: int = 2, retry_base_seconds: float = 0.25):
        self.timeout_seconds = timeout_seconds
        self.max_retries = max_retries
        self.retry_base_seconds = retry_base_seconds

    def get_json(self, url: str, headers: dict[str, str] | None = None) -> Any:
        last_error: Exception | None = None
        for attempt in range(self.max_retries + 1):
            try:
                request = urllib.request.Request(url, headers=headers or {}, method="GET")
                with urllib.request.urlopen(request, timeout=self.timeout_seconds) as response:
                    return json.loads(response.read().decode("utf-8"))
            except urllib.error.HTTPError as error:
                retry_after = _retry_after(error.headers.get("Retry-After"))
                if error.code == 429:
                    last_error = ProviderRateLimitError("Provider rate limit reached.", retry_after)
                elif error.code in {401, 403}:
                    raise ProviderAuthenticationError("Provider authentication failed.") from error
                elif error.code >= 500:
                    last_error = ProviderUnavailableError(f"Provider returned HTTP {error.code}.")
                else:
                    raise ProviderValidationError(f"Provider returned unsupported HTTP {error.code}.") from error
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
            time.sleep(max(0.0, delay))
        raise last_error or ProviderUnavailableError("Provider request failed.")


def _retry_after(value: str | None) -> float | None:
    if value is None:
        return None
    try:
        return max(0.0, float(value))
    except ValueError:
        return None
