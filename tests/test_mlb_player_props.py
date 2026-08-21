from __future__ import annotations

import copy
import json
import unittest
from datetime import datetime, timezone

from server.cache import MemoryCache
from server.api import Api
from server.config import ProviderConfig
from server.errors import ProviderEntitlementError, ProviderValidationError, ValidationError
from server.mlb_player_props import (
    MLB_PROP_CONTRACT_VERSION, PROP_STAT_REGISTRY, MlbPlayerPropAdapter,
    MlbPlayerPropService, compare_mlb_prop_shadow, outs_display, threshold_analysis,
)
from server.mlb_schedule_entities import MlbScheduleEntityService
from server.runtime import build_runtime
from server.sportsdataio_mlb import SportsDataIoMlbTrialProvider


class _Rollout:
    def get(self, _league): return {"rolloutState": "shadow"}


class _Shadow:
    def __init__(self): self.calls = []
    def record(self, *args): self.calls.append(args); return True


class MlbPlayerPropTests(unittest.TestCase):
    def setUp(self):
        self.cache = MemoryCache(); self.schedule = MlbScheduleEntityService(self.cache, _Rollout(), _Shadow())
        self.service = MlbPlayerPropService(self.cache, _Rollout(), _Shadow(), self.schedule)
        self.raw = self.service._fixture(); self.now = datetime(2026, 8, 4, 14, tzinfo=timezone.utc)

    def normalize(self, raw=None):
        return MlbPlayerPropAdapter().normalize(raw or self.raw, self.schedule.read(), now=self.now)

    def test_registry_has_all_ticket_six_families_and_existing_stat_ids(self):
        self.assertEqual(13, len(PROP_STAT_REGISTRY))
        self.assertEqual("baseball-innings-pitched", PROP_STAT_REGISTRY["pitcher_outs_recorded"]["statId"])
        self.assertTrue(all(x["period"] == "full_game" for x in PROP_STAT_REGISTRY.values()))

    def test_fixture_normalizes_without_rejection_and_hides_provider_ids(self):
        data = self.normalize()
        self.assertEqual(MLB_PROP_CONTRACT_VERSION, data["contractVersion"])
        self.assertEqual(30, len(data["props"])); self.assertEqual([], data["rejected"])
        self.assertNotIn("providerPropId", data["props"][0]); self.assertNotIn("providerPlayerId", data["players"][0])

    def test_player_team_event_and_role_are_strict(self):
        raw = copy.deepcopy(self.raw); raw["props"][0]["teamId"] = "LAD"
        data = self.normalize(raw)
        self.assertEqual(1, len([x for x in data["rejected"] if x["domain"] == "props"]))

    def test_unknown_player_and_book_are_rejected(self):
        raw = copy.deepcopy(self.raw); raw["props"][0]["playerId"] = "unknown"; raw["props"][1]["sportsbookId"] = "unknown"
        self.assertEqual(2, len([x for x in self.normalize(raw)["rejected"] if x["domain"] == "props"]))

    def test_wrong_role_is_rejected(self):
        raw = copy.deepcopy(self.raw); raw["props"][0]["family"] = "batter_hits"
        self.assertTrue(any(x["code"] == "invalid_prop" for x in self.normalize(raw)["rejected"]))

    def test_malformed_odds_and_lines_are_rejected(self):
        raw = copy.deepcopy(self.raw); raw["props"][0]["americanOdds"] = -50; raw["props"][1]["line"] = float("inf")
        self.assertEqual(2, len([x for x in self.normalize(raw)["rejected"] if x["domain"] == "props"]))

    def test_duplicate_and_incomplete_pairs_are_detected(self):
        raw = copy.deepcopy(self.raw); raw["props"].append(copy.deepcopy(raw["props"][0])); raw["props"].pop(1)
        data = self.normalize(raw)
        self.assertTrue(any(x["code"] == "invalid_prop" for x in data["rejected"]))
        self.assertTrue(any(x["incompletePair"] for x in data["props"]))

    def test_suspended_and_stale_states_are_preserved(self):
        raw = copy.deepcopy(self.raw); raw["props"][0]["status"] = "suspended"
        data = self.normalize(raw)
        row = next(x for x in data["props"] if x["side"] == "over" and x["family"] == "pitcher_strikeouts" and x["sportsbookId"] == "sportsbook-draftkings")
        self.assertTrue(row["suspended"]); self.assertIn(row["freshness"]["state"], {"fresh", "delayed", "stale", "expired"})

    def test_outs_display_never_uses_base_ten_innings(self):
        self.assertEqual("6.1", outs_display(19)); self.assertEqual("6.2", outs_display(20))
        with self.assertRaises(ProviderValidationError): outs_display(-1)

    def test_fractional_outs_history_is_rejected(self):
        raw = copy.deepcopy(self.raw); raw["historicalGameLogs"][-1]["stats"]["baseball-innings-pitched"] = 6.1
        data = self.normalize(raw)
        self.assertTrue(any(x["domain"] == "historicalGameLogs" for x in data["rejected"]))

    def test_threshold_pushes_are_excluded_from_denominator(self):
        rows = [{"stats":{"baseball-hits":value}} for value in (2, 1, 0)]
        result = threshold_analysis(rows, "baseball-hits", 1, "over")
        self.assertEqual((1, 1, 1, 2), (result["hits"], result["misses"], result["pushes"], result["decisionSampleSize"]))
        self.assertEqual(50.0, result["hitRate"]); self.assertTrue(result["descriptiveOnly"])

    def test_only_completed_unique_history_enters_research(self):
        raw = copy.deepcopy(self.raw); row = copy.deepcopy(raw["historicalGameLogs"][0]); row["status"] = "postponed"; raw["historicalGameLogs"].append(row)
        data = self.normalize(raw)
        self.assertEqual(11, len(data["historicalGameLogs"])); self.assertTrue(any(x["domain"] == "historicalGameLogs" for x in data["rejected"]))

    def test_best_price_holds_line_constant(self):
        items = self.service.best_prices(family="pitcher_strikeouts")["items"]
        over = next(x for x in items if x["side"] == "over")
        self.assertEqual("sportsbook-fanduel", over["best"]["sportsbookId"]); self.assertTrue(over["sameLineComparison"])

    def test_research_has_windows_evidence_trust_and_counterarguments(self):
        prop = self.service.read()["props"][0]; result = self.service.research(prop["id"])
        self.assertEqual({"last5","last10","last20","season","home","away","opponent"}, set(result["historicalWindows"]))
        self.assertTrue(result["historicalWindows"]["last5"]["supportingRows"])
        self.assertFalse(result["edgeTrust"]["researchQuality"]["isProbability"])
        self.assertTrue(result["counterarguments"])

    def test_unknown_research_prop_fails_safely(self):
        with self.assertRaises(ValidationError): self.service.research("missing")

    def test_offers_use_canonical_identity_and_disable_sgp(self):
        offers = self.service.offers(); self.assertEqual(15, len(offers))
        selection = offers[0]["selections"][0]
        self.assertEqual("mlb-gerrit-cole", selection["participant"]["id"])
        self.assertTrue(selection["canonical_stat_id"]); self.assertFalse(offers[0]["sgp_eligible"])

    def test_provider_bundle_keeps_game_markets_and_adds_props(self):
        bundle = self.service.provider_bundle({"offers":[{"league_key":"mlb","offer_id":"game"}],"provider_status":{}})
        self.assertEqual(16, len(bundle["offers"])); self.assertIn("mlb_player_prop_source", bundle["provider_status"])

    def test_cache_prevents_duplicate_provider_requests(self):
        self.service.read(); first = self.service.provider_requests; self.service.read(); self.assertEqual(first, self.service.provider_requests)

    def test_shadow_entitlement_failure_preserves_fixture_primary(self):
        def unavailable(**_kwargs): return None, [{"domain":"player_props","status":"forbidden_by_entitlement"}], ProviderEntitlementError("unavailable")
        service=MlbPlayerPropService(MemoryCache(),_Rollout(),_Shadow(),self.schedule,shadow_validator=unavailable)
        report=service.run_shadow_validation(selected_date="2026-08-04")
        self.assertFalse(report["exposedAsPrimary"]); self.assertFalse(report["normalization"]["accepted"])
        self.assertEqual(30, len(service.read()["props"]))

    def test_shadow_discrepancies_distinguish_line_price_stat_and_scope(self):
        fixture=self.normalize(); candidate=copy.deepcopy(fixture)
        candidate["props"][0].update({"line":7.5,"decimalOdds":2.2,"canonicalStatId":"wrong","settlementScope":"regulation_only"})
        categories={x["category"] for x in compare_mlb_prop_shadow(fixture,candidate)}
        self.assertTrue({"line_conflict","price_conflict","stat_mapping_conflict","scope_conflict"}.issubset(categories))

    def test_public_api_and_research_use_normalized_props_without_provider_ids(self):
        runtime = build_runtime(ProviderConfig.from_env({"EDGEBOARD_ENV":"test","EDGEBOARD_DATA_MODE":"sample","SAMPLE_MODE":"true","SAMPLE_MODE_ENABLED":"true","DATABASE_URL":"sqlite:///:memory:"}))
        try:
            api = Api(runtime)
            status, props, _ = api.handle("GET", "/api/player-props", query="leagueId=mlb&family=batter_hits")
            self.assertEqual(200, status); self.assertEqual(4, len(props["items"]))
            serialized = str(props); self.assertNotIn("fixture-player-", serialized); self.assertNotIn("providerPropId", serialized)
            prop_id = props["items"][0]["id"]
            status, research, _ = api.handle("POST", "/api/research", body=json.dumps({"structuredQuery":{"intent":"market_context","leagueId":"mlb","propId":prop_id,"window":"last5"}}).encode())
            self.assertEqual(200, status); self.assertTrue(research["deterministic"]); self.assertFalse(research["llmSourceOfTruth"])
            self.assertIn("pushes", research["historicalPerformance"])
        finally:
            runtime.close()

    def test_sportsdataio_boundary_maps_supported_prop_without_exposing_key(self):
        settings = ProviderConfig.from_env({"EDGEBOARD_ENV":"test","EDGEBOARD_DATA_MODE":"sample","SAMPLE_MODE":"true","SAMPLE_MODE_ENABLED":"true","SPORTS_PROVIDER_ID":"SportsDataIO","SPORTS_PROVIDER_API_KEY":"secret-test-key","SPORTS_PROVIDER_POC_ENABLED":"true"})
        provider = SportsDataIoMlbTrialProvider(settings, today=datetime(2026,8,4,tzinfo=timezone.utc).date())
        def fake_get(_base, endpoint):
            if endpoint == "AllTeams": return ([{"TeamID":1,"Key":"NYY","FullName":"New York Yankees"},{"TeamID":2,"Key":"LAD","FullName":"Los Angeles Dodgers"}],0)
            if endpoint == "Players": return ([{"PlayerID":100,"Name":"Aaron Judge","Team":"NYY","Position":"RF","Status":"Active"}],0)
            if endpoint.startswith("GamesByDate/"): return ([{"GameID":500,"Day":"2026-08-04T00:00:00","DateTime":"2026-08-04T19:05:00","AwayTeam":"NYY","HomeTeam":"LAD","Status":"Scheduled","Updated":"2026-08-04T12:00:00"}],0)
            return ([{"BettingMarketID":700,"PlayerID":100,"BettingBetType":"Player Hits","BettingOutcomes":[{"BettingOutcomeID":1,"BettingOutcomeType":"Over","BetValue":1.5,"PayoutAmerican":125,"Updated":"2026-08-04T12:00:00","SportsBook":{"SportsbookID":10,"Name":"DraftKings"}},{"BettingOutcomeID":2,"BettingOutcomeType":"Under","BetValue":1.5,"PayoutAmerican":-145,"Updated":"2026-08-04T12:00:00","SportsBook":{"SportsbookID":10,"Name":"DraftKings"}}]}],0)
        provider._get_from = fake_get
        payload, endpoints, error = provider.validate_player_props_access(selected_date="2026-08-04")
        self.assertIsNone(error); self.assertEqual(2, len(payload["props"])); self.assertEqual("batter_hits", payload["props"][0]["family"])
        self.assertNotIn("secret-test-key", str(payload)); self.assertTrue(any(x["operation"] == "BettingPlayerPropsByGame" for x in endpoints))


if __name__ == "__main__": unittest.main()
