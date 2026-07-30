from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from .freshness import freshness_state, parse_timestamp


@dataclass(frozen=True)
class LiveUpdateResult:
    updates: tuple[dict[str, Any], ...]
    connection_state: str
    next_poll_seconds: int
    warnings: tuple[str, ...]


class LiveUpdateCoordinator:
    def __init__(self, provider_manager: Any, base_interval_seconds: int = 8, maximum_backoff_seconds: int = 60):
        self.provider_manager = provider_manager
        self.base_interval_seconds = max(3, base_interval_seconds)
        self.maximum_backoff_seconds = max(self.base_interval_seconds, maximum_backoff_seconds)
        self.failures = 0
        self.last_sequences: dict[str, int] = {}
        self.last_hashes: dict[str, str] = {}

    def poll(self, *, visible: bool = True, event_ids: list[str] | None = None) -> LiveUpdateResult:
        if not visible:
            return LiveUpdateResult((), "paused", min(60, self.base_interval_seconds * 4), ("Polling paused while the page is hidden.",))
        try:
            result = self.provider_manager.fetch("live_status", allow_sample=False)
            items = result.data.get("items", []) if isinstance(result.data, dict) else result.data
            accepted: list[dict[str, Any]] = []
            warnings = list(result.warnings)
            allowed_ids = set(event_ids or [])
            for item in items if isinstance(items, list) else []:
                event_id = str(item.get("event_id") or item.get("id") or "")
                if not event_id or (allowed_ids and event_id not in allowed_ids):
                    continue
                sequence = int(item.get("sequence") or 0)
                if sequence and sequence <= self.last_sequences.get(event_id, -1):
                    warnings.append(f"Out-of-order update for '{event_id}' was ignored.")
                    continue
                digest = hashlib.sha256(json.dumps(item, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
                if digest == self.last_hashes.get(event_id):
                    continue
                provider_updated_at = item.get("provider_updated_at") or item.get("updated_at")
                state = freshness_state("live_status", provider_updated_at)
                normalized = {
                    **item,
                    "event_id": event_id,
                    "provider": result.provider,
                    "freshnessState": state,
                    "delayedLive": state not in {"fresh", "live"},
                }
                accepted.append(normalized)
                self.last_sequences[event_id] = sequence
                self.last_hashes[event_id] = digest
            self.failures = 0
            delayed = any(item["delayedLive"] for item in accepted)
            return LiveUpdateResult(tuple(accepted), "delayed" if delayed else "connected", self.base_interval_seconds, tuple(warnings))
        except Exception:
            self.failures += 1
            delay = min(self.maximum_backoff_seconds, self.base_interval_seconds * (2 ** min(4, self.failures)))
            return LiveUpdateResult((), "reconnecting" if self.failures < 5 else "offline", delay, ("Live provider unavailable; no live claim is active.",))
