from __future__ import annotations

import copy
import re
from collections.abc import Mapping
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit


REDACTED = "[REDACTED]"
SENSITIVE_KEY_PARTS = (
    "api_key", "apikey", "authorization", "bearer", "token", "secret", "password",
    "credential", "account_id", "accountid", "database_url", "cache_url", "queue_url",
    "dsn", "secret_manager", "private_key", "client_secret",
    "notes", "payload",
)
SENSITIVE_QUERY_KEYS = {
    "api_key", "apikey", "key", "token", "access_token", "auth", "authorization",
    "password", "secret", "client_secret", "account_id",
}
BEARER_PATTERN = re.compile(r"(?i)\bBearer\s+[A-Za-z0-9._~+/=-]+")
ASSIGNMENT_PATTERN = re.compile(
    r"(?i)(api[_-]?key|authorization|access[_-]?token|token|secret|password|credential|"
    r"account[_-]?id|database[_-]?url|cache[_-]?url|queue[_-]?url|dsn)"
    r"(\s*[:=]\s*)([^\s,;]+)"
)
URL_PATTERN = re.compile(r"\b(?:https?|postgres(?:ql)?|redis|amqp(?:s)?|sqlite)://[^\s<>\"']+")


def is_sensitive_key(key: object) -> bool:
    normalized = str(key or "").strip().lower().replace("-", "_")
    return normalized.endswith("_url") or any(part in normalized for part in SENSITIVE_KEY_PARTS)


def _redact_url(candidate: str) -> str:
    try:
        parsed = urlsplit(candidate)
    except ValueError:
        return REDACTED
    if not parsed.scheme or not parsed.netloc:
        return candidate
    hostname = parsed.hostname or ""
    port = f":{parsed.port}" if parsed.port else ""
    netloc = f"{hostname}{port}"
    pairs = [
        (key, REDACTED if key.casefold() in SENSITIVE_QUERY_KEYS else value)
        for key, value in parse_qsl(parsed.query, keep_blank_values=True)
    ]
    # Infrastructure connection strings are sensitive in their entirety except scheme context.
    if parsed.scheme.casefold() in {"postgres", "postgresql", "redis", "amqp", "amqps", "sqlite"}:
        return f"{parsed.scheme}://{REDACTED}"
    return urlunsplit((parsed.scheme, netloc, parsed.path, urlencode(pairs), parsed.fragment))


def redact_text(value: object, *, limit: int = 1000) -> str:
    text = str(value or "").replace("\r", " ").replace("\n", " ")
    text = BEARER_PATTERN.sub(f"Bearer {REDACTED}", text)
    text = ASSIGNMENT_PATTERN.sub(lambda match: f"{match.group(1)}{match.group(2)}{REDACTED}", text)
    text = URL_PATTERN.sub(lambda match: _redact_url(match.group(0)), text)
    return text[:limit]


def redact_value(value: Any, *, key: object = None) -> Any:
    """Return a redacted deep copy without mutating caller-owned structures."""
    if key is not None and is_sensitive_key(key):
        return REDACTED
    if isinstance(value, Mapping):
        return {item_key: redact_value(item_value, key=item_key) for item_key, item_value in value.items()}
    if isinstance(value, list):
        return [redact_value(item) for item in value]
    if isinstance(value, tuple):
        return tuple(redact_value(item) for item in value)
    if isinstance(value, set):
        return {redact_value(item) for item in value}
    if isinstance(value, str):
        return redact_text(value)
    return copy.deepcopy(value)
