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
    private: bool = False
    tags: tuple[str, ...] = ()


class MemoryCache:
    """Small process-local cache. Replace behind this interface for shared deployments."""

    def __init__(self, clock=time.monotonic):
        self._clock = clock
        self._entries: dict[str, CacheEntry] = {}
        self._lock = threading.Lock()
        self._hits = 0
        self._misses = 0
        self._stale_hits = 0

    def set(
        self,
        key: str,
        value: Any,
        ttl_seconds: float,
        stale_seconds: float,
        *,
        private: bool = False,
        tags: tuple[str, ...] = (),
    ) -> None:
        with self._lock:
            self._entries[key] = CacheEntry(
                copy.deepcopy(value), self._clock(), max(0, ttl_seconds),
                max(ttl_seconds, stale_seconds), private, tuple(dict.fromkeys(tags)),
            )

    def get(self, key: str, allow_stale: bool = False) -> tuple[Any | None, str]:
        with self._lock:
            entry = self._entries.get(key)
            if entry is None:
                self._misses += 1
                return None, "miss"
            age = self._clock() - entry.stored_at
            if age <= entry.ttl_seconds:
                self._hits += 1
                return copy.deepcopy(entry.value), "fresh"
            if age <= entry.stale_seconds:
                if allow_stale:
                    self._stale_hits += 1
                    return copy.deepcopy(entry.value), "stale"
                self._misses += 1
                return None, "stale"
            self._entries.pop(key, None)
            self._misses += 1
            return None, "expired"

    def clear(self) -> None:
        with self._lock:
            self._entries.clear()

    def invalidate(self, *, prefix: str = "", tag: str = "") -> int:
        with self._lock:
            keys = [
                key for key, entry in self._entries.items()
                if (prefix and key.startswith(prefix)) or (tag and tag in entry.tags)
            ]
            for key in keys:
                self._entries.pop(key, None)
            return len(keys)

    def diagnostics(self) -> dict[str, int]:
        with self._lock:
            return {
                "entries": len(self._entries),
                "hits": self._hits,
                "misses": self._misses,
                "staleHits": self._stale_hits,
                "privateEntries": sum(1 for entry in self._entries.values() if entry.private),
            }


class CachePolicy:
    TTL_SECONDS = {
        "league_availability": 3600,
        "league_catalog": 86400,
        "schedules": 300,
        "live_status": 8,
        "event_details": 120,
        "profiles": 3600,
        "standings": 600,
        "historical_stats": 86400,
        "leaderboards": 900,
        "injuries": 180,
        "lineups": 45,
        "pregame_odds": 45,
        "live_odds": 5,
        "line_movement": 15,
        "completed_events": 604800,
        "research": 300,
    }

    def __init__(self, default_ttl: int = 60, live_ttl: int = 8, maximum_ttl: int = 3600):
        self.default_ttl = max(1, default_ttl)
        self.live_ttl = max(1, live_ttl)
        self.maximum_ttl = max(1, maximum_ttl)

    def ttl(self, domain: str, *, event_status: str = "", provider_maximum: int | None = None) -> int:
        if event_status == "live":
            value = min(self.live_ttl, self.TTL_SECONDS.get(domain, self.live_ttl))
        elif event_status == "final":
            value = self.TTL_SECONDS.get("completed_events", self.maximum_ttl)
        else:
            value = self.TTL_SECONDS.get(domain, self.default_ttl)
        limits = [value, self.maximum_ttl]
        if provider_maximum is not None:
            limits.append(max(1, provider_maximum))
        return max(1, min(limits))

    @staticmethod
    def key(version: str, provider: str, domain: str, scope: str = "all") -> str:
        safe = ":".join(str(part).strip().casefold().replace(":", "_") for part in (version, provider, domain, scope))
        return f"edgeboard:{safe}"
