from __future__ import annotations

import threading
import time
from concurrent.futures import Future
from dataclasses import dataclass
from typing import Any, Callable

from .errors import ProviderAuthenticationError, ProviderUnavailableError, RateLimitError


@dataclass
class CircuitState:
    failures: int = 0
    opened_at: float | None = None
    state: str = "closed"


class CircuitBreaker:
    def __init__(self, failure_threshold: int = 3, cooldown_seconds: float = 30, clock=time.monotonic):
        self.failure_threshold = max(1, failure_threshold)
        self.cooldown_seconds = max(0.1, cooldown_seconds)
        self.clock = clock
        self.status = CircuitState()
        self._lock = threading.Lock()

    def allow(self) -> bool:
        with self._lock:
            if self.status.state == "closed":
                return True
            if self.status.state == "half_open":
                return False
            if self.status.opened_at is not None and self.clock() - self.status.opened_at >= self.cooldown_seconds:
                self.status.state = "half_open"
                return True
            return False

    def success(self) -> None:
        with self._lock:
            self.status = CircuitState()

    def failure(self, error: Exception) -> None:
        if isinstance(error, ProviderAuthenticationError):
            return
        with self._lock:
            self.status.failures += 1
            if self.status.failures >= self.failure_threshold:
                self.status.state = "open"
                self.status.opened_at = self.clock()

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            return {
                "state": self.status.state,
                "failures": self.status.failures,
                "openedAtMonotonic": self.status.opened_at,
            }


class RequestCoordinator:
    def __init__(self, concurrency: int = 4):
        self.semaphore = threading.BoundedSemaphore(max(1, concurrency))
        self.inflight: dict[str, Future[Any]] = {}
        self._lock = threading.Lock()

    def execute(self, key: str, operation: Callable[[], Any], timeout: float = 10) -> Any:
        owner = False
        with self._lock:
            future = self.inflight.get(key)
            if future is None:
                future = Future()
                self.inflight[key] = future
                owner = True
        if not owner:
            return future.result(timeout=timeout)
        acquired = self.semaphore.acquire(timeout=timeout)
        if not acquired:
            with self._lock:
                self.inflight.pop(key, None)
            raise ProviderUnavailableError("Provider concurrency queue timed out.")
        try:
            result = operation()
            future.set_result(result)
            return result
        except Exception as error:
            future.set_exception(error)
            raise
        finally:
            self.semaphore.release()
            with self._lock:
                self.inflight.pop(key, None)


class FixedWindowRateLimiter:
    def __init__(self, clock=time.monotonic):
        self.clock = clock
        self._buckets: dict[tuple[str, str], tuple[float, int]] = {}
        self._lock = threading.Lock()

    def check(self, policy: str, identity: str, limit: int, window_seconds: int) -> dict[str, int]:
        now = self.clock()
        key = (policy, identity)
        with self._lock:
            started, count = self._buckets.get(key, (now, 0))
            if now - started >= window_seconds:
                started, count = now, 0
            if count >= limit:
                retry_after = max(1, int(window_seconds - (now - started)))
                raise RateLimitError("EdgeBoard API rate limit reached.", retry_after)
            count += 1
            self._buckets[key] = (started, count)
            return {"limit": limit, "remaining": max(0, limit - count), "resetSeconds": max(0, int(window_seconds - (now - started)))}
