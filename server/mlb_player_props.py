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
from .mlb_game_markets import MlbGameMarketAdapter, american_to_decimal, decimal_to_american, odds_freshness
from .mlb_domain_service import MlbDomainService


MLB_PROP_CONTRACT_VERSION = "edgeboard-mlb-player-props-v1"
MLB_PROP_FIXTURE_PROVIDER = "edgeboard-mlb-player-props-fixture"
PROP_STAT_REGISTRY = {
    "pitcher_strikeouts": {"marketId":"baseball-pitcher-strikeouts","statId":"baseball-pitcher-strikeouts","role":"pitcher","label":"Pitcher strikeouts","unit":"strikeouts"},
    "pitcher_outs_recorded": {"marketId":"baseball-pitcher-outs","statId":"baseball-innings-pitched","role":"pitcher","label":"Pitcher outs recorded","unit":"outs"},
    "pitcher_hits_allowed": {"marketId":"baseball-hits-allowed","statId":"baseball-hits-allowed","role":"pitcher","label":"Pitcher hits allowed","unit":"hits"},
    "pitcher_walks_allowed": {"marketId":"baseball-walks-allowed","statId":"baseball-walks-allowed","role":"pitcher","label":"Pitcher walks allowed","unit":"walks"},
    "pitcher_earned_runs_allowed": {"marketId":"baseball-earned-runs-allowed","statId":"baseball-earned-runs","role":"pitcher","label":"Pitcher earned runs allowed","unit":"runs"},
    "batter_hits": {"marketId":"baseball-hits","statId":"baseball-hits","role":"batter","label":"Hits","unit":"hits"},
    "batter_total_bases": {"marketId":"baseball-total-bases","statId":"baseball-total-bases","role":"batter","label":"Total bases","unit":"bases"},
    "batter_home_runs": {"marketId":"baseball-home-runs","statId":"baseball-home-runs","role":"batter","label":"Home runs","unit":"home runs"},
    "batter_rbi": {"marketId":"baseball-runs-batted-in","statId":"baseball-runs-batted-in","role":"batter","label":"Runs batted in","unit":"RBI"},
    "batter_runs": {"marketId":"baseball-runs","statId":"baseball-runs","role":"batter","label":"Runs","unit":"runs"},
    "batter_stolen_bases": {"marketId":"baseball-stolen-bases","statId":"baseball-stolen-bases","role":"batter","label":"Stolen bases","unit":"bases"},
    "batter_walks": {"marketId":"baseball-walks","statId":"baseball-walks","role":"batter","label":"Walks","unit":"walks"},
    "batter_strikeouts": {"marketId":"baseball-strikeouts-batter","statId":"baseball-strikeouts","role":"batter","label":"Batter strikeouts","unit":"strikeouts"},
}
PROP_STAT_REGISTRY = {key: {**value, "family": key, "period":"full_game", "settlementScope":"including_extra_innings", "pushRule":"equal_integer_line_is_push", "aggregation":"single_game_total"} for key, value in PROP_STAT_REGISTRY.items()}
PROP_STATUSES = frozenset({"available", "suspended", "closed", "unavailable", "unknown"})


def _identity(*parts: Any) -> str:
    digest = hashlib.sha256("|".join(str(value) for value in parts).encode()).hexdigest()[:20]
    return f"mlb-prop-{digest}"


def _number(value: Any, label: str) -> float:
    if isinstance(value, bool):
        raise ProviderValidationError(f"MLB prop {label} must be numeric.")
    try:
        result = float(value)
    except (TypeError, ValueError) as error:
        raise ProviderValidationError(f"MLB prop {label} must be numeric.") from error
    if not math.isfinite(result):
        raise ProviderValidationError(f"MLB prop {label} must be finite.")
    return result


def _iso(value: Any, label: str) -> str:
    try:
        parsed = datetime.fromisoformat(str(value or "").replace("Z", "+00:00"))
    except ValueError as error:
        raise ProviderValidationError(f"MLB prop {label} is invalid.") from error
    if parsed.tzinfo is None:
        raise ProviderValidationError(f"MLB prop {label} requires a timezone.")
    return parsed.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def outs_display(outs: Any) -> str:
    value = int(_number(outs, "outs recorded"))
    if value < 0:
        raise ProviderValidationError("MLB pitcher outs cannot be negative.")
    return f"{value // 3}.{value % 3}"


def threshold_analysis(rows: list[dict[str, Any]], stat_id: str, line: Any, side: str) -> dict[str, Any]:
    threshold = _number(line, "threshold")
    if side not in {"over", "under"}:
        raise ProviderValidationError("MLB prop threshold side must be over or under.")
    observations = [row for row in rows if isinstance(row.get("stats", {}).get(stat_id), (int, float)) and not isinstance(row["stats"][stat_id], bool)]
    hits = sum((row["stats"][stat_id] > threshold) if side == "over" else (row["stats"][stat_id] < threshold) for row in observations)
    pushes = sum(row["stats"][stat_id] == threshold for row in observations)
    decisions = len(observations) - pushes
    values = [float(row["stats"][stat_id]) for row in observations]
    return {
        "hits": hits, "misses": decisions - hits, "pushes": pushes,
        "sampleSize": len(observations), "decisionSampleSize": decisions,
        "hitRate": round(hits / decisions * 100, 1) if decisions else None,
        "average": round(statistics.fmean(values), 3) if values else None,
        "median": statistics.median(values) if values else None,
        "minimum": min(values) if values else None, "maximum": max(values) if values else None,
        "descriptiveOnly": True,
        "disclosure": "Historical sample performance excludes pushes from the hit-rate denominator and is not a projection or win probability.",
        "supportingRows": copy.deepcopy(observations),
    }


def compare_mlb_prop_shadow(fixture: dict[str, Any], candidate: dict[str, Any]) -> list[dict[str, Any]]:
    """Compare normalized props without treating a disagreement as a resolution."""
    def key(item: dict[str, Any]) -> tuple[Any, ...]:
        return (item.get("eventId"), item.get("playerId"), item.get("sportsbookId"), item.get("family"), item.get("side"), item.get("isAlternate"))
    left, right = {key(item):item for item in fixture.get("props", [])}, {key(item):item for item in candidate.get("props", [])}
    discrepancies=[]
    for identity in sorted(set(left) | set(right), key=str):
        record_id="|".join(map(str,identity))
        if identity not in left:
            discrepancies.append({"category":"outside_fixture_coverage","recordId":record_id,"details":{}}); continue
        if identity not in right:
            discrepancies.append({"category":"missing_live","recordId":record_id,"details":{}}); continue
        first,second=left[identity],right[identity]
        comparisons=(("canonicalStatId","stat_mapping_conflict"),("line","line_conflict"),("decimalOdds","price_conflict"),("period","scope_conflict"),("settlementScope","scope_conflict"),("status","status_conflict"))
        for field,category in comparisons:
            if first.get(field)!=second.get(field):
                discrepancies.append({"category":category,"recordId":record_id,"details":{"field":field,"fixture":first.get(field),"candidate":second.get(field)}})
    return discrepancies


class MlbPlayerPropAdapter:
    def normalize(self, payload: dict[str, Any], schedule: dict[str, Any], *, source_mode: str | None = None, now: datetime | None = None) -> dict[str, Any]:
        if not isinstance(payload, dict) or not str(payload.get("provider") or "").strip():
            raise ProviderValidationError("MLB player-prop provider payload is invalid.")
        for field in ("events", "sportsbooks", "players", "props", "historicalGameLogs"):
            if not isinstance(payload.get(field), list):
                raise ProviderValidationError(f"MLB player-prop {field} must be an array.")
        rejected: list[dict[str, Any]] = []
        context = MlbGameMarketAdapter().normalize({
            "provider": payload["provider"], "sourceMode": source_mode or payload.get("sourceMode"),
            "recordedAt": payload.get("recordedAt"), "attribution": payload.get("attribution"),
            "coverage": payload.get("coverage"), "events": payload.get("events", []),
            "sportsbooks": payload.get("sportsbooks", []), "prices": [],
        }, schedule, source_mode=source_mode, now=now)
        events = {item["id"]: item for item in context["events"]}
        books = {item["id"]: item for item in context["sportsbooks"] if item.get("id")}
        entities = {item["id"]: item for item in schedule.get("entities", []) if item.get("type") == "athlete"}
        players: dict[str, dict[str, Any]] = {}
        provider_players: dict[str, str] = {}
        for index, raw in enumerate(payload.get("players", [])):
            try:
                canonical = str(raw.get("canonicalPlayerId") or "")
                provider_id = str(raw.get("providerPlayerId") or "")
                entity, role = entities.get(canonical), str(raw.get("role") or "")
                if not provider_id or not entity or canonical in players or provider_id in provider_players:
                    raise ProviderValidationError("Player identity is missing, duplicated, or unresolved.")
                expected_role = "pitcher" if str(entity.get("position") or "").casefold() == "pitcher" else "batter"
                if raw.get("teamId") != entity.get("teamId") or role != expected_role or raw.get("active") is not True:
                    raise ProviderValidationError("Player team, role, or active state conflicts with the canonical entity.")
                players[canonical] = {"id":canonical,"displayName":entity["displayName"],"teamId":entity["teamId"],"role":role,"active":True,"reconciliationState":raw.get("reconciliationState")}
                provider_players[provider_id] = canonical
            except ProviderValidationError as error:
                rejected.append({"domain":"players","index":index,"code":"player_reconciliation_failed","message":str(error)})
        props, identities = [], set()
        for index, raw in enumerate(payload.get("props", [])):
            try:
                event_id, player_id, book_id = str(raw.get("eventId") or ""), str(raw.get("playerId") or ""), raw.get("sportsbookId")
                family, side = str(raw.get("family") or ""), str(raw.get("side") or "")
                definition, player = PROP_STAT_REGISTRY.get(family), players.get(player_id)
                if event_id not in events or book_id not in books or not definition or not player:
                    raise ProviderValidationError("Prop references an unresolved event, sportsbook, player, or family.")
                event_teams = {events[event_id]["awayTeamId"], events[event_id]["homeTeamId"]}
                if raw.get("teamId") != player["teamId"] or player["teamId"] not in event_teams or player["role"] != definition["role"]:
                    raise ProviderValidationError("Prop player, team, event, or role identity conflicts.")
                if side not in {"over", "under"} or raw.get("isLive") is True:
                    raise ProviderValidationError("Only pregame over/under player props are supported.")
                line = _number(raw.get("line"), "line")
                if line < 0:
                    raise ProviderValidationError("MLB prop line cannot be negative.")
                decimal = american_to_decimal(raw.get("americanOdds")) if raw.get("americanOdds") is not None else _number(raw.get("decimalOdds"), "decimal odds")
                if decimal is None or decimal <= 1:
                    raise ProviderValidationError("MLB prop odds are invalid.")
                status = str(raw.get("status") or "unknown")
                if status not in PROP_STATUSES: status = "unknown"
                updated_at = _iso(raw.get("updatedAt"), "updatedAt")
                alternate = raw.get("isAlternate") is True
                identity = (event_id, player_id, book_id, family, side, line, alternate, "full_game", "including_extra_innings")
                if identity in identities:
                    raise ProviderValidationError("Duplicate canonical player prop.")
                identities.add(identity)
                freshness = odds_freshness(updated_at, events[event_id]["startsAt"], now=now, status=status)
                warnings = []
                if status == "unknown": warnings.append("Provider prop status is unknown.")
                if freshness["state"] in {"stale","expired","unavailable"}: warnings.append("Prop price is not current enough for active comparison.")
                props.append({
                    "id":_identity(*identity),"eventId":event_id,"playerId":player_id,"teamId":player["teamId"],"sportsbookId":book_id,
                    "family":family,"canonicalMarketId":definition["marketId"],"canonicalStatId":definition["statId"],"role":definition["role"],
                    "side":side,"line":line,"decimalOdds":round(decimal,6),"americanOdds":decimal_to_american(decimal),"period":"full_game",
                    "settlementScope":"including_extra_innings","isAlternate":alternate,"isLive":False,"status":status,"suspended":status=="suspended",
                    "updatedAt":updated_at,"freshness":freshness,"validationWarnings":warnings,"incompletePair":False,
                })
            except ProviderValidationError as error:
                rejected.append({"domain":"props","index":index,"code":"invalid_prop","message":str(error)})
        pair_groups = Counter((p["eventId"],p["playerId"],p["sportsbookId"],p["family"],p["line"],p["isAlternate"]) for p in props)
        for prop in props:
            key = (prop["eventId"],prop["playerId"],prop["sportsbookId"],prop["family"],prop["line"],prop["isAlternate"])
            prop["incompletePair"] = pair_groups[key] != 2
            if prop["incompletePair"]: prop["validationWarnings"].append("The over/under pair is incomplete; the selection is unavailable.")
        logs, seen_logs = [], set()
        for index, raw in enumerate(payload.get("historicalGameLogs", [])):
            try:
                if raw.get("status") != "completed" or raw.get("playerId") not in players:
                    raise ProviderValidationError("Historical row is not a completed canonical-player row.")
                event_date = str(raw.get("eventDate") or "")
                try: datetime.fromisoformat(event_date)
                except ValueError as error: raise ProviderValidationError("Historical row date is invalid.") from error
                if raw.get("homeAway") not in {"home","away"} or raw.get("teamId") != players[raw["playerId"]]["teamId"] or not raw.get("opponentId"):
                    raise ProviderValidationError("Historical row team, opponent, or home/away scope is invalid.")
                row_id = (raw.get("eventId"), raw.get("playerId"))
                if row_id in seen_logs: raise ProviderValidationError("Duplicate historical player-game row.")
                seen_logs.add(row_id)
                stats = {}
                for stat_id, value in (raw.get("stats") or {}).items():
                    if stat_id not in {item["statId"] for item in PROP_STAT_REGISTRY.values()}: continue
                    stats[stat_id] = _number(value, stat_id)
                    if stat_id == "baseball-innings-pitched" and (stats[stat_id] < 0 or not stats[stat_id].is_integer()):
                        raise ProviderValidationError("Pitcher outs must be a non-negative integer, never base-10 innings.")
                if not stats: raise ProviderValidationError("Historical row has no supported canonical stats.")
                logs.append({"eventId":raw.get("eventId"),"eventDate":event_date,"playerId":raw.get("playerId"),"teamId":raw.get("teamId"),"opponentId":raw.get("opponentId"),"homeAway":raw.get("homeAway"),"status":"completed","stats":stats})
            except ProviderValidationError as error:
                rejected.append({"domain":"historicalGameLogs","index":index,"code":"invalid_historical_row","message":str(error)})
        logs.sort(key=lambda row: (row["playerId"], row["eventDate"]), reverse=True)
        return {"contractVersion":MLB_PROP_CONTRACT_VERSION,"provider":payload["provider"],"sourceMode":source_mode or payload.get("sourceMode") or "fixture","recordedAt":context["recordedAt"],"attribution":payload.get("attribution"),"coverage":copy.deepcopy(payload.get("coverage") or {}),"events":list(events.values()),"sportsbooks":list(books.values()),"players":list(players.values()),"props":props,"historicalGameLogs":logs,"rejected":[*context["rejected"],*rejected],"diagnostics":{"providerPlayerMappings":provider_players}}


class MlbPlayerPropService(MlbDomainService):
    provider_status_fields = ("mlb_player_prop_source", "mlb_player_prop_edge_trust")

    def __init__(self, cache: MemoryCache, rollout: Any, shadow: Any, schedule_service: Any, *, payload_loader: Callable[[], dict[str, Any]] | None = None, shadow_validator: Callable[..., tuple[dict[str, Any] | None, list[dict[str, Any]], ProviderError | None]] | None = None):
        super().__init__(cache, rollout, shadow, schedule_service, payload_loader=payload_loader, shadow_validator=shadow_validator)
        self.adapter, self._lock, self._shadow_lock = MlbPlayerPropAdapter(), threading.Lock(), threading.Lock()
        self.provider_requests, self._last_shadow_report, self._research_cache = 0, None, {}
        self.context_service = None

    @staticmethod
    def _fixture() -> dict[str, Any]:
        with (Path(__file__).parent / "fixtures" / "mlb_player_props_ticket6.json").open("r", encoding="utf-8") as handle: return json.load(handle)

    def read(self, *, refresh: bool = False, now: datetime | None = None) -> dict[str, Any]:
        key = CachePolicy.key(MLB_PROP_CONTRACT_VERSION, MLB_PROP_FIXTURE_PROVIDER, "player_props", "mlb")
        if not refresh:
            cached, _ = self.cache.get(key)
            if cached is not None: return copy.deepcopy(cached)
        with self._lock:
            self.provider_requests += 1
            raw = self.payload_loader(); reference = now or datetime.fromisoformat(str(raw["recordedAt"]).replace("Z", "+00:00"))
            if refresh: self._research_cache.clear()
            data = self.adapter.normalize(raw, self.schedule_service.read(), source_mode="fixture", now=reference)
            data["source"] = {"provider":data["provider"],"mode":"fixture","sample":True,"liveVerified":False,"lastUpdated":data["recordedAt"],"attribution":data["attribution"]}
            data["edgeTrust"] = evaluate_edge_trust({"market":"fixture","freshness":"fixture","identity":"verified","coverage":"partial","historical_data":"fixture","provider_agreement":"unavailable"}, applicable={"market","freshness","identity","coverage","historical_data","provider_agreement"}, sample=True)
            self.cache.set(key, data, 300, 1800, tags=("league:mlb","domain:player_props","domain:historical_statistics"))
            return copy.deepcopy(data)

    def props(self, *, event_id: str = "", player_id: str = "", family: str = "", sportsbook_id: str = "", include_suspended: bool = True) -> dict[str, Any]:
        data = self.read(); items = [p for p in data["props"] if (not event_id or p["eventId"]==event_id) and (not player_id or p["playerId"]==player_id) and (not family or p["family"]==family) and (not sportsbook_id or p["sportsbookId"]==sportsbook_id) and (include_suspended or not p["suspended"])]
        return {"items":items,"registry":copy.deepcopy(PROP_STAT_REGISTRY),"source":data["source"],"edgeTrust":data["edgeTrust"],"rejected":data["rejected"]}

    def best_prices(self, *, event_id: str = "", family: str = "") -> dict[str, Any]:
        data = self.read(); groups: dict[tuple[Any,...],list[dict[str,Any]]] = {}
        for p in data["props"]:
            if (event_id and p["eventId"]!=event_id) or (family and p["family"]!=family) or p["status"]!="available" or p["suspended"] or p["freshness"]["state"]!="fresh" or p["incompletePair"]: continue
            groups.setdefault((p["eventId"],p["playerId"],p["family"],p["side"],p["line"],p["period"],p["settlementScope"]),[]).append(p)
        items=[]
        for key, rows in groups.items():
            ordered=sorted(rows,key=lambda p:(-p["decimalOdds"],p["sportsbookId"])); values=[p["decimalOdds"] for p in rows]
            items.append({"eventId":key[0],"playerId":key[1],"family":key[2],"side":key[3],"line":key[4],"period":key[5],"settlementScope":key[6],"best":ordered[0],"worst":ordered[-1],"medianDecimalOdds":round(statistics.median(values),6),"averageDecimalOdds":round(statistics.fmean(values),6),"sportsbookCount":len(rows),"sameLineComparison":True})
        return {"items":items,"source":data["source"],"disclosure":"Best-price comparisons hold player, event, family, side, period, settlement scope, and line constant. Best line is a separate concept."}

    def best_lines(self, *, event_id: str = "", family: str = "") -> dict[str, Any]:
        data=self.read(); groups: dict[tuple[Any,...],list[dict[str,Any]]] = {}
        for p in data["props"]:
            if (event_id and p["eventId"]!=event_id) or (family and p["family"]!=family) or p["status"]!="available" or p["suspended"] or p["freshness"]["state"]!="fresh" or p["incompletePair"]: continue
            groups.setdefault((p["eventId"],p["playerId"],p["family"],p["side"],p["period"],p["settlementScope"]),[]).append(p)
        items=[]
        for key, rows in groups.items():
            ordered=sorted(rows,key=lambda p:(p["line"] if p["side"]=="over" else -p["line"],-p["decimalOdds"],p["sportsbookId"]))
            items.append({"eventId":key[0],"playerId":key[1],"family":key[2],"side":key[3],"period":key[4],"settlementScope":key[5],"mostFavorableThreshold":ordered[0],"availableLineCount":len({p["line"] for p in rows})})
        return {"items":items,"source":data["source"],"disclosure":"Line favorability is a threshold comparison only. Different prices at different lines are not combined or ranked as equivalent value."}

    def research(self, prop_id: str) -> dict[str, Any]:
        data=self.read(); prop=next((p for p in data["props"] if p["id"]==prop_id),None)
        if prop is None: raise ValidationError("Unknown MLB player prop.")
        context = self.context_service.context(player_id=prop["playerId"], event_id=prop["eventId"]) if self.context_service else None
        context_updated = context.get("source", {}).get("lastUpdated") if context else None
        cache_key=(prop["eventId"],prop["playerId"],prop["sportsbookId"],prop["family"],prop["side"],prop["line"],prop["updatedAt"],data["recordedAt"],context_updated)
        if cache_key in self._research_cache: return copy.deepcopy(self._research_cache[cache_key])
        player=next(p for p in data["players"] if p["id"]==prop["playerId"]); event=next(e for e in data["events"] if e["id"]==prop["eventId"])
        rows=[r for r in data["historicalGameLogs"] if r["playerId"]==prop["playerId"]]
        opponent=event["homeTeamId"] if player["teamId"]==event["awayTeamId"] else event["awayTeamId"]
        windows={"last5":rows[:5],"last10":rows[:10],"last20":rows[:20],"season":rows,"home":[r for r in rows if r["homeAway"]=="home"],"away":[r for r in rows if r["homeAway"]=="away"],"opponent":[r for r in rows if r["opponentId"]==opponent]}
        analysis={key:threshold_analysis(value,prop["canonicalStatId"],prop["line"],prop["side"]) for key,value in windows.items()}
        limitations=["Fixture/sample evidence only; this is not live data.","Historical hit rate is descriptive and is not a projection or win probability."]
        if len(rows)<20: limitations.append(f"Only {len(rows)} completed sample rows are available; Last 20 is partial.")
        if prop["freshness"]["state"]!="fresh": limitations.append("The displayed prop price is not fresh.")
        trust=evaluate_edge_trust({"market":"fixture","freshness":"fixture","identity":"verified","coverage":min(1,len(rows)/20),"historical_data":"fixture","provider_agreement":"partial" if self.best_prices(family=prop["family"])["items"] else "unavailable"}, applicable={"market","freshness","identity","coverage","historical_data","provider_agreement"}, sample=True)
        result={"status":"ready","deterministic":True,"llmSourceOfTruth":False,"prop":prop,"player":player,"event":event,"definition":copy.deepcopy(PROP_STAT_REGISTRY[prop["family"]]),"historicalWindows":analysis,"currentWindow":"last10","counterarguments":limitations,"visualizations":[{"type":"threshold_history","statId":prop["canonicalStatId"],"line":prop["line"],"supportingRows":analysis["last10"]["supportingRows"]}],"bestPriceComparison":next((x for x in self.best_prices(event_id=prop["eventId"],family=prop["family"])["items"] if x["playerId"]==prop["playerId"] and x["side"]==prop["side"] and x["line"]==prop["line"]),None),"context":context,"source":data["source"],"edgeTrust":trust,"limitations":limitations}
        self._research_cache[cache_key]=copy.deepcopy(result)
        return result

    def invalidate_context_research(self) -> None:
        self._research_cache.clear()

    def offers(self) -> list[dict[str, Any]]:
        data=self.read(); players={p["id"]:p for p in data["players"]}; books={b["id"]:b for b in data["sportsbooks"]}; groups={}
        for p in data["props"]: groups.setdefault((p["eventId"],p["sportsbookId"],p["playerId"],p["family"],p["line"],p["period"],p["settlementScope"],p["isAlternate"]),[]).append(p)
        all_prices=self.best_prices()["items"]
        offers=[]
        for key, rows in groups.items():
            definition=PROP_STAT_REGISTRY[key[3]]; player=players[key[2]]; status="suspended" if all(p["suspended"] for p in rows) else "open" if all(p["status"]=="available" and not p["incompletePair"] for p in rows) else "unavailable"
            selections=[]
            for p in rows:
                comparison=next((x for x in all_prices if x["eventId"]==p["eventId"] and x["playerId"]==p["playerId"] and x["family"]==p["family"] and x["side"]==p["side"] and x["line"]==p["line"]),None)
                book_prices=[] if not comparison else [{"sportsbook":books[x["sportsbookId"]]["displayName"],"odds":x["americanOdds"],"line":x["line"],"observed_at":x["updatedAt"],"verification":"verified"} for x in [comparison["best"],comparison["worst"]]]
                selections.append({"selection_id":p["id"],"label":f'{player["displayName"]} {p["side"].title()} {p["line"]:g}',"side":p["side"],"line":p["line"],"line_display":f'{p["side"].title()} {p["line"]:g}',"american_odds":p["americanOdds"],"decimal_odds":p["decimalOdds"],"participant":{"id":player["id"],"name":player["displayName"],"participant_type":"athlete"},"team_id":player["teamId"],"opponent_id":next(team for team in (data["events"][0]["awayTeamId"],data["events"][0]["homeTeamId"]) if team!=player["teamId"]),"prop_type":definition["marketId"],"canonical_stat_id":definition["statId"],"sportsbook":books[p["sportsbookId"]]["displayName"],"last_updated_at":p["updatedAt"],"available":status=="open","suspended":p["suspended"],"confirmed":True,"source_mode":"sample","source":data["provider"],"data_quality_status":p["freshness"]["state"],"data_quality_warning":" ".join(p["validationWarnings"]),"book_prices":book_prices})
            offers.append({"offer_id":_identity(*key),"league_key":"mlb","event_id":key[0],"market_type":"player_prop","canonical_market_id":definition["marketId"],"provider_market_id":_identity("provider",*key),"market_name":definition["label"],"ui_group":"player_props","period":key[5],"settlement_scope":key[6],"is_live":False,"is_alternate":key[7],"sgp_eligible":False,"source":data["provider"],"source_name":books[key[1]]["displayName"],"sportsbook_id":key[1],"source_mode":"sample","last_updated_at":max(p["updatedAt"] for p in rows),"status":status,"selections":selections})
        return offers

    def _extend_provider_bundle(self, bundle: dict[str, Any], data: dict[str, Any]) -> None:
        bundle["offers"] = [*bundle.get("offers", []), *self.offers()]

    def run_shadow_validation(self, *, selected_date: str, refresh: bool = False) -> dict[str, Any]:
        if self.rollout.get("mlb")["rolloutState"]!="shadow": raise ValidationError("MLB prop validation requires shadow rollout state.")
        if self.shadow_validator is None: raise ValidationError("No MLB player-prop shadow provider is configured.")
        candidate,endpoints,error=self.shadow_validator(selected_date=selected_date)
        if candidate is None:
            report={"provider":"sportsdataio","exposedAsPrimary":False,"endpoints":endpoints,"normalization":{"accepted":False,"props":0},"errorCode":error.code if error else "provider_error","limitations":["Player-prop entitlement or data is unavailable; fixtures remain primary."]}; self._last_shadow_report=report; return copy.deepcopy(report)
        normalized=self.adapter.normalize(candidate,self.schedule_service.adapter.normalize(candidate["scheduleContract"],source_mode="sample"),source_mode="sample")
        fixture=self.read(); discrepancies=compare_mlb_prop_shadow(fixture,normalized)
        self.shadow.record("mlb","player_props",MLB_PROP_FIXTURE_PROVIDER,normalized["provider"],discrepancies)
        report={"provider":normalized["provider"],"exposedAsPrimary":False,"candidateMode":"discovery_lab_shadow","endpoints":endpoints,"normalization":{"accepted":True,"props":len(normalized["props"]),"rejected":len(normalized["rejected"]),"families":dict(Counter(p["family"] for p in normalized["props"]))},"discrepancies":{"total":len(discrepancies),"categories":dict(Counter(d["category"] for d in discrepancies))},"edgeTrust":evaluate_edge_trust({"market":"partial" if normalized["rejected"] else "passing","freshness":"sample","identity":"verified","coverage":"partial","historical_data":"unavailable","provider_agreement":"partial" if discrepancies else "passing"}, applicable={"market","freshness","identity","coverage","historical_data","provider_agreement"}, conflicts=discrepancies[:25], sample=True),"limitations":["Discovery Lab props may be scrambled and remain shadow-only.","No projection, recommendation, live polling, or wager execution is enabled."]}
        self._last_shadow_report=copy.deepcopy(report); return report

    def shadow_status(self) -> dict[str, Any]:
        return copy.deepcopy(self._last_shadow_report) if self._last_shadow_report else {"status":"not_run","exposedAsPrimary":False}
