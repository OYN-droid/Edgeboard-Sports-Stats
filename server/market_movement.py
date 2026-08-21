from __future__ import annotations

import copy
import hashlib
import json
import math
import statistics
import threading
from collections import Counter
from dataclasses import asdict, is_dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable

from .errors import ProviderValidationError, ValidationError


MARKET_MOVEMENT_CONTRACT_VERSION = "edgeboard-market-movement-v1"
RETENTION_STATES = frozenset({
    "ephemeral_only", "short_term_cache", "historical_storage_allowed", "unknown",
})
CHANGE_TYPES = frozenset({
    "initial_observation", "line_change", "price_change", "line_and_price_change",
    "suspended", "reopened", "closed", "corrected", "unchanged",
})
RELATIONSHIP_STATES = frozenset({"verified_cause", "related_event", "unknown"})
EVENT_TYPES = frozenset({"lineup", "injury", "weather", "schedule", "opponent_change", "provider_correction"})
ACTIVE_STATUSES = frozenset({"available", "open"})


def _utc(value: Any, field: str) -> str:
    text = str(value or "").strip()
    if not text:
        raise ProviderValidationError(f"Market snapshot {field} is required.")
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError as error:
        raise ProviderValidationError(f"Market snapshot {field} is invalid.") from error
    if parsed.tzinfo is None:
        raise ProviderValidationError(f"Market snapshot {field} requires a timezone.")
    return parsed.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _number(value: Any, field: str, *, required: bool = False) -> float | None:
    if value in (None, ""):
        if required:
            raise ProviderValidationError(f"Market snapshot {field} is required.")
        return None
    if isinstance(value, bool):
        raise ProviderValidationError(f"Market snapshot {field} must be numeric.")
    try:
        result = float(value)
    except (TypeError, ValueError) as error:
        raise ProviderValidationError(f"Market snapshot {field} must be numeric.") from error
    if not math.isfinite(result):
        raise ProviderValidationError(f"Market snapshot {field} must be finite.")
    return result


def _id(prefix: str, *parts: Any) -> str:
    digest = hashlib.sha256("|".join(str(part or "") for part in parts).encode()).hexdigest()[:24]
    return f"{prefix}-{digest}"


def _terms_dict(terms: Any) -> dict[str, Any]:
    if terms is None:
        return {}
    if is_dataclass(terms):
        return asdict(terms)
    if isinstance(terms, dict):
        return dict(terms)
    return {
        key: getattr(terms, key) for key in (
            "normalized_retention_allowed", "odds_history_storage_allowed", "maximum_cache_duration",
        ) if hasattr(terms, key)
    }


def determine_retention_policy(terms: Any) -> dict[str, Any]:
    """Resolve an enforceable policy. Unknown rights never enable persistence."""
    values = _terms_dict(terms)
    normalized = values.get("normalized_retention_allowed")
    historical = values.get("odds_history_storage_allowed")
    try:
        maximum = max(0, int(values.get("maximum_cache_duration", 0)))
    except (TypeError, ValueError):
        maximum = 0
    if normalized is True and historical is True:
        return {
            "state": "historical_storage_allowed", "effectiveState": "historical_storage_allowed",
            "ttlSeconds": None, "durable": True, "failClosed": False,
            "reason": "Configured provider terms explicitly allow normalized odds-history storage.",
        }
    if normalized is True and maximum > 0:
        return {
            "state": "short_term_cache", "effectiveState": "short_term_cache",
            "ttlSeconds": maximum, "durable": False, "failClosed": False,
            "reason": "Normalized records may be cached only within the configured provider cache window.",
        }
    if normalized is False:
        return {
            "state": "ephemeral_only", "effectiveState": "ephemeral_only", "ttlSeconds": 0,
            "durable": False, "failClosed": True,
            "reason": "Configured provider terms prohibit normalized retention.",
        }
    return {
        "state": "unknown", "effectiveState": "ephemeral_only", "ttlSeconds": 0,
        "durable": False, "failClosed": True,
        "reason": "Retention permission is unknown; EdgeBoard fails closed to ephemeral processing.",
    }


class MarketSnapshotAdapter:
    @staticmethod
    def normalize(raw: dict[str, Any]) -> dict[str, Any]:
        if not isinstance(raw, dict):
            raise ProviderValidationError("Market snapshot must be an object.")
        event_id = str(raw.get("eventId") or "").strip()
        market_id = str(raw.get("canonicalMarketId") or "").strip()
        sportsbook_id = str(raw.get("sportsbookId") or "").strip()
        family = str(raw.get("family") or "").strip()
        side = str(raw.get("side") or "").strip().lower()
        if not all((event_id, market_id, sportsbook_id, family, side)):
            raise ProviderValidationError("Market snapshot canonical identity is incomplete.")
        observed_at = _utc(raw.get("observedAt") or raw.get("updatedAt"), "observedAt")
        decimal_odds = _number(raw.get("decimalOdds"), "decimalOdds")
        if decimal_odds is not None and decimal_odds <= 1:
            raise ProviderValidationError("Market snapshot decimal odds must be greater than one.")
        status = str(raw.get("status") or "unknown").lower()
        suspended = bool(raw.get("suspended")) or status == "suspended"
        if status in ACTIVE_STATUSES and decimal_odds is None:
            raise ProviderValidationError("An available market snapshot requires valid odds.")
        line = _number(raw.get("line"), "line")
        player_id = str(raw.get("playerId") or "").strip() or None
        period = str(raw.get("period") or "full_game").strip()
        scope = str(raw.get("settlementScope") or "including_extra_innings").strip()
        alternate = raw.get("isAlternate") is True
        series_id = _id(
            "market-series", event_id, market_id, player_id, sportsbook_id, family, side,
            period, scope, alternate,
        )
        snapshot_id = _id("market-snapshot", series_id, observed_at, line, decimal_odds, status, suspended)
        source_mode = str(raw.get("sourceMode") or "fixture").lower()
        provider = str(raw.get("provider") or raw.get("source") or "unknown-provider").strip()
        return {
            "contractVersion": MARKET_MOVEMENT_CONTRACT_VERSION,
            "snapshotId": snapshot_id, "seriesId": series_id,
            "canonicalSelectionId": str(raw.get("canonicalSelectionId") or raw.get("id") or ""),
            "eventId": event_id, "playerId": player_id, "teamId": raw.get("teamId"),
            "canonicalMarketId": market_id, "canonicalStatId": raw.get("canonicalStatId"),
            "family": family, "side": side, "sportsbookId": sportsbook_id,
            "line": line, "decimalOdds": decimal_odds,
            "americanOdds": raw.get("americanOdds"), "status": status, "suspended": suspended,
            "period": period, "settlementScope": scope, "isAlternate": alternate,
            "observedAt": observed_at, "provider": provider, "sourceMode": source_mode,
            "verification": str(raw.get("verification") or "provider_reported").lower(),
            "providerOpeningLine": _number(raw.get("providerOpeningLine"), "providerOpeningLine"),
            "providerOpeningDecimalOdds": _number(raw.get("providerOpeningDecimalOdds"), "providerOpeningDecimalOdds"),
            "providerOpenedAt": _utc(raw.get("providerOpenedAt"), "providerOpenedAt") if raw.get("providerOpenedAt") else None,
            "attribution": str(raw.get("attribution") or provider),
        }

    @staticmethod
    def from_market(item: dict[str, Any], *, provider: str, source_mode: str) -> dict[str, Any]:
        return MarketSnapshotAdapter.normalize({**item, "observedAt": item.get("updatedAt"), "provider": provider, "sourceMode": source_mode})


class MarketChangeEventAdapter:
    @staticmethod
    def normalize(raw: dict[str, Any]) -> dict[str, Any]:
        if not isinstance(raw, dict):
            raise ProviderValidationError("Market change event must be an object.")
        event_id = str(raw.get("eventId") or "").strip()
        change_event_id = str(raw.get("changeEventId") or "").strip()
        event_type = str(raw.get("eventType") or "").strip().lower()
        relationship = str(raw.get("causalRelationship") or "unknown").strip().lower()
        if not event_id or not change_event_id:
            raise ProviderValidationError("Market change event identity is incomplete.")
        if event_type not in EVENT_TYPES:
            raise ProviderValidationError("Market change event type is unsupported.")
        if relationship not in RELATIONSHIP_STATES:
            raise ProviderValidationError("Market change event relationship is invalid.")
        return {
            "changeEventId": change_event_id, "eventId": event_id,
            "playerId": str(raw.get("playerId") or "").strip() or None,
            "canonicalMarketId": str(raw.get("canonicalMarketId") or "").strip() or None,
            "eventType": event_type, "occurredAt": _utc(raw.get("occurredAt"), "change event occurredAt"),
            "provider": str(raw.get("provider") or "unknown-provider"),
            "sourceMode": str(raw.get("sourceMode") or "fixture").lower(),
            "verification": str(raw.get("verification") or "unverified").lower(),
            "causalRelationship": relationship,
            "summary": str(raw.get("summary") or "Verified event details are unavailable."),
            "evidenceIds": [str(value) for value in raw.get("evidenceIds", []) if value][:25]
            if isinstance(raw.get("evidenceIds", []), list) else [],
        }


def _fingerprint(item: dict[str, Any]) -> tuple[Any, ...]:
    return (
        item.get("line"), item.get("decimalOdds"), item.get("status"), item.get("suspended"),
        item.get("period"), item.get("settlementScope"), item.get("isAlternate"),
    )


def _change_type(previous: dict[str, Any] | None, current: dict[str, Any]) -> str:
    if previous is None:
        return "initial_observation"
    previous_status, status = previous.get("status"), current.get("status")
    if current.get("suspended") and not previous.get("suspended"):
        return "suspended"
    if previous.get("suspended") and not current.get("suspended") and status in ACTIVE_STATUSES:
        return "reopened"
    if status == "closed" and previous_status != "closed":
        return "closed"
    line_changed = previous.get("line") != current.get("line")
    price_changed = previous.get("decimalOdds") != current.get("decimalOdds")
    if line_changed and price_changed:
        return "line_and_price_change"
    if line_changed:
        return "line_change"
    if price_changed:
        return "price_change"
    return "unchanged"


class MarketSnapshotStore:
    """Bounded process-memory history. It never writes market snapshots to the database."""
    def __init__(self, policy: dict[str, Any], *, capacity: int = 10_000):
        self.policy = copy.deepcopy(policy)
        self.capacity = max(100, int(capacity))
        self._rows: dict[str, list[dict[str, Any]]] = {}
        self._lock = threading.RLock()
        self._accepted = 0
        self._duplicates = 0
        self._rejected = 0

    def capture(self, records: Iterable[dict[str, Any]]) -> dict[str, Any]:
        accepted, duplicates, rejected = 0, 0, []
        adapter = MarketSnapshotAdapter()
        with self._lock:
            self._prune()
            for index, raw in enumerate(records):
                try:
                    item = adapter.normalize(raw)
                except ProviderValidationError as error:
                    rejected.append({"index": index, "code": "invalid_snapshot", "message": str(error)})
                    self._rejected += 1
                    continue
                history = self._rows.setdefault(item["seriesId"], [])
                ordered = sorted(history, key=lambda row: row["observedAt"])
                same_time = next((row for row in ordered if row["observedAt"] == item["observedAt"]), None)
                if same_time and _fingerprint(same_time) == _fingerprint(item):
                    self._duplicates += 1
                    duplicates += 1
                    continue
                earlier = [row for row in ordered if row["observedAt"] < item["observedAt"]]
                later = [row for row in ordered if row["observedAt"] > item["observedAt"]]
                previous = earlier[-1] if earlier else None
                following = later[0] if later else None
                if same_time:
                    history.remove(same_time)
                    item["changeType"] = "corrected"
                elif (previous and _fingerprint(previous) == _fingerprint(item)) or (not previous and following and _fingerprint(following) == _fingerprint(item)):
                    self._duplicates += 1
                    duplicates += 1
                    continue
                else:
                    item["changeType"] = _change_type(previous, item)
                history.append(item)
                history.sort(key=lambda row: (row["observedAt"], row["snapshotId"]))
                for position, row in enumerate(history):
                    if row.get("changeType") != "corrected":
                        row["changeType"] = _change_type(history[position - 1] if position else None, row)
                if self.policy["effectiveState"] == "ephemeral_only":
                    self._rows[item["seriesId"]] = history[-2:]
                self._accepted += 1
                accepted += 1
            self._trim_capacity()
        return {"accepted": accepted, "duplicates": duplicates, "rejected": rejected, "retention": copy.deepcopy(self.policy)}

    def history(self, *, series_id: str = "", event_id: str = "", player_id: str = "", sportsbook_id: str = "", market_id: str = "") -> list[dict[str, Any]]:
        with self._lock:
            self._prune()
            rows = [copy.deepcopy(row) for history in self._rows.values() for row in history]
        return sorted((row for row in rows if
            (not series_id or row["seriesId"] == series_id)
            and (not event_id or row["eventId"] == event_id)
            and (not player_id or row.get("playerId") == player_id)
            and (not sportsbook_id or row["sportsbookId"] == sportsbook_id)
            and (not market_id or row["canonicalMarketId"] == market_id)
        ), key=lambda row: (row["observedAt"], row["snapshotId"]))

    def diagnostics(self) -> dict[str, Any]:
        with self._lock:
            self._prune()
            return {
                "contractVersion": MARKET_MOVEMENT_CONTRACT_VERSION,
                "retention": copy.deepcopy(self.policy), "durableStorageUsed": False,
                "series": len(self._rows), "snapshots": sum(map(len, self._rows.values())),
                "acceptedTotal": self._accepted, "duplicateTotal": self._duplicates,
                "rejectedTotal": self._rejected, "capacity": self.capacity,
            }

    def _prune(self) -> None:
        ttl = self.policy.get("ttlSeconds")
        if self.policy["effectiveState"] != "short_term_cache" or not ttl:
            return
        threshold = datetime.now(timezone.utc) - timedelta(seconds=ttl)
        # Fixture/sample rows are deterministic contract evidence, not retained provider observations.
        for key in list(self._rows):
            kept = [row for row in self._rows[key] if row["sourceMode"] in {"fixture", "sample"} or datetime.fromisoformat(row["observedAt"].replace("Z", "+00:00")) >= threshold]
            if kept:
                self._rows[key] = kept
            else:
                self._rows.pop(key, None)

    def _trim_capacity(self) -> None:
        rows = sorted((row["observedAt"], key, row["snapshotId"]) for key, history in self._rows.items() for row in history)
        for _observed, key, snapshot_id in rows[:max(0, len(rows) - self.capacity)]:
            self._rows[key] = [row for row in self._rows[key] if row["snapshotId"] != snapshot_id]
            if not self._rows[key]:
                self._rows.pop(key, None)


def _implied(decimal: float | None) -> float | None:
    return round(1 / decimal, 6) if decimal and decimal > 1 else None


def _decimal_to_american(decimal: float | None) -> int | None:
    if decimal is None or decimal <= 1:
        return None
    return round((decimal - 1) * 100) if decimal >= 2 else round(-100 / (decimal - 1))


def _delta(current: float | None, opening: float | None) -> float | None:
    return round(current - opening, 6) if current is not None and opening is not None else None


def movement_analysis(history: list[dict[str, Any]], *, line_threshold: float = 0.5, implied_probability_threshold: float = 0.02) -> dict[str, Any]:
    ordered = sorted(history, key=lambda row: (row["observedAt"], row["snapshotId"]))
    if not ordered:
        return {"observed": False, "timeline": [], "cause": {"relationship": "unknown", "disclosure": "No verified cause has been identified."}}
    earliest, current = ordered[0], ordered[-1]
    provider_opening = None
    for row in ordered:
        if row.get("providerOpenedAt") and (row.get("providerOpeningLine") is not None or row.get("providerOpeningDecimalOdds") is not None):
            provider_opening = {
                "line": row.get("providerOpeningLine"), "decimalOdds": row.get("providerOpeningDecimalOdds"),
                "observedAt": row.get("providerOpenedAt"), "provider": row.get("provider"),
                "verification": "provider_reported",
            }
            break
    baseline = provider_opening or earliest
    line_delta = _delta(current.get("line"), baseline.get("line"))
    price_delta = _delta(current.get("decimalOdds"), baseline.get("decimalOdds"))
    implied_delta = _delta(_implied(current.get("decimalOdds")), _implied(baseline.get("decimalOdds")))
    changes = [row for row in ordered if row.get("changeType") != "initial_observation"]
    line_changes = [row for row in changes if row.get("changeType") in {"line_change", "line_and_price_change"}]
    price_changes = [row for row in changes if row.get("changeType") in {"price_change", "line_and_price_change"}]
    line_steps = [abs(current_row["line"] - previous_row["line"]) for previous_row, current_row in zip(ordered, ordered[1:]) if previous_row.get("line") is not None and current_row.get("line") is not None]
    implied_steps = [abs(current_value - previous_value) for previous_row, current_row in zip(ordered, ordered[1:]) if (previous_value := _implied(previous_row.get("decimalOdds"))) is not None and (current_value := _implied(current_row.get("decimalOdds"))) is not None]
    largest_line_change = round(max(line_steps, default=0.0), 6)
    largest_implied_change = round(max(implied_steps, default=0.0), 6)
    family = current.get("family")
    effective_line_threshold = line_threshold if family in {"run_line", "total", "player_prop"} or current.get("playerId") else 0.0
    meaningful = bool(
        largest_line_change >= effective_line_threshold and largest_line_change > 0
        or largest_implied_change >= implied_probability_threshold and largest_implied_change > 0
    )
    return {
        "observed": len(ordered) > 1, "seriesId": current["seriesId"],
        "providerOpening": provider_opening, "earliestObserved": earliest, "current": current,
        "lineDelta": line_delta, "decimalPriceDelta": price_delta,
        "impliedProbabilityDelta": implied_delta,
        "impliedProbabilityDisclosure": "Sportsbook-implied probability derived from decimal price; it is not a model win probability.",
        "lineChangeCount": len(line_changes), "priceChangeCount": len(price_changes),
        "largestObservedLineChange": largest_line_change,
        "largestObservedImpliedProbabilityChange": largest_implied_change,
        "statusChangeCount": sum(row.get("changeType") in {"suspended", "reopened", "closed"} for row in changes),
        "meaningful": meaningful, "significanceRule": {"lineThreshold": effective_line_threshold, "impliedProbabilityThreshold": implied_probability_threshold},
        "timeline": ordered,
        "cause": {"relationship": "unknown", "verifiedEvents": [], "disclosure": "No verified cause has been identified."},
    }


def attach_change_events(analysis: dict[str, Any], events: list[dict[str, Any]]) -> dict[str, Any]:
    output = copy.deepcopy(analysis)
    if not analysis.get("current"):
        return output
    current = analysis["current"]
    matching = [item for item in events if
        item["eventId"] == current["eventId"]
        and (not item.get("playerId") or item.get("playerId") == current.get("playerId"))
        and (not item.get("canonicalMarketId") or item.get("canonicalMarketId") == current.get("canonicalMarketId"))]
    matching.sort(key=lambda item: (item["occurredAt"], item["changeEventId"]))
    verified_causes = [item for item in matching if item["verification"] == "verified" and item["causalRelationship"] == "verified_cause"]
    if verified_causes:
        output["cause"] = {
            "relationship": "verified_cause", "verifiedEvents": verified_causes,
            "relatedEvents": [item for item in matching if item not in verified_causes],
            "disclosure": "A provider-verified cause is linked to this observed change; inspect its evidence and timestamp before drawing conclusions.",
        }
    else:
        output["cause"] = {
            "relationship": "unknown", "verifiedEvents": [], "relatedEvents": matching,
            "disclosure": "No verified cause has been identified.",
        }
    return output


class MarketMovementService:
    def __init__(self, terms: Any, *, fixture_loader: Any | None = None, capacity: int = 10_000, line_threshold: float = 0.5, implied_probability_threshold: float = 0.02):
        self.policy = determine_retention_policy(terms)
        self.store = MarketSnapshotStore(self.policy, capacity=capacity)
        self.line_threshold = max(0.0, float(line_threshold))
        self.implied_probability_threshold = max(0.0, float(implied_probability_threshold))
        self.fixture_loader = fixture_loader or self._fixture
        fixture = self.fixture_loader()
        self._seed_result = self.store.capture(fixture.get("snapshots", []))
        self._change_events, self._event_rejections = [], []
        for index, raw in enumerate(fixture.get("changeEvents", [])):
            try:
                self._change_events.append(MarketChangeEventAdapter.normalize(raw))
            except ProviderValidationError as error:
                self._event_rejections.append({"index": index, "code": "invalid_change_event", "message": str(error)})

    @staticmethod
    def _fixture() -> dict[str, Any]:
        with (Path(__file__).parent / "fixtures" / "mlb_market_movement_ticket7.json").open("r", encoding="utf-8") as handle:
            return json.load(handle)

    def capture_normalized(self, game_markets: dict[str, Any], player_props: dict[str, Any]) -> dict[str, Any]:
        rows = []
        for source in (game_markets, player_props):
            provider, mode = source.get("provider", "unknown-provider"), source.get("sourceMode", "fixture")
            collection = source.get("prices") if "prices" in source else source.get("props", [])
            for item in collection or []:
                rows.append({**item, "observedAt": item.get("updatedAt"), "provider": provider, "sourceMode": mode, "attribution": source.get("attribution")})
        return self.store.capture(rows)

    def timeline(self, **filters: str) -> dict[str, Any]:
        rows = self.store.history(**filters)
        grouped: dict[str, list[dict[str, Any]]] = {}
        for row in rows:
            grouped.setdefault(row["seriesId"], []).append(row)
        return {
            "items": [attach_change_events(movement_analysis(history, line_threshold=self.line_threshold, implied_probability_threshold=self.implied_probability_threshold), self._change_events) for _key, history in sorted(grouped.items())],
            "source": self._source(), "retention": copy.deepcopy(self.policy),
        }

    def recent(self, *, event_id: str = "", player_id: str = "", market_id: str = "", meaningful_only: bool = True, limit: int = 50) -> dict[str, Any]:
        items = self.timeline(event_id=event_id, player_id=player_id, market_id=market_id)["items"]
        items = [item for item in items if item["observed"] and (not meaningful_only or item["meaningful"])]
        items.sort(key=lambda item: (item["current"]["observedAt"], item["seriesId"]), reverse=True)
        return {"items": items[:max(1, min(200, limit))], "source": self._source(), "retention": copy.deepcopy(self.policy)}

    def consensus(self, *, event_id: str = "", market_id: str = "", player_id: str = "") -> dict[str, Any]:
        rows = self.store.history(event_id=event_id, market_id=market_id, player_id=player_id)
        current_by_series = {}
        for row in rows:
            current_by_series[row["seriesId"]] = row
        groups: dict[tuple[Any, ...], list[dict[str, Any]]] = {}
        for row in current_by_series.values():
            key = (row["eventId"], row.get("playerId"), row["canonicalMarketId"], row["family"], row["side"], row["period"], row["settlementScope"], row["isAlternate"])
            groups.setdefault(key, []).append(row)
        output = []
        for key, group in sorted(groups.items(), key=lambda item: str(item[0])):
            lines = [row["line"] for row in group if row["line"] is not None]
            prices = [row["decimalOdds"] for row in group if row["decimalOdds"] is not None]
            output.append({
                "eventId": key[0], "playerId": key[1], "canonicalMarketId": key[2], "family": key[3], "side": key[4],
                "period": key[5], "settlementScope": key[6], "isAlternate": key[7],
                "sportsbookCount": len({row["sportsbookId"] for row in group}),
                "medianLine": statistics.median(lines) if lines else None,
                "lineRange": [min(lines), max(lines)] if lines else None,
                "medianDecimalOdds": round(statistics.median(prices), 6) if prices else None,
                "averageDecimalOdds": round(statistics.fmean(prices), 6) if prices else None,
                "priceRange": [min(prices), max(prices)] if prices else None,
                "providerAgreement": "unavailable" if len(group) < 2 else "passing" if len(set(lines)) <= 1 and len(set(prices)) <= 1 else "partial",
                "currentSnapshots": group,
            })
        return {"items": output, "source": self._source(), "syntheticBookCreated": False}

    def enrich_offers(self, offers: list[dict[str, Any]]) -> list[dict[str, Any]]:
        result = copy.deepcopy(offers)
        histories = self.store.history()
        for offer in result:
            for selection in offer.get("selections", []):
                player_id = (selection.get("participant") or {}).get("id") or None
                matches = [row for row in histories if
                    row["eventId"] == offer.get("event_id")
                    and row["sportsbookId"] == offer.get("sportsbook_id")
                    and row["canonicalMarketId"] == offer.get("canonical_market_id")
                    and row["side"] == selection.get("side")
                    and row.get("playerId") == player_id
                    and row["period"] == offer.get("period")
                    and row["settlementScope"] == offer.get("settlement_scope")]
                if not matches:
                    continue
                matches.sort(key=lambda row: row["observedAt"])
                analysis = attach_change_events(movement_analysis(matches, line_threshold=self.line_threshold, implied_probability_threshold=self.implied_probability_threshold), self._change_events)
                history = [self._client_snapshot(row, selection) for row in matches]
                opening = analysis.get("providerOpening")
                if opening and not any(item["observed_at"] == opening["observedAt"] for item in history):
                    history.insert(0, {
                        "sportsbook": selection.get("sportsbook") or matches[0]["sportsbookId"],
                        "line": opening.get("line"),
                        "line_display": str(opening.get("line")) if opening.get("line") is not None else "Moneyline",
                        "american_odds": _decimal_to_american(opening.get("decimalOdds")), "decimal_odds": opening.get("decimalOdds"),
                        "observed_at": opening["observedAt"], "source": opening["provider"],
                        "source_mode": matches[0]["sourceMode"], "change_type": "opening",
                        "verification": "provider-reported", "status": "open",
                    })
                selection["price_history"] = history
                linked_events = [*analysis["cause"].get("verifiedEvents", []), *analysis["cause"].get("relatedEvents", [])]
                linked_client_events = [{
                    "event_id": item["changeEventId"], "event_type": item["eventType"],
                    "occurred_at": item["occurredAt"], "provider": item["provider"],
                    "verification": item["verification"], "causal_relationship": item["causalRelationship"].replace("_", "-"),
                    "summary": item["summary"], "entity_id": item.get("playerId") or item["eventId"],
                } for item in linked_events]
                existing_events = selection.get("market_events") if isinstance(selection.get("market_events"), list) else []
                selection["market_events"] = list({
                    str(item.get("event_id") or f"event-{index}"): item
                    for index, item in enumerate([*existing_events, *linked_client_events])
                    if isinstance(item, dict)
                }.values())
                selection["movement_summary"] = {
                    "series_id": analysis["seriesId"], "line_delta": analysis["lineDelta"],
                    "price_delta": analysis["decimalPriceDelta"], "meaningful": analysis["meaningful"],
                    "cause_disclosure": analysis["cause"]["disclosure"],
                }
        return result

    def diagnostics(self) -> dict[str, Any]:
        return {**self.store.diagnostics(), "seed": copy.deepcopy(self._seed_result), "changeEventCount": len(self._change_events), "changeEventRejections": copy.deepcopy(self._event_rejections), "significance": {"lineThreshold": self.line_threshold, "impliedProbabilityThreshold": self.implied_probability_threshold}, "changeTypes": sorted(CHANGE_TYPES), "relationshipStates": sorted(RELATIONSHIP_STATES)}

    def _source(self) -> dict[str, Any]:
        return {"provider": "normalized-provider-boundary", "mode": "fixture_and_bounded_observation", "sample": True, "liveVerified": False}

    @staticmethod
    def _client_snapshot(row: dict[str, Any], selection: dict[str, Any]) -> dict[str, Any]:
        change = row.get("changeType", "movement")
        mapped = "opening" if change == "initial_observation" else change if change in {"suspended", "reopened"} else "movement"
        return {
            "sportsbook": selection.get("sportsbook") or row["sportsbookId"],
            "line": row.get("line"), "line_display": str(row.get("line")) if row.get("line") is not None else "Moneyline",
            "american_odds": row.get("americanOdds"), "decimal_odds": row.get("decimalOdds"),
            "observed_at": row["observedAt"], "source": row["provider"], "source_mode": row["sourceMode"],
            "change_type": mapped, "verification": "verified" if row["verification"] == "fixture_validated" else row["verification"], "status": row["status"],
        }
