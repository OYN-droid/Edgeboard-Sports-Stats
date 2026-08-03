from __future__ import annotations

import copy
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from .freshness import parse_timestamp


EVENT_STATUSES = {"scheduled", "live", "postponed", "cancelled", "abandoned", "final", "suspended", "unknown"}
COLLECTION_KEYS = (
    "league_statuses",
    "events",
    "offers",
    "team_statistics",
    "player_statistics",
    "injuries",
    "lineups",
    "weather",
    "line_movements",
    "combat_cards",
    "motorsport_sessions",
)


@dataclass(frozen=True)
class ValidationResult:
    data: dict[str, Any]
    errors: tuple[str, ...]
    warnings: tuple[str, ...]
    partial: bool


def _iso(value: object) -> str | None:
    parsed = parse_timestamp(value)
    return parsed.isoformat().replace("+00:00", "Z") if parsed else None


def _valid_odds(value: object) -> int | None:
    if isinstance(value, bool):
        return None
    try:
        odds = float(value)
    except (TypeError, ValueError):
        return None
    if not odds or abs(odds) < 100:
        return None
    return round(odds)


def validate_normalized_bundle(bundle: object, now: datetime | None = None) -> ValidationResult:
    current = now or datetime.now(timezone.utc)
    if not isinstance(bundle, dict):
        return ValidationResult(
            data={key: [] for key in COLLECTION_KEYS},
            errors=("Provider bundle must be an object.",),
            warnings=(),
            partial=True,
        )

    data = copy.deepcopy(bundle)
    errors: list[str] = []
    warnings: list[str] = []
    partial = False
    for key in COLLECTION_KEYS:
        if key not in data:
            data[key] = []
            warnings.append(f"Missing collection '{key}' was replaced with an empty collection.")
            partial = True
        elif not isinstance(data[key], list):
            data[key] = []
            errors.append(f"Collection '{key}' must be a list.")
            partial = True

    deduplicated_events: dict[str, dict[str, Any]] = {}
    for index, event in enumerate(data["events"]):
        if not isinstance(event, dict):
            errors.append(f"Event at index {index} must be an object.")
            partial = True
            continue
        event_id = str(event.get("event_id") or "").strip()
        league_key = str(event.get("league_key") or "").strip()
        if not event_id or not league_key:
            errors.append(f"Event at index {index} is missing event_id or league_key.")
            partial = True
            continue
        normalized = copy.deepcopy(event)
        status = str(normalized.get("status") or "unknown").lower()
        normalized["status"] = status if status in EVENT_STATUSES else "unknown"
        if status not in EVENT_STATUSES:
            warnings.append(f"Event '{event_id}' had unknown status '{status}'.")
            partial = True
        normalized["starts_at"] = _iso(normalized.get("starts_at"))
        normalized["participants"] = normalized.get("participants") if isinstance(normalized.get("participants"), list) else []
        prior = deduplicated_events.get(event_id)
        if prior:
            warnings.append(f"Duplicate event '{event_id}' was merged.")
            old_start = prior.get("starts_at")
            new_start = normalized.get("starts_at")
            if old_start and new_start and old_start != new_start:
                normalized["previous_starts_at"] = old_start
                normalized["schedule_changed"] = True
            merged = {**prior, **normalized}
            deduplicated_events[event_id] = merged
            partial = True
        else:
            deduplicated_events[event_id] = normalized
    data["events"] = list(deduplicated_events.values())

    event_statuses = {event["event_id"]: event["status"] for event in data["events"]}
    validated_offers: list[dict[str, Any]] = []
    for index, offer in enumerate(data["offers"]):
        if not isinstance(offer, dict):
            errors.append(f"Offer at index {index} must be an object.")
            partial = True
            continue
        normalized = copy.deepcopy(offer)
        normalized["offer_id"] = str(normalized.get("offer_id") or f"unknown-offer-{index}")
        normalized["event_id"] = str(normalized.get("event_id") or "")
        selections = normalized.get("selections") if isinstance(normalized.get("selections"), list) else []
        valid_selections = []
        seen_selection_ids: set[str] = set()
        for selection_index, selection in enumerate(selections):
            if not isinstance(selection, dict):
                warnings.append(f"Offer '{normalized['offer_id']}' contains a malformed selection.")
                partial = True
                continue
            item = copy.deepcopy(selection)
            selection_id = str(item.get("selection_id") or f"{normalized['offer_id']}-{selection_index}")
            if selection_id in seen_selection_ids:
                warnings.append(f"Duplicate selection '{selection_id}' was ignored.")
                partial = True
                continue
            seen_selection_ids.add(selection_id)
            item["selection_id"] = selection_id
            item["last_updated_at"] = _iso(item.get("last_updated_at"))
            odds = _valid_odds(item.get("american_odds"))
            if odds is None:
                item["american_odds"] = None
                item["available"] = False
                item["data_quality_warning"] = "Malformed or unavailable odds."
                warnings.append(f"Selection '{selection_id}' has malformed odds.")
                partial = True
            else:
                item["american_odds"] = odds
            valid_selections.append(item)
        normalized["selections"] = valid_selections
        if event_statuses.get(normalized["event_id"]) in {"postponed", "cancelled", "abandoned"}:
            normalized["status"] = "suspended"
            for selection in normalized["selections"]:
                selection["available"] = False
                selection["data_quality_warning"] = f"Event is {event_statuses[normalized['event_id']]}."
        validated_offers.append(normalized)
    data["offers"] = validated_offers

    generated_at = _iso(data.get("generated_at")) or current.isoformat().replace("+00:00", "Z")
    data["generated_at"] = generated_at
    status = data.get("provider_status") if isinstance(data.get("provider_status"), dict) else {}
    status["provider"] = str(status.get("provider") or data.get("provider") or "unknown")
    status["last_updated_at"] = _iso(status.get("last_updated_at")) or generated_at
    status["last_successful_update_at"] = _iso(status.get("last_successful_update_at"))
    status["partial"] = bool(status.get("partial") or partial)
    status["offline_fallback"] = bool(status.get("offline_fallback"))
    status["state"] = str(status.get("state") or ("partial" if status["partial"] else "fresh"))
    status["sources"] = status.get("sources") if isinstance(status.get("sources"), list) else []
    status["validation_errors"] = [*status.get("validation_errors", []), *errors]
    status["validation_warnings"] = [*status.get("validation_warnings", []), *warnings]
    data["provider_status"] = status
    return ValidationResult(data=data, errors=tuple(errors), warnings=tuple(warnings), partial=partial)
