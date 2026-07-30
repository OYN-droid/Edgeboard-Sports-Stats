from __future__ import annotations

import copy
import math
from dataclasses import dataclass
from typing import Any, Callable

from .freshness import parse_timestamp


EVENT_STATUSES = {"scheduled", "live", "postponed", "cancelled", "final", "suspended", "unknown"}
MARKET_STATUSES = {"open", "suspended", "closed", "unavailable"}
MARKET_SIDES = {"home", "away", "draw", "over", "under", "yes", "no", "competitor", ""}
SETTLEMENT_SCOPES = {
    "provider-rules", "regulation-only", "including-overtime", "including-extra-time",
    "full-event", "full-game", "full-fight", "full-race", "session", "round", "period",
}
CONFIRMATION_STATES = {"official", "provider_confirmed", "reported", "projected", "unverified", "outdated"}
STAT_UNITS = {
    "count", "points", "goals", "yards", "seconds", "minutes", "percent", "rate",
    "attempts", "meters", "kilometers", "miles", "laps", "rounds", "wins", "losses",
}


@dataclass(frozen=True)
class RecordValidation:
    accepted: tuple[dict[str, Any], ...]
    rejected: tuple[dict[str, Any], ...]
    warnings: tuple[str, ...]

    @property
    def partial(self) -> bool:
        return bool(self.rejected or self.warnings)


@dataclass(frozen=True)
class ProviderPayloadValidation:
    data: Any
    rejected: tuple[dict[str, Any], ...]
    warnings: tuple[str, ...]

    @property
    def partial(self) -> bool:
        return bool(self.rejected or self.warnings)


PROVIDER_TIMESTAMP_FIELDS = {
    "updated_at", "last_updated_at", "provider_updated_at", "recorded_at",
    "starts_at", "start_time", "reported_at", "effective_at", "opened_at", "closed_at",
}


def validate_provider_payload(domain: str, payload: object) -> ProviderPayloadValidation:
    """Structurally validate an adapter input before it can enter the raw-domain cache."""
    if isinstance(payload, list):
        records = payload
        envelope: dict[str, Any] | None = None
    elif isinstance(payload, dict) and isinstance(payload.get("items"), list):
        records = payload["items"]
        envelope = copy.deepcopy(payload)
    else:
        rejected = (_reject(0, "collection_type", f"Provider domain '{domain}' must contain an items list.", payload),)
        return ProviderPayloadValidation({"items": []}, rejected, ())

    accepted: list[dict[str, Any]] = []
    rejected: list[dict[str, Any]] = []
    for index, record in enumerate(records):
        if not isinstance(record, dict):
            rejected.append(_reject(index, "record_type", "Provider record must be an object.", record))
            continue
        invalid_timestamp = next((
            field for field in PROVIDER_TIMESTAMP_FIELDS
            if record.get(field) not in (None, "") and parse_timestamp(record[field]) is None
        ), None)
        if invalid_timestamp:
            rejected.append(_reject(
                index,
                "invalid_timestamp",
                f"Provider record has an invalid {invalid_timestamp} timestamp.",
                record,
            ))
            continue
        accepted.append(copy.deepcopy(record))

    if envelope is None:
        data: Any = accepted
    else:
        envelope["items"] = accepted
        data = envelope
    warnings = (
        (f"Provider domain '{domain}' retained {len(accepted)} valid records and rejected {len(rejected)} malformed records.",)
        if rejected and accepted else ()
    )
    return ProviderPayloadValidation(data, tuple(rejected), warnings)


def _reject(index: int, code: str, message: str, record: object) -> dict[str, Any]:
    identity = record.get("id") if isinstance(record, dict) else None
    return {"index": index, "code": code, "message": message, "recordId": identity}


def validate_records(
    records: object,
    validator: Callable[[dict[str, Any], set[str] | None], tuple[dict[str, Any] | None, list[str]]],
    *,
    known_leagues: set[str] | None = None,
) -> RecordValidation:
    if not isinstance(records, list):
        return RecordValidation((), (_reject(0, "collection_type", "Records must be a list.", records),), ())
    accepted: list[dict[str, Any]] = []
    rejected: list[dict[str, Any]] = []
    warnings: list[str] = []
    seen: set[str] = set()
    for index, record in enumerate(records):
        if not isinstance(record, dict):
            rejected.append(_reject(index, "record_type", "Record must be an object.", record))
            continue
        try:
            normalized, record_warnings = validator(copy.deepcopy(record), known_leagues)
        except (TypeError, ValueError) as error:
            rejected.append(_reject(index, "validation_error", str(error), record))
            continue
        if normalized is None:
            rejected.append(_reject(index, "invalid_record", "Record failed validation.", record))
            continue
        identity = str(normalized.get("id") or normalized.get("event_id") or normalized.get("offer_id") or "")
        if identity and identity in seen:
            rejected.append(_reject(index, "duplicate_record", f"Duplicate record '{identity}'.", record))
            continue
        if identity:
            seen.add(identity)
        accepted.append(normalized)
        warnings.extend(record_warnings)
    return RecordValidation(tuple(accepted), tuple(rejected), tuple(warnings))


def validate_event(record: dict[str, Any], known_leagues: set[str] | None = None) -> tuple[dict[str, Any], list[str]]:
    event_id = str(record.get("event_id") or record.get("id") or "").strip()
    league_id = str(record.get("league_key") or record.get("league_id") or "").strip()
    if not event_id or not league_id:
        raise ValueError("Event requires event_id and league_key.")
    if known_leagues is not None and league_id not in known_leagues:
        raise ValueError(f"Unknown league '{league_id}'.")
    status = str(record.get("status") or "unknown").lower()
    if status not in EVENT_STATUSES:
        raise ValueError(f"Unknown event status '{status}'.")
    starts_at = record.get("starts_at") or record.get("start_time")
    if starts_at is not None and parse_timestamp(starts_at) is None:
        raise ValueError("Event timestamp is invalid.")
    participants = record.get("participants", [])
    if not isinstance(participants, list):
        raise ValueError("Event participants must be a list.")
    participant_ids: set[str] = set()
    for participant in participants:
        if not isinstance(participant, dict):
            raise ValueError("Event participant must be an object.")
        participant_id = str(participant.get("id") or "").strip()
        if not participant_id:
            raise ValueError("Event participant requires an ID.")
        if participant_id in participant_ids:
            raise ValueError("Event contains duplicate participants.")
        participant_ids.add(participant_id)
    venue = record.get("venue")
    if isinstance(venue, dict):
        latitude, longitude = venue.get("latitude"), venue.get("longitude")
        if latitude is not None and (not _finite(latitude) or not -90 <= float(latitude) <= 90):
            raise ValueError("Venue latitude is invalid.")
        if longitude is not None and (not _finite(longitude) or not -180 <= float(longitude) <= 180):
            raise ValueError("Venue longitude is invalid.")
    record.update({"event_id": event_id, "league_key": league_id, "status": status, "starts_at": starts_at, "participants": participants})
    return record, []


def validate_stat_row(record: dict[str, Any], known_leagues: set[str] | None = None) -> tuple[dict[str, Any], list[str]]:
    required = ("id", "entity_id", "league_id", "stat_id", "unit", "source")
    if any(not str(record.get(field) or "").strip() for field in required):
        raise ValueError("Stat row is missing a required identity, unit, or source.")
    if known_leagues is not None and record["league_id"] not in known_leagues:
        raise ValueError(f"Unknown league '{record['league_id']}'.")
    if record["unit"] not in STAT_UNITS:
        raise ValueError(f"Unsupported stat unit '{record['unit']}'.")
    if record.get("value") is not None and not _finite(record["value"]):
        raise ValueError("Stat value must be finite.")
    return record, []


def validate_market(record: dict[str, Any], known_leagues: set[str] | None = None) -> tuple[dict[str, Any], list[str]]:
    market_id = str(record.get("offer_id") or record.get("id") or "").strip()
    event_id = str(record.get("event_id") or "").strip()
    league_id = str(record.get("league_key") or record.get("league_id") or "").strip()
    provider_market_id = str(record.get("provider_market_id") or "").strip()
    canonical_market_id = str(record.get("canonical_market_id") or "").strip()
    source = str(record.get("source") or record.get("source_name") or "").strip()
    if not all((market_id, event_id, league_id, provider_market_id, canonical_market_id, source)):
        raise ValueError("Market is missing a required canonical/provider identity or source.")
    if known_leagues is not None and league_id not in known_leagues:
        raise ValueError(f"Unknown league '{league_id}'.")
    status = str(record.get("status") or "unavailable").lower()
    if status not in MARKET_STATUSES:
        raise ValueError("Market status is invalid.")
    settlement = str(record.get("settlement_scope") or "provider-rules")
    if settlement not in SETTLEMENT_SCOPES:
        raise ValueError("Market settlement scope is invalid.")
    selections = record.get("selections")
    if not isinstance(selections, list):
        raise ValueError("Market selections must be a list.")
    warnings: list[str] = []
    for selection in selections:
        if not isinstance(selection, dict) or not str(selection.get("selection_id") or selection.get("id") or "").strip():
            raise ValueError("Market selection requires an ID.")
        side = str(selection.get("side") or "").lower()
        if side not in MARKET_SIDES:
            raise ValueError(f"Unsupported market side '{side}'.")
        odds_format = str(selection.get("odds_format") or "american").lower()
        odds = selection.get("american_odds", selection.get("odds"))
        american = normalize_american_odds(odds, odds_format)
        if american is None:
            selection["available"] = False
            selection["american_odds"] = None
            warnings.append(f"Selection '{selection.get('selection_id') or selection.get('id')}' has invalid odds.")
        else:
            selection["american_odds"] = american
        if record.get("status") != "open":
            selection["available"] = False
    record.update({
        "offer_id": market_id, "event_id": event_id, "league_key": league_id,
        "provider_market_id": provider_market_id, "canonical_market_id": canonical_market_id,
        "source": source, "status": status, "settlement_scope": settlement, "selections": selections,
    })
    return record, warnings


def validate_status_record(record: dict[str, Any], known_leagues: set[str] | None = None) -> tuple[dict[str, Any], list[str]]:
    if not str(record.get("id") or "").strip() or not str(record.get("entity_id") or "").strip():
        raise ValueError("Status record requires canonical IDs.")
    confirmation = str(record.get("confirmation_state") or "unverified")
    if confirmation not in CONFIRMATION_STATES:
        raise ValueError("Status confirmation state is invalid.")
    for field in ("reported_at", "effective_at"):
        if record.get(field) and parse_timestamp(record[field]) is None:
            raise ValueError(f"Status {field} timestamp is invalid.")
    if not str(record.get("source") or "").strip():
        raise ValueError("Status source is required.")
    record["confirmation_state"] = confirmation
    return record, []


def normalize_american_odds(value: object, odds_format: str = "american") -> int | None:
    if isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(number):
        return None
    if odds_format == "decimal":
        if number <= 1:
            return None
        return round((number - 1) * 100 if number >= 2 else -100 / (number - 1))
    if odds_format != "american" or number == 0 or abs(number) < 100 or abs(number) > 100000:
        return None
    return round(number)


def _finite(value: object) -> bool:
    try:
        return math.isfinite(float(value))
    except (TypeError, ValueError):
        return False
