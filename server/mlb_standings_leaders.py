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
from .database import Database, utc_now
from .edge_trust import evaluate_edge_trust
from .errors import ProviderError, ProviderValidationError, ValidationError
from .mlb_domain_service import MlbDomainService


MLB_RESEARCH_CONTRACT_VERSION = "edgeboard-mlb-standings-leaders-v1"
MLB_RESEARCH_FIXTURE_PROVIDER = "edgeboard-mlb-standings-leaders-fixture"

# These definitions mirror the existing client stat registry. Provider aliases are
# intentionally confined to the SportsDataIO adapter; APIs expose only these IDs.
MLB_STAT_DEFINITIONS: dict[str, dict[str, Any]] = {
    "baseball-batting-average": {"field": "battingAverage", "kind": "rate", "qualification": "plate_appearances", "higherIsBetter": True},
    "baseball-on-base-percentage": {"field": "onBasePercentage", "kind": "rate", "qualification": "plate_appearances", "higherIsBetter": True},
    "baseball-slugging-percentage": {"field": "sluggingPercentage", "kind": "rate", "qualification": "plate_appearances", "higherIsBetter": True},
    "baseball-ops": {"field": "ops", "kind": "rate", "qualification": "plate_appearances", "higherIsBetter": True},
    "baseball-hits": {"field": "hits", "kind": "count", "qualification": None, "higherIsBetter": True},
    "baseball-home-runs": {"field": "homeRuns", "kind": "count", "qualification": None, "higherIsBetter": True},
    "baseball-runs-batted-in": {"field": "runsBattedIn", "kind": "count", "qualification": None, "higherIsBetter": True},
    "baseball-runs": {"field": "runs", "kind": "count", "qualification": None, "higherIsBetter": True},
    "baseball-stolen-bases": {"field": "stolenBases", "kind": "count", "qualification": None, "higherIsBetter": True},
    "baseball-doubles": {"field": "doubles", "kind": "count", "qualification": None, "higherIsBetter": True},
    "baseball-triples": {"field": "triples", "kind": "count", "qualification": None, "higherIsBetter": True},
    "baseball-walks": {"field": "walks", "kind": "count", "qualification": None, "higherIsBetter": True},
    "baseball-total-bases": {"field": "totalBases", "kind": "count", "qualification": None, "higherIsBetter": True},
    "baseball-pitcher-wins": {"field": "wins", "kind": "count", "qualification": None, "higherIsBetter": True},
    "baseball-era": {"field": "earnedRunAverage", "kind": "rate", "qualification": "innings_pitched", "higherIsBetter": False},
    "baseball-whip": {"field": "whip", "kind": "rate", "qualification": "innings_pitched", "higherIsBetter": False},
    "baseball-pitcher-strikeouts": {"field": "pitcherStrikeouts", "kind": "count", "qualification": None, "higherIsBetter": True},
    "baseball-saves": {"field": "saves", "kind": "count", "qualification": None, "higherIsBetter": True},
    "baseball-innings-pitched": {"field": "inningsPitchedOuts", "kind": "count", "qualification": None, "higherIsBetter": True, "unit": "outs"},
    "baseball-walks-allowed": {"field": "walksAllowed", "kind": "count", "qualification": None, "higherIsBetter": False},
    "baseball-hits-allowed": {"field": "hitsAllowed", "kind": "count", "qualification": None, "higherIsBetter": False},
}

TEAM_STAT_FIELDS = frozenset({
    "baseball-runs", "baseball-hits", "baseball-home-runs", "baseball-era", "baseball-whip",
})


def _finite(value: Any, field: str, *, integer: bool = False, minimum: float = 0) -> int | float | None:
    if value in (None, ""):
        return None
    if isinstance(value, bool):
        raise ProviderValidationError(f"MLB {field} must be numeric.")
    try:
        number = float(value)
    except (TypeError, ValueError) as error:
        raise ProviderValidationError(f"MLB {field} must be numeric.") from error
    if not math.isfinite(number) or number < minimum:
        raise ProviderValidationError(f"MLB {field} is outside the accepted range.")
    if integer:
        if not number.is_integer():
            raise ProviderValidationError(f"MLB {field} must be an integer.")
        return int(number)
    return number


def _text(value: Any, field: str) -> str:
    result = str(value or "").strip()
    if not result:
        raise ProviderValidationError(f"MLB {field} is required.")
    return result


def _competition_rank(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    prior: float | None = None
    prior_rank = 0
    ranked = []
    for index, entry in enumerate(entries):
        value = float(entry["value"])
        rank = prior_rank if prior is not None and value == prior else index + 1
        ranked.append({**entry, "rank": rank})
        prior, prior_rank = value, rank
    return ranked


def _qualification(row: dict[str, Any], definition: dict[str, Any], team_games: dict[str, int]) -> dict[str, Any]:
    rule = definition.get("qualification")
    if not rule:
        return {
            "status": "not_applicable", "qualified": True, "observed": None,
            "minimum": None, "rule": "Counting statistic; no rate-stat qualification threshold applies.",
        }
    games = team_games.get(str(row.get("teamId") or ""))
    if games is None:
        return {
            "status": "unknown", "qualified": False, "observed": None, "minimum": None,
            "rule": "Team games are unavailable, so the proportional MLB qualification threshold cannot be verified.",
        }
    if rule == "plate_appearances":
        observed = _finite(row.get("plateAppearances"), "plate appearances", integer=True)
        minimum = int(round(games * 3.1))
        label = "At least 3.1 plate appearances per team game (nearest whole appearance)."
        unit = "plate appearances"
    else:
        observed_outs = _finite(row.get("inningsPitchedOuts"), "innings pitched outs", integer=True)
        observed = None if observed_outs is None else observed_outs / 3
        minimum = games
        label = "At least one inning pitched per team game. Innings are stored as outs, never base-10 decimals."
        unit = "innings"
    qualified = observed is not None and observed >= minimum
    return {
        "status": "qualified" if qualified else "unqualified", "qualified": qualified,
        "observed": observed, "minimum": minimum, "unit": unit, "teamGames": games, "rule": label,
    }


class MlbStandingsLeadersAdapter:
    """Validate a provider-neutral aggregate contract and quarantine malformed siblings."""

    def normalize(self, payload: dict[str, Any], *, source_mode: str | None = None) -> dict[str, Any]:
        if not isinstance(payload, dict):
            raise ProviderValidationError("MLB standings/leader payload must be an object.")
        provider = _text(payload.get("provider"), "provider")
        mode = str(source_mode or payload.get("sourceMode") or "fixture").strip().lower()
        if mode not in {"fixture", "sample", "live", "cached", "degraded"}:
            raise ProviderValidationError("MLB standings/leader source mode is invalid.")
        season = _finite(payload.get("season"), "season", integer=True, minimum=1876)
        if season is None or season > datetime.now(timezone.utc).year + 1:
            raise ProviderValidationError("MLB season is invalid.")
        recorded_at = _text(payload.get("recordedAt"), "recordedAt")
        try:
            datetime.fromisoformat(recorded_at.replace("Z", "+00:00"))
        except ValueError as error:
            raise ProviderValidationError("MLB recordedAt is invalid.") from error
        rejected: list[dict[str, Any]] = []
        standings = self._standings(payload.get("standings"), rejected)
        players = self._stats(payload.get("playerSeasonStats"), "player", rejected)
        teams = self._stats(payload.get("teamSeasonStats"), "team", rejected)
        return {
            "contractVersion": MLB_RESEARCH_CONTRACT_VERSION, "provider": provider,
            "sourceMode": mode, "season": season, "recordedAt": recorded_at,
            "attribution": str(payload.get("attribution") or provider),
            "coverage": copy.deepcopy(payload.get("coverage") or {}),
            "standings": standings, "playerSeasonStats": players, "teamSeasonStats": teams,
            "rejected": rejected,
        }

    @staticmethod
    def _standings(value: Any, rejected: list[dict[str, Any]]) -> list[dict[str, Any]]:
        if not isinstance(value, list):
            raise ProviderValidationError("MLB standings must be an array.")
        rows, seen = [], set()
        for index, item in enumerate(value):
            try:
                if not isinstance(item, dict):
                    raise ProviderValidationError("Standing row must be an object.")
                team_id = _text(item.get("teamId"), "standing.teamId")
                if team_id in seen:
                    raise ProviderValidationError("Duplicate standing team.")
                seen.add(team_id)
                wins = _finite(item.get("wins"), "wins", integer=True)
                losses = _finite(item.get("losses"), "losses", integer=True)
                if wins is None or losses is None:
                    raise ProviderValidationError("Standing wins and losses are required.")
                home_wins = _finite(item.get("homeWins"), "home wins", integer=True)
                home_losses = _finite(item.get("homeLosses"), "home losses", integer=True)
                away_wins = _finite(item.get("awayWins"), "away wins", integer=True)
                away_losses = _finite(item.get("awayLosses"), "away losses", integer=True)
                if None not in {home_wins, home_losses, away_wins, away_losses} and (home_wins + away_wins != wins or home_losses + away_losses != losses):
                    raise ProviderValidationError("Home and away records contradict the overall record.")
                runs_for = _finite(item.get("runsFor"), "runs for", integer=True)
                runs_against = _finite(item.get("runsAgainst"), "runs against", integer=True)
                games = wins + losses
                rows.append({
                    "teamId": team_id, "teamName": _text(item.get("teamName"), "standing.teamName"),
                    "league": _text(item.get("league"), "standing.league"),
                    "division": _text(item.get("division"), "standing.division"),
                    "wins": wins, "losses": losses, "gamesPlayed": games,
                    "winningPercentage": round(wins / games, 3) if games else None,
                    "homeRecord": ({"wins": home_wins, "losses": home_losses} if home_wins is not None and home_losses is not None else None),
                    "awayRecord": ({"wins": away_wins, "losses": away_losses} if away_wins is not None and away_losses is not None else None),
                    "runsFor": runs_for, "runsAgainst": runs_against,
                    "runDifferential": runs_for - runs_against if runs_for is not None and runs_against is not None else None,
                    "streak": str(item.get("streak") or "").strip() or None,
                    "lastTen": ({"wins": _finite(item.get("lastTenWins"), "last ten wins", integer=True), "losses": _finite(item.get("lastTenLosses"), "last ten losses", integer=True)} if item.get("lastTenWins") is not None and item.get("lastTenLosses") is not None else None),
                    "gamesBack": _finite(item.get("gamesBack"), "games back"),
                    "divisionRank": _finite(item.get("divisionRank"), "division rank", integer=True, minimum=1),
                    "wildCardRank": _finite(item.get("wildCardRank"), "wild card rank", integer=True, minimum=1),
                    "clinched": {"division": item.get("clinchedDivision") is True, "playoff": item.get("clinchedPlayoff") is True},
                })
            except ProviderValidationError as error:
                rejected.append({"domain": "standings", "index": index, "code": "invalid_standing", "message": str(error)})
        return rows

    @staticmethod
    def _stats(value: Any, entity_type: str, rejected: list[dict[str, Any]]) -> list[dict[str, Any]]:
        if not isinstance(value, list):
            raise ProviderValidationError(f"MLB {entity_type} season stats must be an array.")
        rows, seen = [], set()
        id_field = "playerId" if entity_type == "player" else "teamId"
        for index, item in enumerate(value):
            try:
                if not isinstance(item, dict):
                    raise ProviderValidationError("Season stat row must be an object.")
                entity_id = _text(item.get(id_field), f"{entity_type}.{id_field}")
                if entity_id in seen:
                    raise ProviderValidationError("Duplicate aggregate stat row.")
                seen.add(entity_id)
                normalized = {id_field: entity_id, "teamId": _text(item.get("teamId"), f"{entity_type}.teamId")}
                if entity_type == "player":
                    normalized["playerName"] = _text(item.get("playerName"), "player.playerName")
                for definition in MLB_STAT_DEFINITIONS.values():
                    field = definition["field"]
                    if field in item:
                        try:
                            normalized[field] = _finite(item.get(field), field, integer=field not in {"battingAverage", "onBasePercentage", "sluggingPercentage", "ops", "earnedRunAverage", "whip"})
                        except ProviderValidationError as error:
                            rejected.append({"domain": f"{entity_type}_season_stats", "index": index, "field": field, "code": "invalid_stat_field", "message": str(error)})
                for field in ("games", "plateAppearances", "atBats"):
                    if field in item:
                        try:
                            normalized[field] = _finite(item.get(field), field, integer=True)
                        except ProviderValidationError as error:
                            rejected.append({"domain": f"{entity_type}_season_stats", "index": index, "field": field, "code": "invalid_stat_field", "message": str(error)})
                rows.append(normalized)
            except ProviderValidationError as error:
                rejected.append({"domain": f"{entity_type}_season_stats", "index": index, "code": "invalid_stat_row", "message": str(error)})
        return rows


def compare_mlb_research_shadow(fixture: dict[str, Any], candidate: dict[str, Any]) -> list[dict[str, Any]]:
    discrepancies: list[dict[str, Any]] = []
    for domain, key, identity in (
        ("standings", "standings", "teamId"),
        ("player_statistics", "playerSeasonStats", "playerId"),
        ("team_statistics", "teamSeasonStats", "teamId"),
    ):
        left = {str(row.get(identity)): row for row in fixture.get(key, []) if isinstance(row, dict) and row.get(identity)}
        right = {str(row.get(identity)): row for row in candidate.get(key, []) if isinstance(row, dict) and row.get(identity)}
        for record_id in sorted(set(left) | set(right)):
            if record_id not in left:
                category = "outside_fixture_coverage" if fixture.get("coverage", {}).get(key) == "representative" else "missing_fixture"
                discrepancies.append({"category": category, "domain": domain, "recordId": record_id, "details": {"fixtureCoverage": fixture.get("coverage", {}).get(key, "unknown")}})
            elif record_id not in right:
                discrepancies.append({"category": "missing_candidate", "domain": domain, "recordId": record_id, "details": {}})
            else:
                changed = sorted(field for field in set(left[record_id]) | set(right[record_id]) if left[record_id].get(field) != right[record_id].get(field))
                if changed:
                    discrepancies.append({"category": "value_conflict", "domain": domain, "recordId": record_id, "details": {"fields": changed}})
    return discrepancies


class MlbStandingsLeadersService(MlbDomainService):
    """Fixture-primary MLB standings/leaderboards with an optional server-only shadow validator."""

    provider_status_fields = ("mlb_research_source", "mlb_research_edge_trust")

    def __init__(
        self, cache: MemoryCache, database: Database, rollout: Any, shadow: Any, *,
        payload_loader: Callable[[], dict[str, Any]] | None = None,
        shadow_validator: Callable[..., tuple[dict[str, Any] | None, list[dict[str, Any]], ProviderError | None]] | None = None,
    ):
        super().__init__(cache, rollout, shadow, payload_loader=payload_loader, shadow_validator=shadow_validator)
        self.database = database
        self.adapter = MlbStandingsLeadersAdapter()
        self._lock = threading.Lock()
        self._shadow_lock = threading.Lock()
        self.provider_requests = 0
        self._last_shadow_report: dict[str, Any] | None = None

    @staticmethod
    def _fixture() -> dict[str, Any]:
        with (Path(__file__).parent / "fixtures" / "mlb_standings_leaders_ticket4.json").open("r", encoding="utf-8") as handle:
            return json.load(handle)

    def read(self, season: int | None = None, *, refresh: bool = False) -> dict[str, Any]:
        selected = int(season or 2026)
        key = CachePolicy.key(MLB_RESEARCH_CONTRACT_VERSION, MLB_RESEARCH_FIXTURE_PROVIDER, "standings_leaders", f"mlb:{selected}")
        if not refresh:
            cached, _ = self.cache.get(key)
            if cached is not None:
                return copy.deepcopy(cached)
        with self._lock:
            if not refresh:
                cached, _ = self.cache.get(key)
                if cached is not None:
                    return copy.deepcopy(cached)
            self.provider_requests += 1
            data = self.adapter.normalize(self.payload_loader(), source_mode="fixture")
            if data["season"] != selected:
                raise ValidationError("The fixture does not cover the requested MLB season.")
            result = {**data, "source": self._source(data), "edgeTrust": self._trust(data)}
            self.cache.set(key, result, 900, 3600, tags=("league:mlb", "domain:standings", "domain:historical_statistics"))
            return copy.deepcopy(result)

    def standings(self, season: int | None = None) -> dict[str, Any]:
        data = self.read(season)
        divisions: dict[str, list[dict[str, Any]]] = {}
        for row in data["standings"]:
            divisions.setdefault(f'{row["league"]} {row["division"]}', []).append(row)
        for rows in divisions.values():
            rows.sort(key=lambda item: (item["divisionRank"] or 999, item["teamId"]))
        return {
            "season": data["season"], "items": data["standings"], "divisions": divisions,
            "source": data["source"], "edgeTrust": data["edgeTrust"], "rejected": data["rejected"],
            "coverageNotice": "Representative fixture standings; not a complete or live MLB table.",
        }

    def team_record(self, team_id: str, season: int | None = None) -> dict[str, Any] | None:
        data = self.read(season)
        row = next((item for item in data["standings"] if item["teamId"] == team_id), None)
        if row is None:
            return None
        return {
            "teamId": team_id, "season": data["season"], "record": row,
            "oneRunRecord": None, "extraInningRecord": None,
            "unavailable": [
                "One-run record requires completed canonical game scores not supplied by this Ticket 4 aggregate fixture.",
                "Extra-inning record requires completed canonical inning context not supplied by this Ticket 4 aggregate fixture.",
            ],
            "source": data["source"], "edgeTrust": data["edgeTrust"],
        }

    def provider_bundle(self, base: dict[str, Any], season: int | None = None) -> dict[str, Any]:
        """Attach provider-neutral context for existing profile/story/visual consumers."""
        data = self.read(season)
        return self._build_provider_bundle(base, data)

    def _extend_provider_bundle(self, bundle: dict[str, Any], data: dict[str, Any]) -> None:
        bundle["standings"] = copy.deepcopy(data["standings"])
        bundle["leaderboards"] = {
            stat_id: self.leaderboard(stat_id, data["season"])
            for stat_id in (
                "baseball-batting-average", "baseball-ops", "baseball-home-runs",
                "baseball-era", "baseball-whip", "baseball-pitcher-strikeouts", "baseball-saves",
            )
        }
        bundle["team_records"] = {
            row["teamId"]: self.team_record(row["teamId"], data["season"])
            for row in data["standings"]
        }

    def leaderboard(
        self, stat_id: str, season: int | None = None, *, entity_type: str = "player",
        qualified_only: bool = True, limit: int = 10,
    ) -> dict[str, Any]:
        definition = MLB_STAT_DEFINITIONS.get(stat_id)
        if definition is None:
            raise ValidationError("Unsupported canonical MLB leaderboard statistic.")
        if entity_type not in {"player", "team"}:
            raise ValidationError("MLB leaderboard entity type must be player or team.")
        if entity_type == "team" and stat_id not in TEAM_STAT_FIELDS:
            raise ValidationError("This statistic is not available for MLB team leaderboards.")
        data = self.read(season)
        rows = data["playerSeasonStats"] if entity_type == "player" else data["teamSeasonStats"]
        team_games = {row["teamId"]: row["gamesPlayed"] for row in data["standings"]}
        entries = []
        for row in rows:
            value = row.get(definition["field"])
            if value is None:
                continue
            qualification = (
                {"status": "not_applicable", "qualified": True, "observed": row.get("games"),
                 "minimum": None, "rule": "Team aggregate; the player rate-stat threshold does not apply."}
                if entity_type == "team" else _qualification(row, definition, team_games)
            )
            if qualified_only and not qualification["qualified"]:
                continue
            entity_id = row["playerId"] if entity_type == "player" else row["teamId"]
            entries.append({
                "entityId": entity_id,
                "displayName": row.get("playerName") or row["teamId"],
                "teamId": row.get("teamId"), "value": value,
                "sampleSize": row.get("plateAppearances") or row.get("inningsPitchedOuts") or row.get("games"),
                "qualification": qualification,
            })
        entries.sort(key=lambda item: ((item["value"] if definition["higherIsBetter"] is False else -item["value"]), item["entityId"]))
        ranked = _competition_rank(entries)
        available_only = data["sourceMode"] in {"fixture", "sample", "degraded"} or data.get("coverage", {}).get("playerSeasonStats") != "complete"
        return {
            "season": data["season"], "statId": stat_id, "entityType": entity_type,
            "items": ranked[:max(1, min(int(limit), 100))], "totalQualified": len(ranked),
            "sortDirection": "ascending" if definition["higherIsBetter"] is False else "descending",
            "tieStrategy": "Shared competition rank (1, 2, 2, 4); canonical entity ID stabilizes display order only.",
            "qualificationRule": definition.get("qualification") or "not_applicable",
            "officialLeaderWordingAllowed": not available_only and all(item["qualification"]["status"] != "unknown" for item in ranked),
            "leaderLabel": "Available-data leader" if available_only else "Qualified league leader",
            "source": data["source"], "edgeTrust": data["edgeTrust"], "rejected": data["rejected"],
        }

    def run_shadow_validation(self, *, season: int, refresh: bool = False) -> dict[str, Any]:
        if self.rollout.get("mlb")["rolloutState"] != "shadow":
            raise ValidationError("MLB standings/leader validation requires shadow rollout state.")
        if self.shadow_validator is None:
            raise ValidationError("No MLB standings/leader shadow provider is configured.")
        key = CachePolicy.key(MLB_RESEARCH_CONTRACT_VERSION, "sportsdataio", "shadow_standings_leaders", f"mlb:{season}")
        cached, cache_state = (None, "miss") if refresh else self.cache.get(key)
        candidate, endpoints, error = None, [], None
        if isinstance(cached, dict):
            candidate, endpoints = cached.get("candidate"), cached.get("endpoints", [])
        if candidate is None:
            with self._shadow_lock:
                self.provider_requests += 1
                candidate, endpoints, error = self.shadow_validator(season=season)
                if candidate is not None:
                    self.cache.set(key, {"candidate": candidate, "endpoints": endpoints}, 900, 3600, private=True,
                                   tags=("provider:sportsdataio", "league:mlb", "domain:shadow_standings_leaders"))
        fixture = self.read(season)
        if candidate is None:
            report = self._unavailable_report(season, endpoints, error, cache_state)
            self._last_shadow_report = copy.deepcopy(report)
            return report
        normalized = self.adapter.normalize(candidate, source_mode="sample")
        discrepancies = compare_mlb_research_shadow(fixture, normalized)
        recorded = self.shadow.record("mlb", "standings_leaders", MLB_RESEARCH_FIXTURE_PROVIDER, normalized["provider"], discrepancies)
        snapshot = self._snapshot(normalized)
        trust_conflicts = [item for item in discrepancies if item["category"] != "outside_fixture_coverage"]
        report = {
            "provider": normalized["provider"], "season": season, "exposedAsPrimary": False,
            "candidateMode": "discovery_lab_shadow", "primarySource": MLB_RESEARCH_FIXTURE_PROVIDER,
            "endpoints": endpoints,
            "normalization": {"accepted": True, "standings": len(normalized["standings"]), "playerStats": len(normalized["playerSeasonStats"]), "teamStats": len(normalized["teamSeasonStats"]), "rejected": len(normalized["rejected"])},
            "canonicalIds": self._canonical_validation(normalized),
            "discrepancies": {"total": len(discrepancies), "recorded": recorded, "categories": dict(sorted(Counter(item["category"] for item in discrepancies).items()))},
            "snapshot": snapshot, "cache": {"state": cache_state, "private": True},
            "edgeTrust": evaluate_edge_trust({"freshness": "sample", "coverage": "partial", "identity": "passing", "provider_agreement": "partial" if trust_conflicts else "passing"}, applicable={"freshness", "coverage", "identity", "provider_agreement"}, conflicts=trust_conflicts[:25], sample=True),
            "limitations": ["Discovery Lab values may be scrambled and remain shadow-only.", "No public live standings or league-leader wording is enabled."],
        }
        self._last_shadow_report = copy.deepcopy(report)
        return report

    def shadow_status(self) -> dict[str, Any]:
        return copy.deepcopy(self._last_shadow_report) if self._last_shadow_report else {"status": "not_run", "exposedAsPrimary": False}

    def _snapshot(self, data: dict[str, Any]) -> dict[str, Any]:
        canonical = json.dumps({key: data[key] for key in ("standings", "playerSeasonStats", "teamSeasonStats")}, sort_keys=True, separators=(",", ":"))
        fingerprint = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
        scope = f'mlb:{data["season"]}'
        previous = self.database.execute("SELECT fingerprint, captured_at FROM research_data_snapshots WHERE scope=? ORDER BY captured_at DESC LIMIT 1", (scope,))
        comparable = bool(previous)
        changed = comparable and previous[0]["fingerprint"] != fingerprint
        with self.database.transaction() as connection:
            connection.execute("INSERT OR IGNORE INTO research_data_snapshots(id,scope,provider,contract_version,fingerprint,captured_at,metadata_json) VALUES(?,?,?,?,?,?,?)", (f"{scope}:{fingerprint}", scope, data["provider"], MLB_RESEARCH_CONTRACT_VERSION, fingerprint, utc_now(), json.dumps({"season": data["season"], "sourceMode": data["sourceMode"]}, sort_keys=True)))
        return {"fingerprint": fingerprint[:12], "comparableToPrevious": comparable, "changed": changed, "movementSuppressed": not comparable}

    @staticmethod
    def _canonical_validation(data: dict[str, Any]) -> dict[str, Any]:
        teams = {row["teamId"] for row in data["standings"]}
        unknown_player_teams = sorted({row["teamId"] for row in data["playerSeasonStats"] if row["teamId"] not in teams})
        unknown_team_stats = sorted({row["teamId"] for row in data["teamSeasonStats"] if row["teamId"] not in teams})
        player_ids = [row["playerId"] for row in data["playerSeasonStats"]]
        return {"valid": not unknown_player_teams and not unknown_team_stats and len(player_ids) == len(set(player_ids)), "unknownPlayerTeams": unknown_player_teams, "unknownTeamStats": unknown_team_stats}

    @staticmethod
    def _source(data: dict[str, Any]) -> dict[str, Any]:
        return {"provider": data["provider"], "mode": data["sourceMode"], "lastUpdated": data["recordedAt"], "sample": data["sourceMode"] in {"fixture", "sample"}, "liveVerified": False, "attribution": data["attribution"]}

    @staticmethod
    def _trust(data: dict[str, Any]) -> dict[str, Any]:
        return evaluate_edge_trust({"freshness": "fixture" if data["sourceMode"] == "fixture" else "sample", "coverage": "partial", "identity": "verified", "provider_agreement": "unavailable"}, applicable={"freshness", "coverage", "identity", "provider_agreement"}, sample=True, last_validation=data["recordedAt"])

    @staticmethod
    def _unavailable_report(season: int, endpoints: list[dict[str, Any]], error: ProviderError | None, cache_state: str) -> dict[str, Any]:
        return {"provider": "sportsdataio", "season": season, "exposedAsPrimary": False, "candidateMode": "discovery_lab_shadow", "primarySource": MLB_RESEARCH_FIXTURE_PROVIDER, "endpoints": endpoints, "normalization": {"accepted": False, "standings": 0, "playerStats": 0, "teamStats": 0, "rejected": 0}, "canonicalIds": {"valid": False, "reason": error.code if error else "provider_error"}, "discrepancies": {"total": 0, "recorded": 0, "categories": {}}, "cache": {"state": cache_state, "private": True}, "edgeTrust": evaluate_edge_trust({"freshness": "unavailable", "coverage": "unavailable", "identity": "not_started", "provider_agreement": "not_started"}, applicable={"freshness", "coverage", "identity", "provider_agreement"}, sample=True), "limitations": ["Provider access is unavailable; the deterministic fixture remains primary."]}
