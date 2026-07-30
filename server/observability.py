from __future__ import annotations

import json
import logging
import threading
import time
import uuid
from collections import Counter
from datetime import datetime, timezone
from typing import Any

from .errors import redact


SENSITIVE_KEYS = {"api_key", "apikey", "authorization", "token", "secret", "password", "notes", "payload"}


def request_id(value: str | None = None) -> str:
    candidate = str(value or "").strip()
    if candidate and len(candidate) <= 80 and all(char.isalnum() or char in "-_." for char in candidate):
        return candidate
    return uuid.uuid4().hex


def sanitize_fields(fields: dict[str, Any]) -> dict[str, Any]:
    output: dict[str, Any] = {}
    for key, value in fields.items():
        if key.lower() in SENSITIVE_KEYS or any(part in key.lower() for part in ("secret", "token", "password", "api_key")):
            output[key] = "[REDACTED]"
        elif isinstance(value, str):
            output[key] = redact(value)
        elif isinstance(value, (int, float, bool)) or value is None:
            output[key] = value
        else:
            output[key] = str(value)[:500]
    return output


class StructuredLogger:
    def __init__(self, name: str = "edgeboard", level: str = "INFO"):
        self.logger = logging.getLogger(name)
        self.logger.setLevel(getattr(logging, level.upper(), logging.INFO))
        if not self.logger.handlers:
            handler = logging.StreamHandler()
            handler.setFormatter(logging.Formatter("%(message)s"))
            self.logger.addHandler(handler)

    def log(self, level: str, event: str, **fields: Any) -> None:
        record = {
            "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "level": level.lower(),
            "event": event,
            **sanitize_fields(fields),
        }
        getattr(self.logger, level.lower(), self.logger.info)(json.dumps(record, separators=(",", ":"), sort_keys=True))


class Metrics:
    def __init__(self):
        self._counts: Counter[str] = Counter()
        self._durations: Counter[str] = Counter()
        self._lock = threading.Lock()

    def increment(self, name: str, amount: int = 1, **labels: Any) -> None:
        key = self._key(name, labels)
        with self._lock:
            self._counts[key] += amount

    def observe(self, name: str, duration_ms: float, **labels: Any) -> None:
        key = self._key(name, labels)
        with self._lock:
            self._counts[f"{key}:observations"] += 1
            self._durations[key] += duration_ms

    def snapshot(self) -> dict[str, dict[str, float]]:
        with self._lock:
            return {"counts": dict(self._counts), "durationMs": dict(self._durations)}

    @staticmethod
    def _key(name: str, labels: dict[str, Any]) -> str:
        suffix = ",".join(f"{key}={labels[key]}" for key in sorted(labels))
        return f"{name}{{{suffix}}}" if suffix else name


class Timer:
    def __init__(self):
        self.started = time.monotonic()

    @property
    def milliseconds(self) -> float:
        return round((time.monotonic() - self.started) * 1000, 3)
