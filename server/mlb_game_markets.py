from __future__ import annotations

import copy
import hashlib
import json
import math
import statistics
import threading
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from .cache import CachePolicy, MemoryCache
from .edge_trust import evaluate_edge_trust
from .errors import ProviderError, ProviderValidationError, ValidationError
from .mlb_domain_service import MlbDomainService


MLB_MARKET_CONTRACT_VERSION = "edgeboard-mlb-game-markets-v1"
MLB_MARKET_FIXTURE_PROVIDER = "edgeboard-mlb-game-markets-fixture"
MARKET_FAMILIES = frozenset({"moneyline", "run_line", "total"})
FAMILY_SIDES = {"moneyline": frozenset({"home", "away"}), "run_line": frozenset({"home", "away"}), "total": frozenset({"over", "under"})}
MARKET_STATUSES = frozenset({"available", "suspended", "closed", "unavailable", "unknown"})
CANONICAL_MARKET_IDS = {"moneyline": "baseball-moneyline", "run_line": "baseball-run-line", "total": "baseball-total"}
SPORTSBOOK_MAPPINGS = {
    "draftkings": ("sportsbook-draftkings", "DraftKings", "DK"),
    "fanduel": ("sportsbook-fanduel", "FanDuel", "FD"),
    "betmgm": ("sportsbook-betmgm", "BetMGM", "MGM"),
    "caesars": ("sportsbook-caesars", "Caesars Sportsbook", "Caesars"),
    "caesars sportsbook": ("sportsbook-caesars", "Caesars Sportsbook", "Caesars"),
    "espn bet": ("sportsbook-espn-bet", "ESPN BET", "ESPN BET"),
}


def american_to_decimal(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    try:
        odds = int(value)
    except (TypeError, ValueError):
        return None
    if odds == 0 or -100 < odds < 100:
        return None
    decimal = 1 + (odds / 100 if odds > 0 else 100 / abs(odds))
    return round(decimal, 6) if decimal > 1 else None


def decimal_to_american(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    try:
        decimal = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(decimal) or decimal <= 1:
        return None
    result = round((decimal - 1) * 100) if decimal >= 2 else round(-100 / (decimal - 1))
    return 100 if result == 0 else result


def _iso(value: Any, field: str) -> str:
    text = str(value or "").strip()
    if not text:
        raise ProviderValidationError(f"MLB market {field} is required.")
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError as error:
        raise ProviderValidationError(f"MLB market {field} is invalid.") from error
    if parsed.tzinfo is None:
        raise ProviderValidationError(f"MLB market {field} requires a timezone.")
    return parsed.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _number(value: Any, field: str) -> float | None:
    if value in (None, ""):
        return None
    if isinstance(value, bool):
        raise ProviderValidationError(f"MLB market {field} must be numeric.")
    try:
        result = float(value)
    except (TypeError, ValueError) as error:
        raise ProviderValidationError(f"MLB market {field} must be numeric.") from error
    if not math.isfinite(result):
        raise ProviderValidationError(f"MLB market {field} must be finite.")
    return result


def _identity(*parts: Any) -> str:
    digest = hashlib.sha256("|".join(str(value) for value in parts).encode()).hexdigest()[:20]
    return f"mlb-price-{digest}"


def reconcile_sportsbook(provider_id: Any, name: Any) -> dict[str, Any]:
    provider_text = str(provider_id or "").strip()
    display = " ".join(str(name or "").split())
    key = display.casefold()
    mapping = SPORTSBOOK_MAPPINGS.get(key)
    if mapping is None:
        return {"providerId": provider_text, "canonicalId": None, "displayName": display or None, "shortName": None, "active": False, "reconciliationState": "unresolved"}
    canonical, official_name, short = mapping
    state = "confirmed" if display == official_name else "alias_confirmed"
    return {"providerId": provider_text, "canonicalId": canonical, "displayName": official_name, "shortName": short, "active": True, "reconciliationState": state}


def odds_freshness(updated_at: str | None, starts_at: str | None, *, now: datetime | None = None, status: str = "available") -> dict[str, Any]:
    if not updated_at:
        return {"state": "unavailable", "ageSeconds": None, "freshForSeconds": 0}
    current = now or datetime.now(timezone.utc)
    updated = datetime.fromisoformat(updated_at.replace("Z", "+00:00"))
    start = datetime.fromisoformat(starts_at.replace("Z", "+00:00")) if starts_at else None
    if start and current >= start:
        return {"state": "expired", "ageSeconds": max(0, int((current - updated).total_seconds())), "freshForSeconds": 0}
    seconds_to_start = (start - current).total_seconds() if start else 86400
    fresh_for = 180 if seconds_to_start <= 7200 else 600 if seconds_to_start <= 86400 else 1800
    if status == "suspended":
        fresh_for = min(fresh_for, 120)
    age = max(0, int((current - updated).total_seconds()))
    state = "fresh" if age <= fresh_for else "delayed" if age <= fresh_for * 3 else "stale" if age <= fresh_for * 12 else "expired"
    return {"state": state, "ageSeconds": age, "freshForSeconds": fresh_for}


class MlbGameMarketAdapter:
    def normalize(self, payload: dict[str, Any], schedule: dict[str, Any], *, source_mode: str | None = None, now: datetime | None = None) -> dict[str, Any]:
        if not isinstance(payload, dict):
            raise ProviderValidationError("MLB game-market payload must be an object.")
        provider = str(payload.get("provider") or "").strip()
        if not provider:
            raise ProviderValidationError("MLB game-market provider is required.")
        mode = str(source_mode or payload.get("sourceMode") or "fixture").lower()
        if mode not in {"fixture", "sample", "live", "cached", "degraded"}:
            raise ProviderValidationError("MLB game-market source mode is invalid.")
        recorded_at = _iso(payload.get("recordedAt"), "recordedAt")
        rejected: list[dict[str, Any]] = []
        schedule_events = {item["id"]: item for item in schedule.get("games", []) if isinstance(item, dict) and item.get("id")}
        events = self._events(payload.get("events"), schedule_events, rejected)
        books, provider_books = self._sportsbooks(payload.get("sportsbooks"), rejected)
        prices = self._prices(payload.get("prices"), events, books, rejected, now=now)
        self._mark_incomplete_pairs(prices)
        return {
            "contractVersion": MLB_MARKET_CONTRACT_VERSION, "provider": provider, "sourceMode": mode,
            "recordedAt": recorded_at, "attribution": str(payload.get("attribution") or provider),
            "coverage": copy.deepcopy(payload.get("coverage") or {}), "events": list(events.values()),
            "sportsbooks": books, "prices": prices, "rejected": rejected,
            "diagnostics": {"providerSportsbookMappings": provider_books},
        }

    @staticmethod
    def _events(raw: Any, schedule_events: dict[str, dict[str, Any]], rejected: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
        if not isinstance(raw, list):
            raise ProviderValidationError("MLB game-market events must be an array.")
        output, seen_provider = {}, set()
        for index, item in enumerate(raw):
            try:
                if not isinstance(item, dict):
                    raise ProviderValidationError("Market event must be an object.")
                canonical = str(item.get("canonicalEventId") or "").strip()
                provider_id = str(item.get("providerEventId") or "").strip()
                if not canonical or not provider_id or provider_id in seen_provider or canonical in output:
                    raise ProviderValidationError("Market event identity is missing or duplicated.")
                scheduled = schedule_events.get(canonical)
                if scheduled is None:
                    raise ProviderValidationError("Market event has no canonical schedule match.")
                participants = {row.get("role"): row.get("id") for row in scheduled.get("participants", [])}
                if participants != {"away": item.get("awayTeamId"), "home": item.get("homeTeamId")}:
                    raise ProviderValidationError("Market event participants conflict with the canonical schedule.")
                starts_at = _iso(item.get("startsAt"), "event.startsAt")
                schedule_start = _iso(scheduled.get("starts_at"), "schedule.startsAt")
                if abs((datetime.fromisoformat(starts_at.replace("Z", "+00:00")) - datetime.fromisoformat(schedule_start.replace("Z", "+00:00"))).total_seconds()) > 300:
                    raise ProviderValidationError("Market event start time conflicts with the canonical schedule.")
                if item.get("date") != scheduled.get("schedule_date"):
                    raise ProviderValidationError("Market event date conflicts with the canonical schedule.")
                output[canonical] = {"id": canonical, "startsAt": schedule_start, "date": scheduled.get("schedule_date"), "awayTeamId": participants["away"], "homeTeamId": participants["home"], "providerEventId": provider_id}
                seen_provider.add(provider_id)
            except ProviderValidationError as error:
                rejected.append({"domain": "events", "index": index, "code": "event_reconciliation_failed", "message": str(error)})
        return output

    @staticmethod
    def _sportsbooks(raw: Any, rejected: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], dict[str, str | None]]:
        if not isinstance(raw, list):
            raise ProviderValidationError("MLB sportsbooks must be an array.")
        output, provider_map, seen_provider, seen_canonical = [], {}, set(), set()
        for index, item in enumerate(raw):
            try:
                if not isinstance(item, dict):
                    raise ProviderValidationError("Sportsbook must be an object.")
                provider_id = str(item.get("providerId") or "").strip()
                if not provider_id or provider_id in seen_provider:
                    raise ProviderValidationError("Sportsbook provider identity is missing or duplicated.")
                canonical = item.get("canonicalId")
                state = str(item.get("reconciliationState") or "unresolved")
                if canonical and canonical in seen_canonical:
                    raise ProviderValidationError("Multiple provider books resolve to the same canonical sportsbook.")
                if state in {"confirmed", "alias_confirmed"} and not canonical:
                    raise ProviderValidationError("Confirmed sportsbook requires a canonical identity.")
                public = {"id": canonical, "displayName": item.get("displayName"), "shortName": item.get("shortName"), "region": item.get("region"), "active": item.get("active") is True, "reconciliationState": state, "source": "provider_mapping"}
                output.append(public)
                provider_map[provider_id] = canonical
                seen_provider.add(provider_id)
                if canonical:
                    seen_canonical.add(canonical)
            except ProviderValidationError as error:
                rejected.append({"domain": "sportsbooks", "index": index, "code": "invalid_sportsbook", "message": str(error)})
        return output, provider_map

    @staticmethod
    def _prices(raw: Any, events: dict[str, dict[str, Any]], books: list[dict[str, Any]], rejected: list[dict[str, Any]], *, now: datetime | None) -> list[dict[str, Any]]:
        if not isinstance(raw, list):
            raise ProviderValidationError("MLB game-market prices must be an array.")
        book_map = {item["id"]: item for item in books if item.get("id")}
        output, identities = [], set()
        for index, item in enumerate(raw):
            try:
                if not isinstance(item, dict):
                    raise ProviderValidationError("Market price must be an object.")
                event_id = str(item.get("eventId") or "")
                book_id = item.get("sportsbookId")
                family, side = str(item.get("family") or ""), str(item.get("side") or "")
                if event_id not in events:
                    raise ProviderValidationError("Market price references an unresolved event.")
                if book_id not in book_map:
                    raise ProviderValidationError("Market price references an unresolved sportsbook.")
                if family not in MARKET_FAMILIES or side not in FAMILY_SIDES.get(family, ()):
                    raise ProviderValidationError("Market family or side is unsupported.")
                period = str(item.get("period") or "full_game")
                scope = str(item.get("settlementScope") or "including_extra_innings")
                if period != "full_game" or scope != "including_extra_innings" or item.get("isLive") is True:
                    raise ProviderValidationError("Only full-game pregame MLB markets including extra innings are enabled.")
                line = _number(item.get("line"), "line")
                if family == "moneyline" and line is not None:
                    raise ProviderValidationError("Moneyline must not carry a numeric line.")
                if family != "moneyline" and line is None:
                    raise ProviderValidationError("Run-line and total prices require a line.")
                decimal = _number(item.get("decimalOdds"), "decimal odds")
                american = item.get("americanOdds")
                converted_american = american_to_decimal(american) if american is not None else None
                if decimal is None:
                    decimal = converted_american
                if decimal is None or decimal <= 1:
                    raise ProviderValidationError("Market price is invalid or missing.")
                normalized_american = decimal_to_american(decimal)
                if american is not None and converted_american is None:
                    raise ProviderValidationError("American odds are invalid.")
                if converted_american is not None and abs(decimal - converted_american) > 0.00001:
                    raise ProviderValidationError("American and decimal prices conflict.")
                status = str(item.get("status") or "unknown")
                if status not in MARKET_STATUSES:
                    status = "unknown"
                updated_at = _iso(item.get("updatedAt"), "updatedAt")
                alternate = item.get("isAlternate") is True
                identity = (event_id, book_id, family, side, line, period, scope, alternate, False)
                if identity in identities:
                    raise ProviderValidationError("Duplicate canonical market price.")
                identities.add(identity)
                freshness = odds_freshness(updated_at, events[event_id]["startsAt"], now=now, status=status)
                opening_decimal = american_to_decimal(item.get("providerOpeningAmericanOdds")) if item.get("providerOpeningAmericanOdds") is not None else _number(item.get("providerOpeningDecimalOdds"), "opening decimal odds")
                if opening_decimal is not None and opening_decimal <= 1:
                    raise ProviderValidationError("Provider opening price is invalid.")
                opening_line = _number(item.get("providerOpeningLine"), "opening line")
                if family == "moneyline" and opening_line is not None:
                    raise ProviderValidationError("Moneyline must not carry an opening line.")
                opened_at = _iso(item.get("providerOpenedAt"), "providerOpenedAt") if item.get("providerOpenedAt") else None
                warnings = []
                if status == "unknown": warnings.append("Provider market status is unknown; price is not available.")
                if freshness["state"] in {"stale", "expired", "unavailable"}: warnings.append("Price is not current enough for active comparison.")
                output.append({
                    "id": _identity(*identity), "eventId": event_id, "sportsbookId": book_id,
                    "family": family, "canonicalMarketId": CANONICAL_MARKET_IDS[family], "side": side,
                    "line": line, "decimalOdds": round(decimal, 6), "americanOdds": normalized_american,
                    "oddsFormat": "decimal", "period": period, "settlementScope": scope,
                    "isAlternate": alternate, "isLive": False, "status": status,
                    "suspended": status == "suspended", "providerOpeningDecimalOdds": opening_decimal,
                    "providerOpeningAmericanOdds": decimal_to_american(opening_decimal) if opening_decimal else None,
                    "providerOpeningLine": opening_line,
                    "providerOpenedAt": opened_at, "earliestObservedAt": None,
                    "updatedAt": updated_at, "closedAt": item.get("closedAt"), "freshness": freshness,
                    "validationWarnings": warnings, "source": "normalized_provider_contract",
                    "marketTrust": MlbGameMarketAdapter._market_trust(status, freshness, warnings),
                })
            except ProviderValidationError as error:
                rejected.append({"domain": "markets", "index": index, "code": "invalid_market", "message": str(error)})
        return output

    @staticmethod
    def _mark_incomplete_pairs(prices: list[dict[str, Any]]) -> None:
        groups: dict[tuple[Any, ...], list[dict[str, Any]]] = {}
        for item in prices:
            paired_line = abs(item["line"]) if item["family"] == "run_line" else item["line"]
            groups.setdefault((item["eventId"], item["sportsbookId"], item["family"], paired_line, item["period"], item["settlementScope"], item["isAlternate"]), []).append(item)
        for key, rows in groups.items():
            expected = FAMILY_SIDES[key[2]]
            if {item["side"] for item in rows} != expected:
                for item in rows:
                    item["status"] = "unavailable"
                    item["validationWarnings"].append("Required opposite market side is missing.")
                    item["marketTrust"] = MlbGameMarketAdapter._market_trust(item["status"], item["freshness"], item["validationWarnings"])

    @staticmethod
    def _market_trust(status: str, freshness: dict[str, Any], warnings: list[str]) -> dict[str, Any]:
        return evaluate_edge_trust({
            "market": "passing" if status == "available" else status,
            "freshness": freshness["state"], "identity": "verified",
            "provider_agreement": "unavailable", "coverage": "partial" if warnings else "passing",
        }, applicable={"market", "freshness", "identity", "provider_agreement", "coverage"}, sample=True)


def compare_mlb_market_shadow(fixture: dict[str, Any], candidate: dict[str, Any]) -> list[dict[str, Any]]:
    discrepancies = []
    def key(item: dict[str, Any]) -> tuple[Any, ...]:
        return (item.get("eventId"), item.get("sportsbookId"), item.get("family"), item.get("side"), item.get("line"), item.get("period"), item.get("settlementScope"), item.get("isAlternate"))
    left, right = {key(item): item for item in fixture.get("prices", [])}, {key(item): item for item in candidate.get("prices", [])}
    for identity in sorted(set(left) | set(right), key=str):
        record_id = "|".join(str(value) for value in identity)
        if identity not in left:
            category = "outside_fixture_coverage" if fixture.get("coverage", {}).get("markets") == "representative" else "missing_fixture"
            discrepancies.append({"category": category, "recordId": record_id, "details": {}})
        elif identity not in right:
            discrepancies.append({"category": "missing_live", "recordId": record_id, "details": {}})
        else:
            first, second = left[identity], right[identity]
            if first.get("decimalOdds") != second.get("decimalOdds"):
                discrepancies.append({"category": "price_conflict", "recordId": record_id, "details": {}})
            if first.get("status") != second.get("status"):
                discrepancies.append({"category": "status_conflict", "recordId": record_id, "details": {}})
    return discrepancies


class MlbGameMarketService(MlbDomainService):
    provider_status_fields = ("mlb_market_source", "mlb_market_edge_trust")

    def __init__(self, cache: MemoryCache, rollout: Any, shadow: Any, schedule_service: Any, *, payload_loader: Callable[[], dict[str, Any]] | None = None, shadow_validator: Callable[..., tuple[dict[str, Any] | None, list[dict[str, Any]], ProviderError | None]] | None = None):
        super().__init__(cache, rollout, shadow, schedule_service, payload_loader=payload_loader, shadow_validator=shadow_validator)
        self.adapter, self._lock, self._shadow_lock = MlbGameMarketAdapter(), threading.Lock(), threading.Lock()
        self.provider_requests = 0
        self._last_shadow_report: dict[str, Any] | None = None

    @staticmethod
    def _fixture() -> dict[str, Any]:
        with (Path(__file__).parent / "fixtures" / "mlb_game_markets_ticket5.json").open("r", encoding="utf-8") as handle:
            return json.load(handle)

    def read(self, *, refresh: bool = False, now: datetime | None = None) -> dict[str, Any]:
        key = CachePolicy.key(MLB_MARKET_CONTRACT_VERSION, MLB_MARKET_FIXTURE_PROVIDER, "game_markets", "mlb")
        if not refresh:
            cached, _ = self.cache.get(key)
            if cached is not None: return copy.deepcopy(cached)
        with self._lock:
            if not refresh:
                cached, _ = self.cache.get(key)
                if cached is not None: return copy.deepcopy(cached)
            self.provider_requests += 1
            raw = self.payload_loader()
            reference = now or datetime.fromisoformat(str(raw.get("recordedAt")).replace("Z", "+00:00"))
            data = self.adapter.normalize(raw, self.schedule_service.read(), source_mode="fixture", now=reference)
            data["source"] = {"provider": data["provider"], "mode": "fixture", "sample": True, "liveVerified": False, "lastUpdated": data["recordedAt"], "attribution": data["attribution"]}
            data["edgeTrust"] = evaluate_edge_trust({"market": "fixture", "freshness": "fixture", "identity": "verified", "coverage": "partial", "provider_agreement": "unavailable"}, applicable={"market", "freshness", "identity", "coverage", "provider_agreement"}, sample=True)
            price_ttls = [item["freshness"]["freshForSeconds"] for item in data["prices"] if item["freshness"]["freshForSeconds"] > 0]
            fresh_ttl = max(30, min(price_ttls, default=60))
            if any(item["suspended"] for item in data["prices"]):
                fresh_ttl = min(fresh_ttl, 120)
            self.cache.set(key, data, fresh_ttl, max(600, fresh_ttl * 6), tags=("league:mlb", "domain:odds", "domain:markets"))
            return copy.deepcopy(data)

    def sportsbooks(self) -> dict[str, Any]:
        data = self.read()
        return {"items": data["sportsbooks"], "source": data["source"], "edgeTrust": data["edgeTrust"]}

    def markets(self, *, event_id: str = "", family: str = "", sportsbook_id: str = "", include_suspended: bool = True) -> dict[str, Any]:
        data = self.read()
        items = [item for item in data["prices"] if (not event_id or item["eventId"] == event_id) and (not family or item["family"] == family) and (not sportsbook_id or item["sportsbookId"] == sportsbook_id) and (include_suspended or not item["suspended"])]
        return {"items": items, "source": data["source"], "edgeTrust": data["edgeTrust"], "rejected": data["rejected"]}

    def best_prices(self, *, event_id: str = "", family: str = "") -> dict[str, Any]:
        data = self.read()
        groups: dict[tuple[Any, ...], list[dict[str, Any]]] = {}
        for item in data["prices"]:
            if event_id and item["eventId"] != event_id: continue
            if family and item["family"] != family: continue
            if item["status"] != "available" or item["suspended"] or item["freshness"]["state"] != "fresh": continue
            groups.setdefault((item["eventId"], item["family"], item["side"], item["line"], item["period"], item["settlementScope"], item["isAlternate"]), []).append(item)
        comparisons = []
        for identity, rows in groups.items():
            ordered = sorted(rows, key=lambda item: (-item["decimalOdds"], item["sportsbookId"]))
            values = [item["decimalOdds"] for item in rows]
            comparisons.append({
                "eventId": identity[0], "family": identity[1], "side": identity[2], "line": identity[3],
                "period": identity[4], "settlementScope": identity[5], "isAlternate": identity[6],
                "best": {"sportsbookId": ordered[0]["sportsbookId"], "decimalOdds": ordered[0]["decimalOdds"], "americanOdds": ordered[0]["americanOdds"]},
                "worst": {"sportsbookId": ordered[-1]["sportsbookId"], "decimalOdds": ordered[-1]["decimalOdds"], "americanOdds": ordered[-1]["americanOdds"]},
                "medianDecimalOdds": round(statistics.median(values), 6), "averageDecimalOdds": round(statistics.fmean(values), 6),
                "sportsbookCount": len(rows), "lastUpdated": max(item["updatedAt"] for item in rows), "freshness": "fresh",
                "edgeTrust": evaluate_edge_trust({"market": "passing", "freshness": "fresh", "identity": "verified", "coverage": "passing" if len(rows) > 1 else "partial", "provider_agreement": "unavailable"}, applicable={"market", "freshness", "identity", "coverage", "provider_agreement"}, sample=True),
            })
        return {"items": sorted(comparisons, key=lambda item: (item["eventId"], item["family"], item["side"], item["line"] or 0)), "source": data["source"]}

    def offers(self) -> list[dict[str, Any]]:
        data = self.read()
        groups: dict[tuple[Any, ...], list[dict[str, Any]]] = {}
        for item in data["prices"]:
            groups.setdefault((item["eventId"], item["sportsbookId"], item["family"], item["line"], item["period"], item["settlementScope"], item["isAlternate"]), []).append(item)
        books = {item["id"]: item for item in data["sportsbooks"] if item.get("id")}
        offers = []
        for identity, rows in groups.items():
            current = all(
                item["status"] == "available"
                and item["freshness"]["state"] == "fresh"
                for item in rows
            )
            status = "suspended" if all(item["suspended"] for item in rows) else "open" if current else "unavailable"
            offers.append({
                "offer_id": _identity(*identity), "league_key": "mlb", "event_id": identity[0],
                "market_type": identity[2], "canonical_market_id": CANONICAL_MARKET_IDS[identity[2]],
                "provider_market_id": _identity("provider", *identity), "market_name": identity[2].replace("_", " ").title(),
                "ui_group": "moneylines" if identity[2] == "moneyline" else "spreads" if identity[2] == "run_line" else "totals",
                "period": identity[4], "settlement_scope": identity[5], "is_live": False, "is_alternate": identity[6],
                "sgp_eligible": False, "source": data["provider"], "source_name": books.get(identity[1], {}).get("displayName", "Unresolved sportsbook"),
                "sportsbook_id": identity[1], "last_updated_at": max(item["updatedAt"] for item in rows), "status": status,
                "selections": [{"selection_id": item["id"], "label": item["side"].title(), "side": item["side"], "line": item["line"], "line_display": "Moneyline" if item["line"] is None else str(item["line"]), "american_odds": item["americanOdds"], "decimal_odds": item["decimalOdds"], "sportsbook": books.get(item["sportsbookId"], {}).get("displayName"), "last_updated_at": item["updatedAt"], "available": item["status"] == "available" and item["freshness"]["state"] == "fresh", "suspended": item["suspended"], "data_quality_status": item["freshness"]["state"], "data_quality_warning": " ".join(item["validationWarnings"])} for item in rows],
            })
        return offers

    def _extend_provider_bundle(self, bundle: dict[str, Any], data: dict[str, Any]) -> None:
        bundle["offers"] = [item for item in bundle.get("offers", []) if item.get("league_key") != "mlb"] + self.offers()
        bundle["sportsbooks"] = copy.deepcopy(data["sportsbooks"])
        bundle["best_prices"] = self.best_prices()["items"]

    def run_shadow_validation(self, *, selected_date: str, refresh: bool = False) -> dict[str, Any]:
        if self.rollout.get("mlb")["rolloutState"] != "shadow": raise ValidationError("MLB odds validation requires shadow rollout state.")
        if self.shadow_validator is None: raise ValidationError("No MLB odds shadow provider is configured.")
        key = CachePolicy.key(MLB_MARKET_CONTRACT_VERSION, "sportsdataio", "shadow_game_markets", selected_date)
        cached, cache_state = (None, "miss") if refresh else self.cache.get(key)
        candidate, endpoints, error = None, [], None
        if isinstance(cached, dict): candidate, endpoints = cached.get("candidate"), cached.get("endpoints", [])
        if candidate is None:
            with self._shadow_lock:
                self.provider_requests += 1
                candidate, endpoints, error = self.shadow_validator(selected_date=selected_date)
                if candidate is not None: self.cache.set(key, {"candidate": candidate, "endpoints": endpoints}, 120, 600, private=True, tags=("provider:sportsdataio", "league:mlb", "domain:shadow_odds"))
        if candidate is None:
            report = {"provider":"sportsdataio","exposedAsPrimary":False,"endpoints":endpoints,"normalization":{"accepted":False,"sportsbooks":0,"prices":0,"rejected":0},"errorCode":error.code if error else "provider_error","cache":{"state":cache_state,"private":True},"limitations":["Odds entitlement or data is unavailable; fixture markets remain primary."]}
            self._last_shadow_report = copy.deepcopy(report); return report
        normalized = self.adapter.normalize(candidate, self.schedule_service.adapter.normalize(candidate["scheduleContract"], source_mode="sample"), source_mode="sample")
        fixture = self.read()
        discrepancies = compare_mlb_market_shadow(fixture, normalized)
        recorded = self.shadow.record("mlb", "odds", MLB_MARKET_FIXTURE_PROVIDER, normalized["provider"], discrepancies)
        unresolved_books = sum(item.get("reconciliationState") not in {"confirmed","alias_confirmed"} for item in normalized["sportsbooks"])
        report = {"provider":normalized["provider"],"exposedAsPrimary":False,"candidateMode":"discovery_lab_shadow","primarySource":MLB_MARKET_FIXTURE_PROVIDER,"endpoints":endpoints,"normalization":{"accepted":True,"sportsbooks":len(normalized["sportsbooks"]),"prices":len(normalized["prices"]),"rejected":len(normalized["rejected"]),"families":dict(Counter(item["family"] for item in normalized["prices"])),"suspended":sum(item["suspended"] for item in normalized["prices"]),"stale":sum(item["freshness"]["state"] in {"stale","expired"} for item in normalized["prices"])},"reconciliation":{"unresolvedSportsbooks":unresolved_books,"unresolvedEvents":sum(item["domain"]=="events" for item in normalized["rejected"])},"discrepancies":{"total":len(discrepancies),"recorded":recorded,"categories":dict(Counter(item["category"] for item in discrepancies))},"cache":{"state":cache_state,"private":True},"edgeTrust":evaluate_edge_trust({"market":"partial" if normalized["rejected"] else "passing","freshness":"sample","identity":"partial" if unresolved_books else "verified","coverage":"partial","provider_agreement":"partial" if discrepancies else "passing"}, applicable={"market","freshness","identity","coverage","provider_agreement"}, conflicts=[item for item in discrepancies if item["category"]!="outside_fixture_coverage"][:25], sample=True),"limitations":["Discovery Lab odds may be scrambled and remain shadow-only.","No player props, live odds, parlays, settlement, or historical archive is enabled."]}
        self._last_shadow_report = copy.deepcopy(report); return report

    def shadow_status(self) -> dict[str, Any]:
        return copy.deepcopy(self._last_shadow_report) if self._last_shadow_report else {"status":"not_run","exposedAsPrimary":False}
