from __future__ import annotations

import math
from typing import Any


MARKET_RULES = {
    "mlb": {
        "allowed": {"moneyline", "run_line", "total", "first_five_moneyline", "first_five_spread", "first_five_total", "batter_hits", "batter_total_bases", "batter_home_runs", "pitcher_strikeouts", "pitcher_outs", "team_total"},
        "periods": {"full_game", "first_five_innings"}, "roles": {"batter", "pitcher", "team"},
    },
    "wnba": {
        "allowed": {"moneyline", "spread", "total", "team_total", "player_points", "player_rebounds", "player_assists", "player_threes", "player_points_rebounds", "player_points_assists", "player_rebounds_assists", "player_pra", "player_steals_blocks"},
        "periods": {"full_game", "first_half", "second_half", "first_quarter", "second_quarter", "third_quarter", "fourth_quarter"}, "roles": {"player", "team"},
    },
    "ufc": {
        "allowed": {"fight_moneyline", "method_of_victory", "fighter_ko_tko", "fighter_submission", "fighter_decision", "goes_distance", "does_not_go_distance", "total_rounds", "exact_round", "round_group"},
        "periods": {"fight", "round"}, "roles": {"fighter"},
    },
    "mls": {
        "allowed": {"three_way_moneyline", "draw_no_bet", "double_chance", "handicap", "total", "team_total", "both_teams_to_score", "player_shots", "player_shots_on_target", "anytime_scorer", "corners", "cards", "qualification"},
        "periods": {"regulation", "first_half", "second_half", "extra_time", "penalties", "qualification"}, "roles": {"player", "team", "draw"},
    },
}

STAT_MARKET_COMPATIBILITY = {
    "mlb": {"pitcher_strikeouts": "pitcher_strikeouts", "hits": "batter_hits", "total_bases": "batter_total_bases", "home_runs": "batter_home_runs"},
    "wnba": {
        "points": "player_points", "rebounds": "player_rebounds", "assists": "player_assists",
        "three_pointers_made": "player_threes", "points_rebounds": "player_points_rebounds",
        "points_assists": "player_points_assists", "rebounds_assists": "player_rebounds_assists",
        "points_rebounds_assists": "player_pra", "steals_blocks": "player_steals_blocks",
    },
    "ufc": {"knockdowns": ("fighter_ko_tko", "method_of_victory"), "submission_attempts": ("fighter_submission", "method_of_victory")},
    "mls": {"shots": "player_shots", "shots_on_target": "player_shots_on_target"},
}


def innings_to_outs(value: object) -> int | None:
    """Convert baseball's x.0/x.1/x.2 innings notation into outs; never base-10."""
    if isinstance(value, bool): return None
    text = str(value).strip()
    try:
        whole_text, separator, fraction = text.partition(".")
        whole = int(whole_text)
        partial = int(fraction or "0") if separator else 0
    except ValueError:
        return None
    if whole < 0 or partial not in {0, 1, 2}:
        return None
    return whole * 3 + partial


def validate_league_market(league_id: str, market: dict[str, Any], *, active_event: dict[str, Any] | None = None) -> tuple[bool, list[str]]:
    rules = MARKET_RULES.get(league_id)
    errors: list[str] = []
    if not rules:
        return False, ["League has no certified market validation rules."]
    market_id = str(market.get("canonical_market_id") or "")
    period = str(market.get("period") or "")
    scope = str(market.get("settlement_scope") or "")
    if market_id not in rules["allowed"]: errors.append("Unsupported canonical market identity.")
    if period not in rules["periods"]: errors.append("Unsupported or missing market period.")
    if not scope: errors.append("Settlement scope is required.")
    if not market.get("event_id"): errors.append("Canonical event identity is required.")
    if not market.get("provider_market_id"): errors.append("Provider market identity is required.")
    if not market.get("sportsbook_id"): errors.append("Sportsbook identity is required.")
    selections = market.get("selections") if isinstance(market.get("selections"), list) else []
    if not selections: errors.append("At least one mapped selection is required.")
    sides: list[str] = []
    for selection in selections:
        if not isinstance(selection, dict):
            errors.append("Selection is malformed.")
            continue
        odds = selection.get("american_odds")
        if isinstance(odds, bool) or not isinstance(odds, (int, float)) or not math.isfinite(odds) or abs(odds) < 100:
            errors.append("Selection has invalid American odds.")
        role = selection.get("participant_role")
        if role and role not in rules["roles"]: errors.append("Selection participant role is incompatible with the league.")
        side = str(selection.get("side") or "")
        if not side: errors.append("Selection side is required.")
        else: sides.append(side)
    if len(sides) != len(set(sides)):
        errors.append("Duplicate selection sides make the market mapping ambiguous.")
    two_way_markets = {
        "run_line", "total", "first_five_spread", "first_five_total", "batter_hits",
        "batter_total_bases", "batter_home_runs", "pitcher_strikeouts", "pitcher_outs", "team_total",
        "spread", "player_points", "player_rebounds", "player_assists", "player_threes",
        "player_points_rebounds", "player_points_assists", "player_rebounds_assists", "player_pra",
        "player_steals_blocks", "total_rounds", "player_shots", "player_shots_on_target", "corners", "cards",
    }
    if market_id in two_way_markets and not {"over", "under"}.issubset(set(sides)):
        errors.append("Two-way market mapping requires distinct over and under selections.")
    if market_id in {"goes_distance", "does_not_go_distance", "both_teams_to_score"} and not {"yes", "no"}.issubset(set(sides)):
        errors.append("Yes/no market mapping requires both selections.")
    if market_id == "three_way_moneyline" and not {"home", "draw", "away"}.issubset(set(sides)):
        errors.append("Three-way soccer market requires home, draw, and away selections.")
    if league_id == "mlb":
        first_five = market_id.startswith("first_five_")
        if first_five and (period != "first_five_innings" or not scope.startswith("first_five")):
            errors.append("First-five market requires first-five period and settlement scope.")
        if not first_five and period == "first_five_innings":
            errors.append("Full-game market cannot use first-five settlement period.")
    if league_id == "ufc" and market_id in {"total_rounds", "exact_round", "round_group"}:
        if market.get("scheduled_rounds") not in {3, 5}:
            errors.append("Round market requires an explicit three-round or five-round fight scope.")
    if league_id == "mls":
        expected_scopes = {
            "regulation": {"90_minutes_plus_stoppage", "regulation_only"},
            "extra_time": {"extra_time_only"},
            "penalties": {"penalty_shootout"},
            "qualification": {"advancement"},
        }
        if period in expected_scopes and scope not in expected_scopes[period]:
            errors.append("Soccer period and settlement scope are not canonically compatible.")
        if market_id == "qualification" and period != "qualification":
            errors.append("Advancement markets must remain distinct from match-result markets.")
        if market_id != "qualification" and period == "qualification":
            errors.append("Match markets cannot be relabeled as advancement markets.")
    if active_event:
        if active_event.get("event_id") != market.get("event_id"): errors.append("Market event does not match the active event.")
        if active_event.get("status") in {"cancelled", "postponed", "abandoned"} and market.get("status") == "open":
            errors.append("Unavailable event cannot retain open markets.")
        if league_id == "ufc":
            pairing = tuple(sorted(str(value) for value in active_event.get("fighter_ids", [])))
            market_pairing = tuple(sorted(str(value) for value in market.get("fighter_ids", [])))
            if pairing and pairing != market_pairing: errors.append("Market fighter pairing is stale after an opponent change.")
            scheduled_rounds = active_event.get("scheduled_rounds")
            if market.get("scheduled_rounds") and market.get("scheduled_rounds") != scheduled_rounds:
                errors.append("Round market is incompatible with scheduled fight length.")
    return not errors, list(dict.fromkeys(errors))


def cross_validate_stat_market(stat: dict[str, Any], market: dict[str, Any]) -> tuple[bool, str]:
    stat_league = str(stat.get("league_id") or "")
    market_league = str(market.get("league_id") or "")
    if not stat_league or not market_league or stat_league != market_league:
        return False, "Stat and market leagues do not match."
    league_id = stat_league
    expected = STAT_MARKET_COMPATIBILITY.get(league_id, {}).get(str(stat.get("stat_id") or ""))
    compatible_market_ids = set(expected if isinstance(expected, (tuple, list, set)) else (expected,))
    if not expected or market.get("canonical_market_id") not in compatible_market_ids:
        return False, "Stat and market types are not canonically compatible."
    market_entities = {
        str(selection.get("entity_id")) for selection in market.get("selections", [])
        if isinstance(selection, dict) and selection.get("entity_id")
    }
    market_entity = str(market.get("entity_id") or (next(iter(market_entities)) if len(market_entities) == 1 else ""))
    stat_entity = str(stat.get("entity_id") or "")
    if not stat_entity or not market_entity or stat_entity != market_entity:
        return False, "Stat and market entity identities do not match."
    stat_event = str(stat.get("target_event_id") or "")
    market_event = str(market.get("event_id") or "")
    if not stat_event or not market_event or stat_event != market_event:
        return False, "Stat and market event identities do not match."
    stat_period = stat.get("target_period") or stat.get("period")
    if not stat_period or not market.get("period") or stat_period != market["period"]:
        return False, "Stat and market periods do not match."
    stat_scope = stat.get("target_settlement_scope") or stat.get("settlement_scope")
    if not stat_scope or not market.get("settlement_scope") or stat_scope != market["settlement_scope"]:
        return False, "Stat and market settlement scopes do not match."
    if market.get("freshness_state") in {"stale", "expired", "unavailable"}:
        return False, "Market is not fresh enough to attach to statistical analysis."
    return True, "Verified canonical stat-to-market relationship."
