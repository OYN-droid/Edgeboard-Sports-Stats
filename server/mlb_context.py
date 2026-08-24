from __future__ import annotations

import copy
import hashlib
import json
import math
import threading
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from .cache import CachePolicy, MemoryCache
from .edge_trust import evaluate_edge_trust
from .errors import ProviderError, ProviderValidationError, ValidationError
from .mlb_domain_service import MlbDomainService
from .provider_contracts import CapabilityDeclaration


MLB_CONTEXT_CONTRACT_VERSION = "edgeboard-mlb-context-v1"
MLB_CONTEXT_FIXTURE_PROVIDER = "edgeboard-mlb-context-fixture"

AVAILABILITY_STATES = frozenset({
    "available", "probable", "questionable", "doubtful", "out", "inactive",
    "suspended", "injured_list", "day_to_day", "unknown",
})
ROSTER_STATES = frozenset({
    "active", "inactive", "injured_list", "minor_league", "designated",
    "released", "traded", "free_agent", "suspended", "unknown",
})
LINEUP_STATES = frozenset({"unavailable", "projected", "probable", "confirmed", "changed", "stale", "conflicting"})
STARTER_STATES = frozenset({"projected", "probable", "confirmed", "changed", "unavailable", "stale", "conflicting"})
WEATHER_STATES = frozenset({"forecast", "observed", "unavailable", "stale", "conflicting"})
CONTEXT_EVENT_TYPES = frozenset({
    "availability_change", "injury_report", "injury_cleared", "roster_change",
    "lineup_posted", "lineup_confirmed", "lineup_changed", "starter_announced",
    "starter_confirmed", "starter_changed", "weather_forecast", "weather_update",
    "game_delay", "game_postponed", "transaction", "provider_correction",
})


def mlb_ticket8_capabilities() -> tuple[CapabilityDeclaration, ...]:
    return tuple(CapabilityDeclaration(
        MLB_CONTEXT_FIXTURE_PROVIDER, "baseball", "mlb", domain,
        support_state="fixture_supported", rollout_state="fixture_only",
        fixture_available=True, contract_confirmed=True, freshness_policy=domain,
        cache_policy=domain, retention_policy="normalized-only",
        limitations=("Deterministic Ticket 8 context fixture; not live provider data.",),
    ) for domain in ("injuries", "availability", "rosters", "projected_lineups", "confirmed_lineups", "weather"))


def _iso(value: Any, field: str) -> str:
    try:
        parsed = datetime.fromisoformat(str(value or "").replace("Z", "+00:00"))
    except ValueError as error:
        raise ProviderValidationError(f"MLB context {field} is invalid.") from error
    if parsed.tzinfo is None:
        raise ProviderValidationError(f"MLB context {field} requires a timezone.")
    return parsed.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _text(value: Any, field: str) -> str:
    result = str(value or "").strip()
    if not result:
        raise ProviderValidationError(f"MLB context {field} is required.")
    return result


def _number(value: Any, field: str, *, minimum: float | None = None, maximum: float | None = None) -> float | None:
    if value in (None, ""):
        return None
    if isinstance(value, bool):
        raise ProviderValidationError(f"MLB context {field} must be numeric.")
    try:
        result = float(value)
    except (TypeError, ValueError) as error:
        raise ProviderValidationError(f"MLB context {field} must be numeric.") from error
    if not math.isfinite(result) or minimum is not None and result < minimum or maximum is not None and result > maximum:
        raise ProviderValidationError(f"MLB context {field} is outside the supported range.")
    return result


def _id(prefix: str, *parts: Any) -> str:
    digest = hashlib.sha256("|".join(str(part or "") for part in parts).encode()).hexdigest()[:20]
    return f"{prefix}-{digest}"


def _freshness(updated_at: str, event_starts_at: str | None, reference: datetime) -> dict[str, Any]:
    updated = datetime.fromisoformat(updated_at.replace("Z", "+00:00"))
    age = max(0, int((reference - updated).total_seconds()))
    threshold = 1800
    if event_starts_at:
        start = datetime.fromisoformat(event_starts_at.replace("Z", "+00:00"))
        distance = (start - reference).total_seconds()
        threshold = 300 if distance <= 7200 else 1800 if distance <= 86400 else 21600
    state = "fresh" if age <= threshold else "delayed" if age <= threshold * 2 else "stale"
    return {"state": state, "ageSeconds": age, "thresholdSeconds": threshold, "eventAware": True}


def compare_mlb_context_shadow(fixture: dict[str, Any], candidate: dict[str, Any]) -> list[dict[str, Any]]:
    discrepancies: list[dict[str, Any]] = []
    domains = ("availability", "rosters", "lineups", "starters", "weather", "transactions")
    for domain in domains:
        left = {item["id"]: item for item in fixture.get(domain, []) if item.get("id")}
        right = {item["id"]: item for item in candidate.get(domain, []) if item.get("id")}
        for item_id in sorted(set(left) | set(right)):
            if item_id not in left:
                discrepancies.append({"category": "outside_fixture_coverage", "recordId": f"{domain}:{item_id}", "details": {}})
            elif item_id not in right:
                discrepancies.append({"category": "missing_live", "recordId": f"{domain}:{item_id}", "details": {}})
            else:
                ignored = {"source", "sourceMode", "updatedAt", "freshness", "provenance", "edgeTrust"}
                first = {key: value for key, value in left[item_id].items() if key not in ignored}
                second = {key: value for key, value in right[item_id].items() if key not in ignored}
                if first != second:
                    discrepancies.append({"category": f"{domain}_conflict", "recordId": f"{domain}:{item_id}", "details": {"fixture": first, "candidate": second}})
    return discrepancies


class MlbContextAdapter:
    """Normalizes attributed MLB context without inferring diagnoses, availability, or causes."""

    def normalize(self, payload: dict[str, Any], schedule: dict[str, Any], *, source_mode: str | None = None, now: datetime | None = None) -> dict[str, Any]:
        if not isinstance(payload, dict) or payload.get("contractVersion") != MLB_CONTEXT_CONTRACT_VERSION:
            raise ProviderValidationError("MLB context provider contract is unsupported.")
        provider = _text(payload.get("provider"), "provider")
        recorded_at = _iso(payload.get("recordedAt"), "recordedAt")
        reference = now or datetime.fromisoformat(recorded_at.replace("Z", "+00:00"))
        mode = source_mode or str(payload.get("sourceMode") or "fixture")
        if mode not in {"fixture", "sample", "live", "cached", "degraded", "offline"}:
            raise ProviderValidationError("MLB context source mode is invalid.")
        entities = {item["id"]: item for item in schedule.get("entities", [])}
        games = {item["id"]: item for item in schedule.get("games", [])}
        teams = {key for key, item in entities.items() if item.get("type") == "team"}
        players = {key for key, item in entities.items() if item.get("type") == "athlete"}
        rejected: list[dict[str, Any]] = []

        def reject(domain: str, index: int, code: str) -> None:
            rejected.append({"domain": domain, "index": index, "code": code})

        def canonical_player_team(raw: dict[str, Any]) -> tuple[str, str]:
            player_id, team_id = _text(raw.get("playerId"), "playerId"), _text(raw.get("teamId"), "teamId")
            if player_id not in players or team_id not in teams:
                raise ProviderValidationError("MLB context player or team identity is unresolved.")
            return player_id, team_id

        def event_team(raw: dict[str, Any]) -> tuple[str, str, dict[str, Any]]:
            event_id, team_id = _text(raw.get("eventId"), "eventId"), _text(raw.get("teamId"), "teamId")
            event = games.get(event_id)
            participants = {item.get("id") for item in (event or {}).get("participants", [])}
            if not event or team_id not in teams or team_id not in participants:
                raise ProviderValidationError("MLB context event/team identity is unresolved.")
            return event_id, team_id, event

        availability, seen = [], set()
        for index, raw in enumerate(payload.get("availability", [])):
            try:
                if not isinstance(raw, dict): raise ProviderValidationError("Availability row is invalid.")
                player_id, team_id = canonical_player_team(raw)
                state = str(raw.get("status") or "unknown").lower()
                if state not in AVAILABILITY_STATES: state = "unknown"
                updated = _iso(raw.get("updatedAt"), "availability.updatedAt")
                record_id = _id("mlb-availability", player_id, team_id, raw.get("effectiveAt") or updated)
                if record_id in seen: raise ProviderValidationError("Duplicate availability row.")
                seen.add(record_id)
                availability.append({"id": record_id, "playerId": player_id, "teamId": team_id, "status": state,
                    "reportedReason": str(raw.get("reportedReason") or ""), "effectiveAt": _iso(raw.get("effectiveAt") or updated, "availability.effectiveAt"),
                    "resolvedAt": _iso(raw["resolvedAt"], "availability.resolvedAt") if raw.get("resolvedAt") else None,
                    "updatedAt": updated, "freshness": _freshness(updated, None, reference)})
            except ProviderValidationError: reject("availability", index, "invalid_availability")

        rosters, seen = [], set()
        for index, raw in enumerate(payload.get("rosters", [])):
            try:
                if not isinstance(raw, dict): raise ProviderValidationError("Roster row is invalid.")
                player_id, team_id = canonical_player_team(raw)
                state = str(raw.get("status") or "unknown").lower()
                if state not in ROSTER_STATES: state = "unknown"
                effective = _iso(raw.get("effectiveAt"), "roster.effectiveAt")
                record_id = _id("mlb-roster", player_id, team_id, effective)
                if record_id in seen: raise ProviderValidationError("Duplicate roster row.")
                seen.add(record_id)
                rosters.append({"id": record_id, "playerId": player_id, "teamId": team_id, "status": state,
                    "effectiveAt": effective, "endedAt": _iso(raw["endedAt"], "roster.endedAt") if raw.get("endedAt") else None,
                    "transactionType": str(raw.get("transactionType") or ""), "updatedAt": _iso(raw.get("updatedAt") or effective, "roster.updatedAt")})
            except ProviderValidationError: reject("rosters", index, "invalid_roster")

        lineups = []
        for index, raw in enumerate(payload.get("lineups", [])):
            try:
                if not isinstance(raw, dict): raise ProviderValidationError("Lineup row is invalid.")
                event_id, team_id, event = event_team(raw)
                state = str(raw.get("state") or "unavailable").lower()
                if state not in LINEUP_STATES: raise ProviderValidationError("Lineup state is unsupported.")
                entries, slots, lineup_players = [], set(), set()
                for entry in raw.get("entries", []):
                    if not isinstance(entry, dict): raise ProviderValidationError("Lineup entry is invalid.")
                    player_id = _text(entry.get("playerId"), "lineup.playerId")
                    slot = int(entry.get("battingOrder"))
                    if player_id not in players or entities[player_id].get("teamId") != team_id or slot not in range(1, 10) or slot in slots or player_id in lineup_players:
                        raise ProviderValidationError("Lineup entry identity or batting slot is invalid.")
                    slots.add(slot); lineup_players.add(player_id)
                    entries.append({"playerId": player_id, "battingOrder": slot, "position": str(entry.get("position") or "")})
                entries.sort(key=lambda item: item["battingOrder"])
                updated = _iso(raw.get("updatedAt"), "lineup.updatedAt")
                freshness = _freshness(updated, event.get("starts_at"), reference)
                if freshness["state"] == "stale" and state not in {"conflicting", "unavailable"}: state = "stale"
                lineups.append({"id": _id("mlb-lineup", event_id, team_id), "eventId": event_id, "teamId": team_id,
                    "state": state, "entries": entries, "complete": len(entries) == 9, "updatedAt": updated, "freshness": freshness})
            except (ProviderValidationError, ValueError, TypeError): reject("lineups", index, "invalid_lineup")

        starters = []
        for index, raw in enumerate(payload.get("starters", [])):
            try:
                if not isinstance(raw, dict): raise ProviderValidationError("Starter row is invalid.")
                event_id, team_id, event = event_team(raw)
                player_id = _text(raw.get("playerId"), "starter.playerId")
                if player_id not in players or entities[player_id].get("teamId") != team_id or str(entities[player_id].get("position") or "").casefold() != "pitcher":
                    raise ProviderValidationError("Probable starter identity is unresolved or not a pitcher.")
                state = str(raw.get("state") or "unavailable").lower()
                if state not in STARTER_STATES: raise ProviderValidationError("Starter state is unsupported.")
                updated = _iso(raw.get("updatedAt"), "starter.updatedAt")
                freshness = _freshness(updated, event.get("starts_at"), reference)
                if freshness["state"] == "stale" and state not in {"conflicting", "unavailable"}: state = "stale"
                starters.append({"id": _id("mlb-starter", event_id, team_id), "eventId": event_id, "teamId": team_id,
                    "playerId": player_id, "state": state, "updatedAt": updated, "freshness": freshness})
            except ProviderValidationError: reject("starters", index, "invalid_starter")

        weather = []
        for index, raw in enumerate(payload.get("weather", [])):
            try:
                if not isinstance(raw, dict): raise ProviderValidationError("Weather row is invalid.")
                event_id = _text(raw.get("eventId"), "weather.eventId")
                event = games.get(event_id)
                if not event: raise ProviderValidationError("Weather event is unresolved.")
                state = str(raw.get("state") or "unavailable").lower()
                if state not in WEATHER_STATES: raise ProviderValidationError("Weather state is unsupported.")
                updated = _iso(raw.get("updatedAt"), "weather.updatedAt")
                freshness = _freshness(updated, event.get("starts_at"), reference)
                if freshness["state"] == "stale" and state not in {"conflicting", "unavailable"}: state = "stale"
                weather.append({"id": _id("mlb-weather", event_id), "eventId": event_id, "state": state,
                    "summary": str(raw.get("summary") or "Weather details unavailable."),
                    "temperatureF": _number(raw.get("temperatureF"), "temperatureF", minimum=-100, maximum=150),
                    "windMph": _number(raw.get("windMph"), "windMph", minimum=0, maximum=250),
                    "precipitationProbability": _number(raw.get("precipitationProbability"), "precipitationProbability", minimum=0, maximum=100),
                    "updatedAt": updated, "freshness": freshness})
            except ProviderValidationError: reject("weather", index, "invalid_weather")

        transactions = []
        for index, raw in enumerate(payload.get("transactions", [])):
            try:
                if not isinstance(raw, dict): raise ProviderValidationError("Transaction row is invalid.")
                player_id, team_id = canonical_player_team(raw)
                occurred = _iso(raw.get("occurredAt"), "transaction.occurredAt")
                transactions.append({"id": _id("mlb-transaction", player_id, team_id, occurred, raw.get("type")),
                    "playerId": player_id, "teamId": team_id, "type": _text(raw.get("type"), "transaction.type"),
                    "description": str(raw.get("description") or "Provider-reported roster transaction."), "occurredAt": occurred,
                    "updatedAt": _iso(raw.get("updatedAt") or occurred, "transaction.updatedAt")})
            except ProviderValidationError: reject("transactions", index, "invalid_transaction")

        context_events = []
        for index, raw in enumerate(payload.get("contextualEvents", [])):
            try:
                if not isinstance(raw, dict): raise ProviderValidationError("Context event is invalid.")
                event_type = str(raw.get("type") or "").lower()
                if event_type not in CONTEXT_EVENT_TYPES: raise ProviderValidationError("Context event type is unsupported.")
                player_id, team_id, event_id = str(raw.get("playerId") or ""), str(raw.get("teamId") or ""), str(raw.get("eventId") or "")
                if player_id and player_id not in players or team_id and team_id not in teams or event_id and event_id not in games:
                    raise ProviderValidationError("Context event canonical identity is unresolved.")
                occurred = _iso(raw.get("occurredAt"), "contextEvent.occurredAt")
                context_events.append({"id": _id("mlb-context-event", event_type, player_id, team_id, event_id, occurred),
                    "type": event_type, "playerId": player_id or None, "teamId": team_id or None, "eventId": event_id or None,
                    "previousState": copy.deepcopy(raw.get("previousState")), "currentState": copy.deepcopy(raw.get("currentState")),
                    "summary": _text(raw.get("summary"), "contextEvent.summary"), "occurredAt": occurred,
                    "verification": "verified", "causalRelationship": "related_event", "affectedReferences": copy.deepcopy(raw.get("affectedReferences") or {})})
            except ProviderValidationError: reject("contextualEvents", index, "invalid_context_event")

        for records in (availability, rosters, lineups, starters, weather, transactions, context_events):
            for item in records:
                item.update({"source": provider, "sourceMode": mode})

        conflicts = [item for item in [*lineups, *starters, *weather] if item.get("state") == "conflicting"]
        stale = [item for item in [*availability, *lineups, *starters, *weather] if item.get("freshness", {}).get("state") == "stale"]
        edge_trust = evaluate_edge_trust({
            "identity": "verified", "freshness": "stale" if stale else "fixture" if mode in {"fixture", "sample"} else "passing",
            "coverage": "partial", "lineups": "partial" if lineups else "unavailable",
            "injuries": "partial" if availability else "unavailable", "provider_agreement": "conflicting" if conflicts else "unavailable",
        }, applicable={"identity", "freshness", "coverage", "lineups", "injuries", "provider_agreement"}, conflicts=conflicts, sample=mode in {"fixture", "sample"})
        return {"contractVersion": MLB_CONTEXT_CONTRACT_VERSION, "provider": provider, "sourceMode": mode,
            "recordedAt": recorded_at, "attribution": str(payload.get("attribution") or provider), "availability": availability,
            "rosters": rosters, "lineups": lineups, "starters": starters, "weather": weather,
            "transactions": transactions, "contextualEvents": sorted(context_events, key=lambda item: (item["occurredAt"], item["id"])),
            "rejected": rejected, "edgeTrust": edge_trust,
            "coverage": {domain: "fixture" if records else "unavailable" for domain, records in {
                "availability": availability, "rosters": rosters, "lineups": lineups, "starters": starters,
                "weather": weather, "transactions": transactions}.items()}}


class MlbContextService(MlbDomainService):
    provider_status_fields = ("mlb_context_source", "mlb_context_edge_trust")

    def __init__(self, cache: MemoryCache, rollout: Any, shadow: Any, schedule_service: Any, *,
                 payload_loader: Callable[[], dict[str, Any]] | None = None,
                 shadow_validator: Callable[..., tuple[dict[str, Any] | None, list[dict[str, Any]], ProviderError | None]] | None = None):
        super().__init__(cache, rollout, shadow, schedule_service, payload_loader=payload_loader, shadow_validator=shadow_validator)
        self.adapter, self._lock, self._shadow_lock = MlbContextAdapter(), threading.Lock(), threading.Lock()
        self.provider_requests, self.shadow_provider_requests, self._last_shadow_report = 0, 0, None
        self.invalidation_callbacks: list[Callable[[], None]] = []

    @staticmethod
    def _fixture() -> dict[str, Any]:
        with (Path(__file__).parent / "fixtures" / "mlb_context_ticket8.json").open("r", encoding="utf-8") as handle:
            return json.load(handle)

    def read(self, *, refresh: bool = False, now: datetime | None = None) -> dict[str, Any]:
        key = CachePolicy.key(MLB_CONTEXT_CONTRACT_VERSION, MLB_CONTEXT_FIXTURE_PROVIDER, "availability", "mlb")
        if not refresh:
            cached, _ = self.cache.get(key)
            if cached is not None: return copy.deepcopy(cached)
        with self._lock:
            if not refresh:
                cached, _ = self.cache.get(key)
                if cached is not None: return copy.deepcopy(cached)
            self.provider_requests += 1
            raw = self.payload_loader()
            reference = now or datetime.fromisoformat(str(raw["recordedAt"]).replace("Z", "+00:00"))
            data = self.adapter.normalize(raw, self.schedule_service.read(), source_mode="fixture", now=reference)
            data["source"] = {"provider": data["provider"], "mode": "fixture", "sample": True, "liveVerified": False,
                "lastUpdated": data["recordedAt"], "attribution": data["attribution"],
                "notice": "Deterministic MLB context fixture — not live provider data."}
            identity_tags = tuple({
                f"context:{field}:{item[field]}"
                for domain in ("availability", "rosters", "lineups", "starters", "weather", "transactions")
                for item in data[domain] for field in ("playerId", "teamId", "eventId") if item.get(field)
            })
            self.cache.set(key, data, 180, 1800, tags=("league:mlb", "domain:availability", "domain:injuries", "domain:rosters", "domain:projected_lineups", "domain:confirmed_lineups", "domain:weather", *identity_tags))
            return copy.deepcopy(data)

    def invalidate(self, *, player_id: str = "", team_id: str = "", event_id: str = "") -> dict[str, Any]:
        target = next((f"context:{field}:{value}" for field, value in (("playerId", player_id), ("teamId", team_id), ("eventId", event_id)) if value), "league:mlb")
        removed = self.cache.invalidate(tag=target)
        for callback in self.invalidation_callbacks:
            callback()
        return {"invalidatedCacheEntries": removed, "target": target, "refreshableResearchInvalidated": True, "savedSnapshotsChanged": False}

    def collection(self, domain: str, **filters: str) -> dict[str, Any]:
        data = self.read(); items = data.get(domain, [])
        aliases = {"player_id": "playerId", "team_id": "teamId", "event_id": "eventId", "state": "state"}
        for key, value in filters.items():
            field = aliases.get(key, key)
            if value: items = [item for item in items if str(item.get(field) or "") == value]
        return {"items": copy.deepcopy(items), "source": data["source"], "edgeTrust": data["edgeTrust"], "coverage": data["coverage"], "rejected": data["rejected"]}

    def context(self, *, player_id: str = "", team_id: str = "", event_id: str = "") -> dict[str, Any]:
        data = self.read()
        def relevant(item: dict[str, Any]) -> bool:
            return (not player_id or item.get("playerId") == player_id) and (not team_id or item.get("teamId") == team_id) and (not event_id or item.get("eventId") == event_id)
        return {domain: [copy.deepcopy(item) for item in data[domain] if relevant(item)] for domain in
            ("availability", "rosters", "lineups", "starters", "weather", "transactions", "contextualEvents")} | {
            "source": data["source"], "edgeTrust": data["edgeTrust"], "coverage": data["coverage"]}

    def enrich_entity(self, entity: dict[str, Any]) -> dict[str, Any]:
        return {**copy.deepcopy(entity), "context": self.context(player_id=entity["id"] if entity.get("type") == "athlete" else "", team_id=entity["id"] if entity.get("type") == "team" else "")}

    def enrich_game(self, game: dict[str, Any]) -> dict[str, Any]:
        return {**copy.deepcopy(game), "context": self.context(event_id=game["id"])}

    def enrich_offers(self, offers: list[dict[str, Any]]) -> list[dict[str, Any]]:
        data = self.read()
        availability = {item["playerId"]: item for item in data["availability"] if not item.get("resolvedAt")}
        roster = {item["playerId"]: item for item in data["rosters"] if not item.get("endedAt")}
        lineups = {(item["eventId"], item["teamId"]): item for item in data["lineups"]}
        starters = {(item["eventId"], item["teamId"]): item for item in data["starters"]}
        weather = {item["eventId"]: item for item in data["weather"]}
        enriched = copy.deepcopy(offers)
        for offer in enriched:
            if offer.get("league_key") != "mlb": continue
            for selection in offer.get("selections", []):
                player_id, team_id, event_id = (selection.get("participant") or {}).get("id"), selection.get("team_id"), offer.get("event_id")
                current_availability, current_roster = availability.get(player_id), roster.get(player_id)
                lineup, starter = lineups.get((event_id, team_id)), starters.get((event_id, team_id))
                is_pitcher = str(selection.get("canonical_stat_id") or "").startswith("baseball-pitcher") or selection.get("canonical_stat_id") == "baseball-innings-pitched"
                lineup_confirmed = bool(lineup and lineup["state"] == "confirmed" and any(entry["playerId"] == player_id for entry in lineup["entries"]))
                starter_confirmed = bool(starter and starter["state"] == "confirmed" and starter["playerId"] == player_id)
                unavailable = (current_availability or {}).get("status") in {"out", "inactive", "suspended", "injured_list"} or (current_roster or {}).get("status") not in {None, "active"}
                context_events = [item for item in data["contextualEvents"] if (not item.get("eventId") or item.get("eventId") == event_id) and (not item.get("playerId") or item.get("playerId") == player_id) and (not item.get("teamId") or item.get("teamId") == team_id)]
                selection["confirmed"] = starter_confirmed if is_pitcher else lineup_confirmed
                selection["availability_status"] = (current_availability or {}).get("status", "unknown")
                selection["roster_status"] = (current_roster or {}).get("status", "unknown")
                selection["lineup_status"] = (lineup or {}).get("state", "unavailable")
                selection["starter_status"] = (starter or {}).get("state", "unavailable")
                freshness_states = [item.get("freshness", {}).get("state", "unavailable") for item in (current_availability, lineup, starter, weather.get(event_id)) if item]
                freshness_rank = {"fresh": 0, "delayed": 1, "stale": 2, "unavailable": 3}
                selection["context_freshness"] = max(freshness_states, key=lambda state: freshness_rank.get(state, 3), default="unavailable")
                selection["weather_status"] = (weather.get(event_id) or {}).get("state", "unavailable")
                selection["context_conflict"] = any((item or {}).get("state") == "conflicting" for item in (lineup, starter, weather.get(event_id)))
                selection["context_review_required"] = unavailable or selection["context_conflict"] or (is_pitcher and (starter or {}).get("state") == "changed") or (not is_pitcher and (lineup or {}).get("state") == "changed")
                if unavailable:
                    selection["available"] = False
                    selection["data_quality_warning"] = " ".join(filter(None, [selection.get("data_quality_warning"), "Provider context reports this participant unavailable; selection requires review."]))
                selection["market_events"] = [self._market_event(item) for item in context_events]
        return enriched

    @staticmethod
    def _market_event(item: dict[str, Any]) -> dict[str, Any]:
        event_type = "lineup" if item["type"].startswith(("lineup", "starter")) else "injury" if item["type"].startswith(("injury", "availability")) else "weather" if item["type"].startswith("weather") else "schedule" if item["type"].startswith("game_") else "provider_correction" if item["type"] == "provider_correction" else "schedule"
        return {"event_id": item["id"], "event_type": event_type, "occurred_at": item["occurredAt"],
            "provider": item["source"], "verification": "verified", "causal_relationship": "related_event",
            "summary": item["summary"], "entity_id": item.get("playerId") or item.get("teamId") or ""}

    def _extend_provider_bundle(self, bundle: dict[str, Any], data: dict[str, Any]) -> None:
        bundle["injuries"] = copy.deepcopy(data["availability"])
        bundle["lineups"] = copy.deepcopy(data["lineups"])
        bundle["weather"] = copy.deepcopy(data["weather"])
        bundle["offers"] = self.enrich_offers(bundle.get("offers", []))

    def run_shadow_validation(self, *, selected_date: str, refresh: bool = False) -> dict[str, Any]:
        if self.rollout.get("mlb")["rolloutState"] != "shadow": raise ValidationError("MLB context validation requires shadow rollout state.")
        if self.shadow_validator is None: raise ValidationError("No MLB context shadow provider is configured.")
        with self._shadow_lock:
            self.shadow_provider_requests += 1
            candidate, endpoints, error = self.shadow_validator(selected_date=selected_date)
        if candidate is None:
            report = {"provider": "sportsdataio", "exposedAsPrimary": False, "endpoints": endpoints,
                "normalization": {"accepted": False}, "errorCode": error.code if error else "provider_error",
                "limitations": ["Unavailable or unentitled context domains remain fixture-backed; no values are fabricated."]}
            self._last_shadow_report = report; return copy.deepcopy(report)
        candidate_schedule = self.schedule_service.adapter.normalize(candidate["scheduleContract"], source_mode="sample") if isinstance(candidate.get("scheduleContract"), dict) else self.schedule_service.read()
        normalized = self.adapter.normalize(candidate, candidate_schedule, source_mode="sample")
        discrepancies = compare_mlb_context_shadow(self.read(), normalized)
        self.shadow.record("mlb", "availability", MLB_CONTEXT_FIXTURE_PROVIDER, normalized["provider"], discrepancies)
        report = {"provider": normalized["provider"], "exposedAsPrimary": False, "candidateMode": "discovery_lab_shadow",
            "endpoints": endpoints, "normalization": {"accepted": True, "counts": {key: len(normalized[key]) for key in ("availability", "rosters", "lineups", "starters", "weather", "transactions")}, "rejected": len(normalized["rejected"])},
            "discrepancies": {"total": len(discrepancies), "categories": dict(Counter(item["category"] for item in discrepancies))},
            "edgeTrust": normalized["edgeTrust"], "limitations": ["SportsDataIO Discovery Lab context remains shadow-only and may be scrambled."]}
        self._last_shadow_report = copy.deepcopy(report); return report

    def shadow_status(self) -> dict[str, Any]:
        return copy.deepcopy(self._last_shadow_report) if self._last_shadow_report else {"status": "not_run", "exposedAsPrimary": False}
