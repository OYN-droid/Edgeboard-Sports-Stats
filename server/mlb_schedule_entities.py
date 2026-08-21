from __future__ import annotations

import copy
from collections import Counter
import json
import threading
from dataclasses import dataclass
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Callable
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from .cache import CachePolicy, MemoryCache
from .edge_trust import evaluate_edge_trust, trust_from_provenance
from .errors import ProviderError, ProviderValidationError, ValidationError
from .provider_contracts import CapabilityDeclaration, ProvenanceEnvelope
from .shadow import compare_shadow


MLB_CONTRACT_VERSION = "edgeboard-mlb-schedule-entities-v1"
MLB_PROVIDER_ID = "edgeboard-mlb-contract-fixture"
VALID_ENTITY_TYPES = frozenset({"league", "team", "athlete", "manager", "venue", "game"})
STATUS_MAP = {
    "scheduled": "scheduled", "pregame": "scheduled", "pre_game": "scheduled", "in_progress": "live", "live": "live",
    "completed": "final", "final": "final", "postponed": "postponed", "cancelled": "cancelled",
    "canceled": "cancelled", "suspended": "suspended", "delayed": "delayed", "unknown": "unknown",
}
PUBLIC_SOURCE_MODES = {
    "fixture_only": "fixture", "internal_testing": "fixture", "shadow": "fixture",
    "limited_live": "live", "production": "live", "degraded": "degraded",
    "suspended": "offline", "disabled": "offline",
}


def compare_mlb_shadow(fixture: dict[str, Any], live: dict[str, Any]) -> list[dict[str, Any]]:
    """Compare normalized MLB fixture/live candidates without making the candidate primary."""
    if not isinstance(fixture, dict) or not isinstance(live, dict):
        return [{"category": "unsupported_comparison", "recordId": "*", "details": {}}]
    discrepancies: list[dict[str, Any]] = []
    fixture_entities = fixture.get("entities") if isinstance(fixture.get("entities"), list) else []
    live_entities = live.get("entities") if isinstance(live.get("entities"), list) else []
    _duplicate_discrepancies(fixture_entities, "duplicate_fixture", "entity", discrepancies)
    _duplicate_discrepancies(live_entities, "duplicate_live", "entity", discrepancies)
    fixture_entity_map = {item.get("id"): item for item in fixture_entities if isinstance(item, dict) and item.get("id")}
    live_entity_map = {item.get("id"): item for item in live_entities if isinstance(item, dict) and item.get("id")}
    for entity_id in sorted(set(fixture_entity_map) | set(live_entity_map)):
        first, second = fixture_entity_map.get(entity_id), live_entity_map.get(entity_id)
        if first is None:
            discrepancies.append({"category": "missing_fixture", "recordId": f"entity:{entity_id}", "details": {}})
        elif second is None:
            discrepancies.append({"category": "missing_live", "recordId": f"entity:{entity_id}", "details": {}})
        elif first.get("type") != second.get("type") or _identity_text(first.get("name")) != _identity_text(second.get("name")):
            discrepancies.append({
                "category": "identity_conflict", "recordId": f"entity:{entity_id}",
                "details": {"fixture": {"type": first.get("type"), "name": first.get("name")},
                            "live": {"type": second.get("type"), "name": second.get("name")}},
            })

    fixture_games = [item for item in fixture.get("games", []) if isinstance(item, dict)]
    live_games = [item for item in live.get("games", []) if isinstance(item, dict)]
    _duplicate_discrepancies(fixture_games, "duplicate_fixture", "event", discrepancies)
    _duplicate_discrepancies(live_games, "duplicate_live", "event", discrepancies)
    matches, missing_fixture, missing_live = _match_shadow_games(fixture_games, live_games)
    discrepancies.extend({"category": "missing_fixture", "recordId": item.get("id", "unknown"), "details": {}} for item in missing_fixture)
    discrepancies.extend({"category": "missing_live", "recordId": item.get("id", "unknown"), "details": {}} for item in missing_live)
    for first, second in matches:
        record_id = str(first.get("id") or second.get("id") or "unknown")
        first_participants, second_participants = _participant_roles(first), _participant_roles(second)
        if first_participants != second_participants:
            discrepancies.append({"category": "participant_conflict", "recordId": record_id,
                                  "details": {"fixture": first_participants, "live": second_participants}})
        first_time = _parsed_time(first.get("starts_at"))
        second_time = _parsed_time(second.get("starts_at"))
        if first_time and second_time and abs((first_time - second_time).total_seconds()) > 60:
            discrepancies.append({"category": "time_conflict", "recordId": record_id,
                                  "details": {"fixture": first.get("starts_at"), "live": second.get("starts_at")}})
        if first.get("status") != second.get("status"):
            discrepancies.append({"category": "status_conflict", "recordId": record_id,
                                  "details": {"fixture": first.get("status"), "live": second.get("status")}})
        first_venue = (first.get("venue") or {}).get("id") if isinstance(first.get("venue"), dict) else None
        second_venue = (second.get("venue") or {}).get("id") if isinstance(second.get("venue"), dict) else None
        if first_venue != second_venue:
            discrepancies.append({"category": "venue_conflict", "recordId": record_id,
                                  "details": {"fixture": first_venue, "live": second_venue}})
    return discrepancies


def _identity_text(value: Any) -> str:
    return " ".join(str(value or "").casefold().split())


def _duplicate_discrepancies(items: list[dict[str, Any]], category: str, kind: str, output: list[dict[str, Any]]) -> None:
    seen_ids: set[str] = set()
    seen_keys: set[tuple[Any, ...]] = set()
    for item in items:
        record_id = str(item.get("id") or "")
        semantic = _game_semantic_key(item) if kind == "event" else (record_id,)
        if (record_id and record_id in seen_ids) or (semantic and semantic in seen_keys):
            output.append({"category": category, "recordId": record_id or "unknown", "details": {"kind": kind}})
        if record_id:
            seen_ids.add(record_id)
        if semantic:
            seen_keys.add(semantic)


def _game_semantic_key(item: dict[str, Any]) -> tuple[Any, ...]:
    roles = _participant_roles(item)
    doubleheader = item.get("doubleheader") if isinstance(item.get("doubleheader"), dict) else {}
    return (item.get("schedule_date"), roles.get("away"), roles.get("home"), doubleheader.get("gameNumber"))


def _participant_roles(item: dict[str, Any]) -> dict[str, str]:
    return {
        str(value.get("role") or ""): str(value.get("id") or "")
        for value in item.get("participants", []) if isinstance(value, dict) and value.get("role")
    }


def _parsed_time(value: Any) -> datetime | None:
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else None
    except (TypeError, ValueError):
        return None


def _match_shadow_games(
    fixture: list[dict[str, Any]], live: list[dict[str, Any]],
) -> tuple[list[tuple[dict[str, Any], dict[str, Any]]], list[dict[str, Any]], list[dict[str, Any]]]:
    unmatched_fixture = list(fixture)
    unmatched_live = list(live)
    matches: list[tuple[dict[str, Any], dict[str, Any]]] = []
    for first in list(unmatched_fixture):
        second = next((item for item in unmatched_live if item.get("id") == first.get("id")), None)
        if second is not None:
            matches.append((first, second)); unmatched_fixture.remove(first); unmatched_live.remove(second)
    for first in list(unmatched_fixture):
        key = _game_semantic_key(first)
        second = next((item for item in unmatched_live if _game_semantic_key(item) == key), None)
        if second is not None:
            matches.append((first, second)); unmatched_fixture.remove(first); unmatched_live.remove(second)
    return matches, unmatched_live, unmatched_fixture


def mlb_ticket2_capabilities() -> tuple[CapabilityDeclaration, ...]:
    return tuple(CapabilityDeclaration(
        MLB_PROVIDER_ID, "baseball", "mlb", domain,
        support_state="fixture_supported", rollout_state="fixture_only",
        fixture_available=True, contract_confirmed=True,
        freshness_policy=domain, cache_policy=domain,
        limitations=("Deterministic MLB contract fixture; not live provider data.",),
    ) for domain in ("league_catalog", "entities", "teams", "schedules", "event_status", "event_details"))


def _iso(value: Any, field: str) -> str:
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError) as error:
        raise ProviderValidationError(f"Invalid {field} timestamp.") from error
    if parsed.tzinfo is None:
        raise ProviderValidationError(f"{field} must include a timezone offset.")
    return parsed.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _text(value: Any, field: str) -> str:
    result = str(value or "").strip()
    if not result:
        raise ProviderValidationError(f"Missing required field: {field}.")
    return result


@dataclass(frozen=True)
class RejectedRecord:
    domain: str
    index: int
    code: str
    provider_record_id: str | None

    def public(self) -> dict[str, Any]:
        return {"domain": self.domain, "index": self.index, "code": self.code}


class MlbScheduleEntityAdapter:
    """Provider-neutral MLB contract adapter. Provider IDs never leave this class."""

    def normalize(self, payload: Any, *, source_mode: str | None = None) -> dict[str, Any]:
        if not isinstance(payload, dict):
            raise ProviderValidationError("MLB provider response must be an object.")
        if payload.get("contractVersion") != MLB_CONTRACT_VERSION:
            raise ProviderValidationError("MLB provider contract version is unsupported.")
        provider = _text(payload.get("provider"), "provider")
        mode = source_mode or str(payload.get("sourceMode") or "fixture")
        if mode not in {"fixture", "sample", "live", "cached", "degraded", "offline"}:
            raise ProviderValidationError("MLB provider source mode is invalid.")
        validated_at = _iso(payload.get("recordedAt"), "recordedAt")
        league = payload.get("league")
        if not isinstance(league, dict) or league.get("canonicalId") != "mlb" or league.get("sportId") != "baseball":
            raise ProviderValidationError("MLB league identity failed validation.")

        entities, mappings, rejected = self._entities(payload.get("entities"), provider, mode, validated_at)
        games, game_mappings, game_rejected = self._games(
            payload.get("games"), entities, mappings, provider, mode, validated_at,
        )
        rejected.extend(game_rejected)
        mappings.update(game_mappings)
        now = datetime.now(timezone.utc)
        today = now.date().isoformat()
        upcoming = sum(
            event["status"] in {"scheduled", "delayed", "postponed", "suspended"}
            and event.get("schedule_date", "") >= today for event in games
        )
        league_trust = self._trust(provider, mode, validated_at, 1.0, ())
        league_provenance = self._provenance(provider, str(league.get("providerId") or "mlb"), mode, validated_at, 1.0, ())
        return {
            "provider": provider,
            "contractVersion": MLB_CONTRACT_VERSION,
            "sourceMode": mode,
            "validatedAt": validated_at,
            "attribution": str(payload.get("attribution") or provider),
            "league": {
                "id": "mlb", "sportId": "baseball", "displayName": _text(league.get("name"), "league.name"),
                "abbreviation": str(league.get("abbreviation") or "MLB"),
                "active": league.get("active") is not False,
                "seasonContext": league.get("seasonContext"),
                "source": provider, "sourceMode": mode,
                "provenance": self._public_provenance(league_provenance), "edgeTrust": league_trust,
            },
            "entities": entities,
            "games": games,
            "leagueStatus": {
                "league_key": "mlb", "availability_status": "active" if games else "unavailable",
                "live_event_count": sum(item["status"] == "live" for item in games),
                "today_event_count": sum(item.get("schedule_date") == today for item in games),
                "upcoming_event_count": upcoming, "available_market_count": 0, "player_prop_count": 0,
                "data_quality_status": mode if mode in {"fixture", "sample"} else "validated",
                "last_updated_at": validated_at,
                "status_label": "Sample provider data — not live" if mode == "sample" else "Validated contract fixture — not live" if mode == "fixture" else "Provider-backed schedule",
                "edge_trust": league_trust,
            },
            "rejected": [item.public() for item in rejected],
            "_providerMappings": mappings,
        }

    def _entities(self, raw: Any, provider: str, mode: str, validated_at: str) -> tuple[list[dict[str, Any]], dict[str, str], list[RejectedRecord]]:
        if not isinstance(raw, list):
            raise ProviderValidationError("MLB entities must be an array.")
        entities: list[dict[str, Any]] = []
        mappings: dict[str, str] = {}
        canonical_ids: set[str] = set()
        rejected: list[RejectedRecord] = []
        for index, item in enumerate(raw):
            provider_id = str(item.get("providerId") or "") if isinstance(item, dict) else ""
            try:
                if not isinstance(item, dict):
                    raise ProviderValidationError("Entity must be an object.")
                provider_id = _text(item.get("providerId"), "entity.providerId")
                canonical_id = _text(item.get("canonicalId"), "entity.canonicalId")
                entity_type = _text(item.get("type"), "entity.type")
                if entity_type not in VALID_ENTITY_TYPES - {"league", "game"}:
                    raise ProviderValidationError("Unknown MLB entity type.")
                if provider_id in mappings or canonical_id in canonical_ids:
                    raise ProviderValidationError("Duplicate MLB entity identity.")
                team_id = str(item.get("teamCanonicalId") or "")
                aliases = item.get("aliases") if isinstance(item.get("aliases"), list) else []
                warnings = tuple(str(value) for value in item.get("validationWarnings", []) if str(value).strip()) if isinstance(item.get("validationWarnings"), list) else ()
                identity_confidence = float(item.get("identityConfidence", 1.0))
                provenance = self._provenance(provider, provider_id, mode, validated_at, identity_confidence, warnings)
                entity = {
                    "id": canonical_id, "canonicalEntityId": canonical_id, "entityType": entity_type,
                    "type": entity_type, "name": _text(item.get("name"), "entity.name"),
                    "displayName": _text(item.get("name"), "entity.name"), "aliases": [str(value) for value in aliases if str(value).strip()],
                    "sportId": "baseball", "leagueId": "mlb", "teamId": team_id,
                    "active": item.get("active") is not False, "position": str(item.get("position") or ""),
                    "metadata": {key: item[key] for key in (
                        "abbreviation", "location", "timezone", "city", "region", "country", "nickname",
                        "division", "venueCanonicalId", "surface", "firstName", "lastName", "status",
                        "handedness", "jerseyNumber", "homeTeamCanonicalIds",
                    ) if item.get(key) not in (None, "")},
                    "source": provider, "sourceMode": mode, "providerUpdatedAt": validated_at,
                    "provenance": self._public_provenance(provenance), "edgeTrust": trust_from_provenance(provenance),
                }
                entities.append(entity)
                mappings[provider_id] = canonical_id
                canonical_ids.add(canonical_id)
            except (ProviderValidationError, ValueError, TypeError):
                rejected.append(RejectedRecord("entities", index, "invalid_entity", provider_id or None))
        return entities, mappings, rejected

    def _games(self, raw: Any, entities: list[dict[str, Any]], mappings: dict[str, str], provider: str, mode: str, validated_at: str) -> tuple[list[dict[str, Any]], dict[str, str], list[RejectedRecord]]:
        if not isinstance(raw, list):
            raise ProviderValidationError("MLB games must be an array.")
        by_id = {item["id"]: item for item in entities}
        games: list[dict[str, Any]] = []
        game_mappings: dict[str, str] = {}
        canonical_ids: set[str] = set()
        rejected: list[RejectedRecord] = []
        for index, item in enumerate(raw):
            provider_id = str(item.get("providerId") or "") if isinstance(item, dict) else ""
            try:
                if not isinstance(item, dict):
                    raise ProviderValidationError("Game must be an object.")
                provider_id = _text(item.get("providerId"), "game.providerId")
                canonical_id = _text(item.get("canonicalId"), "game.canonicalId")
                if provider_id in game_mappings or canonical_id in canonical_ids:
                    raise ProviderValidationError("Duplicate MLB game identity.")
                status = STATUS_MAP.get(str(item.get("status") or "").lower())
                if status is None:
                    raise ProviderValidationError("Unknown MLB game status.")
                starts_at = _iso(item.get("startTime"), "game.startTime")
                schedule_date = date.fromisoformat(_text(item.get("date"), "game.date")).isoformat()
                timezone_name = _text(item.get("timezone"), "game.timezone")
                try:
                    local_zone = ZoneInfo(timezone_name)
                except ZoneInfoNotFoundError as error:
                    raise ProviderValidationError("Unknown MLB game timezone.") from error
                local_date = datetime.fromisoformat(starts_at.replace("Z", "+00:00")).astimezone(local_zone).date().isoformat()
                if local_date != schedule_date:
                    raise ProviderValidationError("MLB schedule date does not match venue-local start time.")
                away_id = mappings.get(str(item.get("awayTeamProviderId") or ""))
                home_id = mappings.get(str(item.get("homeTeamProviderId") or ""))
                if not away_id or not home_id or by_id.get(away_id, {}).get("type") != "team" or by_id.get(home_id, {}).get("type") != "team":
                    raise ProviderValidationError("MLB game references an unknown team.")
                venue_id = mappings.get(str(item.get("venueProviderId") or ""))
                warnings = [str(value) for value in item.get("validationWarnings", []) if str(value).strip()] if isinstance(item.get("validationWarnings"), list) else []
                if venue_id and by_id.get(venue_id, {}).get("type") != "venue":
                    raise ProviderValidationError("MLB game venue identity is invalid.")
                if not venue_id:
                    warnings.append("Venue unavailable from provider.")
                game_number = item.get("doubleheaderGame")
                if game_number is not None and game_number not in {1, 2}:
                    raise ProviderValidationError("Doubleheader game number must be one or two.")
                updated_at = _iso(item.get("providerUpdatedAt") or validated_at, "game.providerUpdatedAt")
                identity_confidence = float(item.get("identityConfidence", 1.0))
                provenance = self._provenance(provider, provider_id, mode, updated_at, identity_confidence, tuple(warnings))
                away, home = by_id[away_id], by_id[home_id]
                venue = by_id.get(venue_id)
                games.append({
                    "event_id": canonical_id, "id": canonical_id, "league_key": "mlb", "leagueId": "mlb",
                    "event_type": "team", "status": status, "status_detail": str(item.get("statusDetail") or ""),
                    "starts_at": starts_at, "schedule_date": schedule_date, "timezone": timezone_name,
                    "participants": [
                        {"id": away_id, "name": away["name"], "short_name": away["metadata"].get("abbreviation", away["name"]), "role": "away", "participant_type": "team"},
                        {"id": home_id, "name": home["name"], "short_name": home["metadata"].get("abbreviation", home["name"]), "role": "home", "participant_type": "team"},
                    ],
                    "venue": ({"id": venue_id, "name": venue["name"], **venue["metadata"]} if venue else None),
                    "doubleheader": {"gameNumber": game_number, "isDoubleheader": game_number is not None},
                    "season": item.get("season"), "seasonType": item.get("seasonType"),
                    "series": ({"id": item.get("seriesId"), "gameNumber": item.get("seriesGameNumber")} if item.get("seriesId") else None),
                    "source": provider, "source_mode": mode, "provider_updated_at": updated_at,
                    "display": {"title": f'{away["name"]} at {home["name"]}', "featured": True},
                    "provenance": self._public_provenance(provenance), "edgeTrust": trust_from_provenance(provenance),
                })
                game_mappings[provider_id] = canonical_id
                canonical_ids.add(canonical_id)
            except (ProviderValidationError, ValueError, TypeError):
                rejected.append(RejectedRecord("schedules", index, "invalid_game", provider_id or None))
        return games, game_mappings, rejected

    @staticmethod
    def _provenance(provider: str, provider_record_id: str, mode: str, updated_at: str, confidence: float, warnings: tuple[str, ...]) -> ProvenanceEnvelope:
        freshness = "fixture" if mode in {"fixture", "sample"} else "fresh"
        return ProvenanceEnvelope(
            provider_id=provider, provider_record_id=provider_record_id, source_mode=mode,
            fetched_at=updated_at, provider_updated_at=updated_at, normalized_at=updated_at,
            validated_at=updated_at, freshness_state=freshness,
            completeness_state="partial" if warnings else "complete", identity_confidence=confidence,
            correction_status="current", provider_agreement_state="unavailable", validation_warnings=warnings,
            source_version=MLB_CONTRACT_VERSION, schema_version=MLB_CONTRACT_VERSION,
        )

    @classmethod
    def _trust(cls, provider: str, mode: str, updated_at: str, confidence: float, warnings: tuple[str, ...]) -> dict[str, Any]:
        return trust_from_provenance(cls._provenance(provider, "mlb", mode, updated_at, confidence, warnings))

    @staticmethod
    def _public_provenance(provenance: ProvenanceEnvelope) -> dict[str, Any]:
        result = provenance.to_dict()
        result.pop("providerRecordId", None)
        return result


class MlbScheduleEntityService:
    """Cached, provider-bound MLB schedule/entity read model."""

    def __init__(
        self, cache: MemoryCache, rollout: Any, shadow: Any, *,
        payload_loader: Callable[[], dict[str, Any]] | None = None,
        live_payload_loader: Callable[[], dict[str, Any]] | None = None,
        payload_source_mode: str = "fixture",
        cache_provider_id: str = MLB_PROVIDER_ID,
        fallback_payload_loader: Callable[[], dict[str, Any]] | None = None,
        shadow_validator: Callable[..., tuple[dict[str, Any] | None, list[dict[str, Any]], ProviderError | None]] | None = None,
        identity_service: Any | None = None,
    ):
        self.cache = cache
        self.rollout = rollout
        self.shadow = shadow
        self.adapter = MlbScheduleEntityAdapter()
        self.payload_loader = payload_loader or self._fixture
        self.live_payload_loader = live_payload_loader
        self.payload_source_mode = payload_source_mode
        self.cache_provider_id = cache_provider_id
        self.fallback_payload_loader = fallback_payload_loader
        self.shadow_validator = shadow_validator
        self.identity_service = identity_service
        self._lock = threading.Lock()
        self._shadow_lock = threading.Lock()
        self.provider_requests = 0
        self.shadow_provider_requests = 0
        self._last_shadow_report: dict[str, Any] | None = None

    @staticmethod
    def _fixture() -> dict[str, Any]:
        path = Path(__file__).parent / "fixtures" / "mlb_schedule_entities_ticket2.json"
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)

    def read(self, *, refresh: bool = False) -> dict[str, Any]:
        rollout = self.rollout.get("mlb")
        state = rollout["rolloutState"]
        mode = PUBLIC_SOURCE_MODES.get(state, "offline")
        cache_key = CachePolicy.key(MLB_CONTRACT_VERSION, self.cache_provider_id, "schedules", "mlb")
        if not refresh:
            cached, _ = self.cache.get(cache_key)
            if cached is not None:
                return cached
        with self._lock:
            if not refresh:
                cached, _ = self.cache.get(cache_key)
                if cached is not None:
                    return cached
            # A provider-specific loader may be injected server-side after its contract is reviewed.
            # Without one, live states fail closed rather than relabeling fixtures.
            if mode in {"live", "degraded"} and self.live_payload_loader is None:
                raise ProviderValidationError("MLB live schedule/entity adapter is not configured and certified.")
            self.provider_requests += 1
            loader = self.live_payload_loader if mode in {"live", "degraded"} else self.payload_loader
            fallback_reason = ""
            try:
                raw = loader()
                source_mode = "degraded" if mode == "degraded" else mode if mode in {"live", "offline"} else self.payload_source_mode
                normalized = self.adapter.normalize(raw, source_mode=source_mode)
            except ProviderError as error:
                if mode in {"live", "degraded"} or self.fallback_payload_loader is None:
                    raise
                fallback_reason = error.code
                normalized = self.adapter.normalize(self.fallback_payload_loader(), source_mode="fixture")
            public = self._public(normalized, state)
            if fallback_reason:
                public["source"].update({
                    "fallbackUsed": True,
                    "fallbackReason": fallback_reason,
                    "notice": "SportsDataIO trial data was unavailable. EdgeBoard is showing its validated fixture fallback, not live data.",
                })
            self.cache.set(cache_key, public, 300, 3600, tags=("league:mlb", "domain:schedules", "domain:entities"))
            return copy.deepcopy(public)

    def schedule(self, *, selected_date: str = "", status: str = "") -> dict[str, Any]:
        data = self.read()
        if selected_date:
            try:
                date.fromisoformat(selected_date)
            except ValueError as error:
                raise ValidationError("Schedule date must use YYYY-MM-DD.") from error
        items = [item for item in data["games"] if (not selected_date or item["schedule_date"] == selected_date) and (not status or item["status"] == status)]
        return {"items": items, "source": data["source"], "edgeTrust": data["edgeTrust"], "rejected": data["rejected"]}

    def search(self, query: str) -> dict[str, Any]:
        data = self.read()
        term = " ".join(str(query or "").casefold().split())
        items = data["entities"] if not term else [
            item for item in data["entities"]
            if any(term in str(value).casefold() for value in [item["id"], item["displayName"], *item.get("aliases", [])])
        ]
        if self.identity_service and term:
            known = {item["id"] for item in items}
            items.extend(item for item in self.identity_service.public_entities(query, limit=25) if item["id"] not in known)
        return {"items": items[:25], "source": data["source"], "edgeTrust": data["edgeTrust"]}

    def entity(self, canonical_id: str) -> dict[str, Any] | None:
        found = next((item for item in self.read()["entities"] if item["id"] == canonical_id), None)
        if found or not self.identity_service:
            return found
        items = self.identity_service.public_entities(canonical_id=canonical_id, limit=1)
        return items[0] if items else None

    def game(self, canonical_id: str) -> dict[str, Any] | None:
        return next((item for item in self.read()["games"] if item["id"] == canonical_id), None)

    def provider_bundle(self, base: dict[str, Any]) -> dict[str, Any]:
        data = self.read()
        bundle = copy.deepcopy(base)
        bundle["events"] = [item for item in bundle.get("events", []) if item.get("league_key") != "mlb"] + data["games"]
        bundle["league_statuses"] = [item for item in bundle.get("league_statuses", []) if item.get("league_key") != "mlb"] + [data["leagueStatus"]]
        bundle["entities"] = data["entities"]
        bundle["provider_status"] = {
            **bundle.get("provider_status", {}),
            "schedule_entity_source": data["source"],
            "schedule_entity_edge_trust": data["edgeTrust"],
        }
        return bundle

    def compare_shadow_candidate(self, candidate: dict[str, Any], provider: str) -> dict[str, Any]:
        if self.rollout.get("mlb")["rolloutState"] != "shadow":
            raise ValidationError("MLB shadow comparison requires the shadow rollout state.")
        normalized = self.adapter.normalize(candidate, source_mode="live")
        fixture = self.read()
        discrepancies = [
            *compare_shadow({"items": fixture["games"]}, {"items": normalized["games"]}, domain="schedules"),
            *compare_shadow({"items": fixture["entities"]}, {"items": normalized["entities"]}, domain="entities"),
        ]
        self.shadow.record("mlb", "schedules", MLB_PROVIDER_ID, provider, discrepancies)
        return {"exposedAsPrimary": False, "discrepancies": discrepancies, "accepted": len(normalized["games"]), "rejected": normalized["rejected"]}

    def run_shadow_validation(
        self, *, start_date: str = "", end_date: str = "", refresh: bool = False,
    ) -> dict[str, Any]:
        if self.rollout.get("mlb")["rolloutState"] != "shadow":
            raise ValidationError("SportsDataIO validation requires the MLB shadow rollout state.")
        if self.shadow_validator is None:
            raise ValidationError("No MLB shadow provider is configured.")
        first = self._date_or_none(start_date)
        last = self._date_or_none(end_date)
        scope = f"{start_date or 'default'}:{end_date or start_date or 'default'}"
        cache_key = CachePolicy.key(MLB_CONTRACT_VERSION, "sportsdataio", "shadow_schedule_entities", scope)
        candidate = None
        endpoints: list[dict[str, Any]] = []
        required_error: ProviderError | None = None
        cache_state = "miss"
        if not refresh:
            cached, cache_state = self.cache.get(cache_key)
            if isinstance(cached, dict):
                candidate = cached.get("candidate")
                endpoints = cached.get("endpoints", [])
        if candidate is None:
            with self._shadow_lock:
                if not refresh:
                    cached, cache_state = self.cache.get(cache_key)
                    if isinstance(cached, dict):
                        candidate = cached.get("candidate")
                        endpoints = cached.get("endpoints", [])
                if candidate is None:
                    self.shadow_provider_requests += 1
                    candidate, endpoints, required_error = self.shadow_validator(start_date=first, end_date=last)
                    if candidate is not None:
                        ttl = self._shadow_ttl(candidate)
                        self.cache.set(
                            cache_key, {"candidate": candidate, "endpoints": endpoints}, ttl, 3600,
                            private=True, tags=("provider:sportsdataio", "league:mlb", "domain:shadow_schedule_entities"),
                        )
                        cache_state = "miss"
                    else:
                        stale, stale_state = self.cache.get(cache_key, allow_stale=True)
                        if isinstance(stale, dict):
                            candidate = stale.get("candidate")
                            cache_state = "stale-if-error"
                            endpoints = endpoints or stale.get("endpoints", [])
        unavailable = [
            item for item in endpoints
            if not item["status"].startswith("authenticated_") and item["status"] != "cached_fresh"
        ]
        if candidate is None:
            report = {
                "provider": "sportsdataio", "exposedAsPrimary": False,
                "primarySource": "edgeboard-mlb-contract-fixture", "candidateMode": "discovery_lab_shadow",
                "endpoints": endpoints,
                "normalization": {"accepted": False, "games": 0, "entities": 0, "rejected": 0},
                "canonicalIds": {"valid": False, "reason": required_error.code if required_error else "provider_error"},
                "discrepancies": {"total": 0, "recorded": 0, "categories": {}},
                "edgeTrust": evaluate_edge_trust(
                    {"freshness": "unavailable", "coverage": "unavailable", "identity": "not_started", "provider_agreement": "not_started"},
                    applicable={"freshness", "coverage", "identity", "provider_agreement"}, sample=True,
                ),
                "cache": {"state": cache_state, "keyScope": scope, "private": True},
                "limitations": ["Required SportsDataIO schedule/entity access is unavailable; the validated fixture remains primary."],
            }
            self._last_shadow_report = copy.deepcopy(report)
            return report

        normalized = self.adapter.normalize(candidate, source_mode="sample")
        fixture = self.adapter.normalize(self._fixture(), source_mode="fixture")
        schedule_dates = sorted(
            item["scope"] for item in endpoints
            if item.get("domain") == "schedules" and isinstance(item.get("scope"), str)
        )
        fixture_for_comparison = copy.deepcopy(fixture)
        if schedule_dates:
            fixture_for_comparison["games"] = [
                item for item in fixture["games"]
                if schedule_dates[0] <= item.get("schedule_date", "") <= schedule_dates[-1]
            ]
        discrepancies = compare_mlb_shadow(fixture_for_comparison, normalized)
        recorded = self.shadow.record(
            "mlb", "schedule_entities", MLB_PROVIDER_ID, normalized["provider"], discrepancies,
        )
        canonical = self._canonical_validation(normalized)
        provider_validation = candidate.get("validationReport") if isinstance(candidate.get("validationReport"), dict) else {}
        unresolved = provider_validation.get("unresolvedMappings") if isinstance(provider_validation.get("unresolvedMappings"), list) else []
        canonical.update({
            "unresolvedMappingCount": int(provider_validation.get("unresolvedMappingCount") or 0),
            "unresolvedMappings": copy.deepcopy(unresolved[:50]),
            "unresolvedMappingsTruncated": bool(provider_validation.get("unresolvedMappingsTruncated")),
            "identityMetrics": copy.deepcopy(provider_validation.get("identityMetrics") or {}),
        })
        categories = dict(sorted(Counter(item["category"] for item in discrepancies).items()))
        trust = evaluate_edge_trust(
            {
                "freshness": "cached_stale" if cache_state == "stale-if-error" else "sample",
                "coverage": "partial" if unavailable else "passing",
                "identity": "passing" if canonical["valid"] else "failing",
                "provider_agreement": "partial" if discrepancies else "passing",
            },
            applicable={"freshness", "coverage", "identity", "provider_agreement"},
            conflicts=discrepancies[:25], sample=True, last_validation=normalized["validatedAt"],
        )
        report = {
            "provider": normalized["provider"], "exposedAsPrimary": False,
            "primarySource": fixture["provider"], "candidateMode": "discovery_lab_shadow",
            "endpoints": endpoints,
            "normalization": {
                "accepted": True,
                "league": 1,
                "teams": sum(item["type"] == "team" for item in normalized["entities"]),
                "venues": sum(item["type"] == "venue" for item in normalized["entities"]),
                "players": sum(item["type"] == "athlete" for item in normalized["entities"]),
                "managers": sum(item["type"] == "manager" for item in normalized["entities"]),
                "games": len(normalized["games"]), "entities": len(normalized["entities"]),
                "rejected": len(normalized["rejected"]) + int(provider_validation.get("rejectedCount") or 0),
                "contractRejected": len(normalized["rejected"]),
                "providerRejected": int(provider_validation.get("rejectedCount") or 0),
                "duplicateProviderRecords": int(provider_validation.get("duplicateProviderRecords") or 0),
                "rejectedByDomain": dict(sorted(Counter(item["domain"] for item in normalized["rejected"]).items())),
                "timezoneAssumptions": copy.deepcopy(provider_validation.get("timezoneAssumptions") or []),
            },
            "canonicalIds": canonical,
            "discrepancies": {
                "total": len(discrepancies), "recorded": recorded, "categories": categories,
                "items": copy.deepcopy(discrepancies[:200]),
                "itemsTruncated": len(discrepancies) > 200,
            },
            "edgeTrust": trust,
            "cache": {"state": cache_state, "keyScope": scope, "private": True, "providerRequests": self.shadow_provider_requests},
            "limitations": [
                "Discovery Lab values may be scrambled and are not user-visible primary data.",
                "Fixture coverage is intentionally narrow, so missing-primary differences are expected and require review.",
                *(["One or more endpoints may be unavailable to the configured plan; fixture coverage was preserved."] if unavailable else []),
                *(["A stale normalized shadow candidate was used after a provider error; it remained diagnostic only."] if cache_state == "stale-if-error" else []),
            ],
        }
        self._last_shadow_report = copy.deepcopy(report)
        return report

    def shadow_diagnostics(self) -> dict[str, Any]:
        rollout_state = self.rollout.get("mlb")["rolloutState"]
        provider = getattr(self.shadow_validator, "__self__", None) if self.shadow_validator else None
        configuration_errors, configuration_warnings = provider.validate_configuration() if provider else (("No shadow provider configured.",), ())
        return {
            "provider": "SportsDataIO" if provider else "Not configured",
            "configurationValid": not configuration_errors,
            "configurationErrors": list(configuration_errors),
            "configurationWarnings": list(configuration_warnings),
            "currentRolloutState": rollout_state,
            "providerHealth": provider.health_status() if provider else {"state": "not_configured", "liveVerified": False},
            "cache": self.cache.diagnostics(),
            "providerRequests": self.shadow_provider_requests,
            "lastReport": copy.deepcopy(self._last_shadow_report),
            "candidateExposedAsPrimary": False,
        }

    @staticmethod
    def _date_or_none(value: str) -> date | None:
        if not value:
            return None
        try:
            return date.fromisoformat(value)
        except ValueError as error:
            raise ValidationError("MLB shadow dates must use YYYY-MM-DD.") from error

    @staticmethod
    def _shadow_ttl(candidate: dict[str, Any]) -> int:
        statuses = {str(item.get("status") or "").casefold() for item in candidate.get("games", []) if isinstance(item, dict)}
        if statuses & {"delayed", "postponed", "suspended", "in_progress"}:
            return 60
        if statuses and statuses <= {"completed", "final", "cancelled"}:
            return 3600
        return 300

    @staticmethod
    def _canonical_validation(data: dict[str, Any]) -> dict[str, Any]:
        entities = data["entities"]
        games = data["games"]
        entity_ids = [item["id"] for item in entities]
        game_ids = [item["id"] for item in games]
        team_ids = {item["id"] for item in entities if item["type"] == "team"}
        invalid_references = sum(
            participant.get("id") not in team_ids
            for game in games for participant in game.get("participants", [])
            if participant.get("participant_type") == "team"
        )
        public_records = json.dumps({"entities": entities, "games": games}, separators=(",", ":"))
        provider_ids_exposed = any(marker in public_records for marker in (
            "sportsdataio:team:", "sportsdataio:player:", "sportsdataio:venue:",
            "sportsdataio:manager:", "sportsdataio:game:", "providerRecordId",
        ))
        valid = (
            len(entity_ids) == len(set(entity_ids))
            and len(game_ids) == len(set(game_ids))
            and invalid_references == 0
            and not provider_ids_exposed
        )
        return {
            "valid": valid,
            "uniqueEntityIds": len(entity_ids) == len(set(entity_ids)),
            "uniqueGameIds": len(game_ids) == len(set(game_ids)),
            "invalidTeamReferences": invalid_references,
            "providerIdsExposed": provider_ids_exposed,
        }

    def refresh(self) -> dict[str, Any]:
        self.cache.invalidate(tag="league:mlb")
        return self.read(refresh=True)

    @staticmethod
    def _public(data: dict[str, Any], rollout_state: str) -> dict[str, Any]:
        fixture = data["sourceMode"] == "fixture"
        sample = data["sourceMode"] == "sample"
        sportsdataio_trial = data["provider"] == "sportsdataio" and data["sourceMode"] == "sample"
        certified = rollout_state == "production" and data["sourceMode"] == "live"
        return {
            key: copy.deepcopy(value) for key, value in data.items()
            if key != "_providerMappings"
        } | {
            "source": {
                "provider": data["provider"], "mode": data["sourceMode"], "rolloutState": rollout_state,
                "last_updated_at": data["validatedAt"],
                "validation": "certified_live" if certified else "validated_sample" if sample else "validated_fixture" if fixture else "validated_limited_live",
                "coverage": ["league", "teams", "venues", "athletes", "managers", "schedules", "game_status"],
                "sample": sample, "fixture": fixture, "certifiedLive": certified,
                "notice": (
                    "Certified live MLB schedules and entities. Betting domains are not included."
                    if certified else "Limited live MLB schedules and entities. Other domains remain fixture-backed."
                    if data["sourceMode"] == "live" else "SportsDataIO free-trial MLB data is scrambled/sample data — not certified live data."
                    if sportsdataio_trial else "Validated contract fixture — not live data. Betting domains are not included."
                ),
            },
            "edgeTrust": data["league"]["edgeTrust"],
        }
