from __future__ import annotations

import copy
import threading
import time
from dataclasses import dataclass
from typing import Any


@dataclass
class CacheEntry:
    value: Any
    stored_at: float
    ttl_seconds: float
    stale_seconds: float


class MemoryCache:
    """Small process-local cache. Replace behind this interface for shared deployments."""

    def __init__(self, clock=time.monotonic):
        self._clock = clock
        self._entries: dict[str, CacheEntry] = {}
        self._lock = threading.Lock()

    def set(self, key: str, value: Any, ttl_seconds: float, stale_seconds: float) -> None:
        with self._lock:
            self._entries[key] = CacheEntry(copy.deepcopy(value), self._clock(), ttl_seconds, stale_seconds)

    def get(self, key: str, allow_stale: bool = False) -> tuple[Any | None, str]:
        with self._lock:
            entry = self._entries.get(key)
            if entry is None:
                return None, "miss"
            age = self._clock() - entry.stored_at
            if age <= entry.ttl_seconds:
                return copy.deepcopy(entry.value), "fresh"
            if age <= entry.stale_seconds:
                if allow_stale:
                    return copy.deepcopy(entry.value), "stale"
                return None, "stale"
            self._entries.pop(key, None)
            return None, "expired"

    def clear(self) -> None:
        with self._lock:
            self._entries.clear()
