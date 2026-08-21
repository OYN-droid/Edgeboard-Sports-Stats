from __future__ import annotations

import json
import unittest
from copy import deepcopy
from datetime import date

from server.api import Api
from server.cache import MemoryCache
from server.config import ProviderConfig
from server.database import Database
from server.errors import ProviderEntitlementError, ValidationError
from server.mlb_standings_leaders import (
    MlbStandingsLeadersAdapter,
    MlbStandingsLeadersService,
    compare_mlb_research_shadow,
)
from server.rollout import RolloutService
from server.runtime import build_runtime
from server.shadow import ShadowService
from server.sportsdataio_mlb import SportsDataIoMlbTrialProvider


class Ticket4FixtureTests(unittest.TestCase):
    def setUp(self):
        self.database = Database()
        self.database.migrate()
        self.rollout = RolloutService(self.database, "", {"mlb": "fixture_only"})
        self.service = MlbStandingsLeadersService(
            MemoryCache(), self.database, self.rollout, ShadowService(self.database),
        )

    def tearDown(self):
        self.database.close()

    def test_fixture_standings_are_normalized_and_explicitly_sample(self):
        result = self.service.standings(2026)
        self.assertEqual(len(result["items"]), 6)
        self.assertEqual(set(result["divisions"]), {"AL East", "AL Central", "NL West", "NL East"})
        self.assertTrue(result["source"]["sample"])
        self.assertFalse(result["source"]["liveVerified"])
        self.assertIn("not a complete or live", result["coverageNotice"])
        yankees = next(item for item in result["items"] if item["teamId"] == "NYY")
        self.assertEqual(yankees["gamesPlayed"], 114)
        self.assertEqual(yankees["runDifferential"], 114)
        self.assertEqual(yankees["homeRecord"], {"wins": 38, "losses": 20})

    def test_malformed_sibling_is_quarantined(self):
        payload = self.service._fixture()
        payload["standings"].append({
            "teamId": "BROKEN", "teamName": "Broken", "league": "AL", "division": "East",
            "wins": 10, "losses": 5, "homeWins": 9, "homeLosses": 2,
            "awayWins": 9, "awayLosses": 3,
        })
        normalized = MlbStandingsLeadersAdapter().normalize(payload)
        self.assertEqual(len(normalized["standings"]), 6)
        self.assertEqual(normalized["rejected"][-1]["code"], "invalid_standing")

    def test_malformed_stat_field_does_not_destroy_valid_sibling_fields(self):
        payload = self.service._fixture()
        payload["playerSeasonStats"][0]["hits"] = 12.5
        normalized = MlbStandingsLeadersAdapter().normalize(payload)
        judge = next(row for row in normalized["playerSeasonStats"] if row["playerId"] == "mlb-aaron-judge")
        self.assertNotIn("hits", judge)
        self.assertEqual(judge["homeRuns"], 41)
        self.assertIn("invalid_stat_field", {item["code"] for item in normalized["rejected"]})

    def test_rate_qualification_is_proportional_and_inspectable(self):
        board = self.service.leaderboard("baseball-batting-average", 2026)
        ids = [item["entityId"] for item in board["items"]]
        self.assertIn("mlb-aaron-judge", ids)
        self.assertNotIn("mlb-mookie-betts", ids)
        judge = next(item for item in board["items"] if item["entityId"] == "mlb-aaron-judge")
        self.assertEqual(judge["qualification"]["minimum"], 353)
        self.assertEqual(judge["qualification"]["observed"], 472)
        self.assertIn("3.1", judge["qualification"]["rule"])

    def test_unqualified_rows_can_be_inspected_without_becoming_official(self):
        board = self.service.leaderboard("baseball-batting-average", 2026, qualified_only=False)
        betts = next(item for item in board["items"] if item["entityId"] == "mlb-mookie-betts")
        self.assertEqual(betts["qualification"]["status"], "unqualified")
        self.assertFalse(board["officialLeaderWordingAllowed"])

    def test_pitching_innings_use_outs_and_lower_is_better(self):
        board = self.service.leaderboard("baseball-era", 2026)
        self.assertEqual(board["sortDirection"], "ascending")
        self.assertEqual([item["rank"] for item in board["items"]], [1, 1])
        self.assertEqual({item["qualification"]["observed"] for item in board["items"]}, {146, 153})
        self.assertEqual({item["qualification"]["minimum"] for item in board["items"]}, {114, 115})

    def test_counting_stats_do_not_inherit_rate_threshold(self):
        board = self.service.leaderboard("baseball-home-runs", 2026)
        betts = next(item for item in board["items"] if item["entityId"] == "mlb-mookie-betts")
        self.assertEqual(betts["qualification"]["status"], "not_applicable")

    def test_team_rate_board_does_not_apply_player_innings_rule(self):
        board = self.service.leaderboard("baseball-era", 2026, entity_type="team")
        self.assertEqual(len(board["items"]), 6)
        self.assertEqual(board["items"][0]["entityId"], "CLE")
        self.assertEqual(board["items"][0]["qualification"]["status"], "not_applicable")

    def test_team_record_fails_honestly_for_unsupported_splits(self):
        record = self.service.team_record("NYY", 2026)
        self.assertIsNone(record["oneRunRecord"])
        self.assertIsNone(record["extraInningRecord"])
        self.assertEqual(len(record["unavailable"]), 2)
        self.assertIsNone(self.service.team_record("UNKNOWN", 2026))

    def test_unsupported_stat_and_entity_type_fail_closed(self):
        with self.assertRaises(ValidationError):
            self.service.leaderboard("fake-stat", 2026)
        with self.assertRaises(ValidationError):
            self.service.leaderboard("baseball-saves", 2026, entity_type="team")

    def test_cache_avoids_duplicate_fixture_requests(self):
        self.service.read(2026)
        self.service.read(2026)
        self.assertEqual(self.service.provider_requests, 1)

    def test_shadow_comparison_is_domain_specific(self):
        fixture = self.service.read(2026)
        candidate = deepcopy(fixture)
        candidate["standings"][0]["wins"] += 1
        candidate["playerSeasonStats"] = candidate["playerSeasonStats"][1:]
        discrepancies = compare_mlb_research_shadow(fixture, candidate)
        self.assertIn("value_conflict", {item["category"] for item in discrepancies})
        self.assertIn("missing_candidate", {item["category"] for item in discrepancies})
        self.assertEqual({item["domain"] for item in discrepancies if item["recordId"] == "NYY"}, {"standings"})

    def test_representative_fixture_gaps_are_not_provider_conflicts(self):
        fixture = self.service.read(2026)
        candidate = deepcopy(fixture)
        candidate["playerSeasonStats"].append({"playerId": "mlb-extra", "playerName": "Extra", "teamId": "NYY", "homeRuns": 1})
        discrepancy = next(item for item in compare_mlb_research_shadow(fixture, candidate) if item["recordId"] == "mlb-extra")
        self.assertEqual(discrepancy["category"], "outside_fixture_coverage")

    def test_snapshots_are_versioned_and_only_report_comparable_movement(self):
        first = self.service._snapshot(self.service.read(2026))
        second = self.service._snapshot(self.service.read(2026))
        self.assertFalse(first["comparableToPrevious"])
        self.assertTrue(second["comparableToPrevious"])
        self.assertFalse(second["changed"])
        self.assertEqual(len(self.database.execute("SELECT * FROM research_data_snapshots")), 1)


class Ticket4ApiTests(unittest.TestCase):
    def setUp(self):
        self.runtime = build_runtime(ProviderConfig.from_env({
            "EDGEBOARD_ENV": "test", "EDGEBOARD_DATA_MODE": "sample", "SAMPLE_MODE": "true",
            "SAMPLE_MODE_ENABLED": "true", "DATABASE_URL": "sqlite:///:memory:",
        }))
        self.api = Api(self.runtime)

    def tearDown(self):
        self.runtime.close()

    def test_public_endpoints_use_fixture_primary_normalized_models(self):
        status, standings, _ = self.api.handle("GET", "/api/standings", query="leagueId=mlb&season=2026")
        self.assertEqual(status, 200)
        self.assertTrue(standings["source"]["sample"])
        status, board, _ = self.api.handle("GET", "/api/leaderboards", query="leagueId=mlb&season=2026&statId=baseball-ops")
        self.assertEqual(status, 200)
        self.assertEqual(board["leaderLabel"], "Available-data leader")
        self.assertNotIn("providerId", json.dumps(board))
        status, bundle, _ = self.api.handle("GET", "/api/provider-data")
        self.assertEqual(status, 200)
        self.assertEqual(len(bundle["standings"]), 6)
        self.assertIn("baseball-home-runs", bundle["leaderboards"])
        self.assertIn("NYY", bundle["team_records"])

    def test_invalid_parameters_fail_safely(self):
        self.assertEqual(self.api.handle("GET", "/api/leaderboards", query="season=nope")[0], 400)
        self.assertEqual(self.api.handle("GET", "/api/leaderboards", query="limit=1000")[0], 400)
        self.assertEqual(self.api.handle("GET", "/api/team-records/UNKNOWN", query="season=2026")[0], 400)

    def test_shadow_diagnostics_are_admin_protected(self):
        self.assertEqual(self.api.handle("GET", "/api/admin/mlb/standings-leaders/status")[0], 403)

    def test_edge_intelligence_receives_structured_fixture_evidence(self):
        body = json.dumps({"structuredQuery": {
            "intent": "leaderboard", "leagueId": "mlb", "season": 2026,
            "statId": "baseball-home-runs", "limit": 3,
        }}).encode()
        status, result, _ = self.api.handle("POST", "/api/research", body=body)
        self.assertEqual(status, 200)
        self.assertEqual(len(result["evidence"]), 3)
        self.assertTrue(result["partial"])
        self.assertFalse(result["llmSourceOfTruth"])
        self.assertEqual(result["source"]["mode"], "fixture")


class Ticket4SportsDataIoTests(unittest.TestCase):
    class Client:
        def __init__(self, unavailable: str = ""):
            self.unavailable = unavailable
            self.calls = []

        def get_json(self, url, headers):
            self.calls.append((url, headers))
            if self.unavailable and self.unavailable in url:
                raise ProviderEntitlementError("Endpoint unavailable for this plan.")
            if "/Standings/" in url:
                return [{"Key":"NYY","Name":"New York Yankees","League":"AL","Division":"East","Wins":70,"Losses":44,"HomeWins":38,"HomeLosses":20,"AwayWins":32,"AwayLosses":24,"RunsScored":585,"RunsAgainst":471,"DivisionRank":1,"GamesBack":0}]
            if "/PlayerSeasonStats/" in url:
                return [{"PlayerID":100,"Name":"Aaron Judge","Team":"NYY","Games":108,"PlateAppearances":472,"AtBats":401,"Hits":129,"HomeRuns":41,"BattingAverage":.322,"OnBasePercentage":.413,"SluggingPercentage":.693,"OnBasePlusSlugging":1.106,"InningsPitchedFull":"0.0"}]
            if "/TeamSeasonStats/" in url:
                return [{"Team":"NYY","Games":114,"Runs":585,"Hits":1031,"HomeRuns":172,"EarnedRunAverage":3.78,"WalksHitsPerInningsPitched":1.21}]
            return []

    @staticmethod
    def config():
        return ProviderConfig.from_env({
            "EDGEBOARD_ENV": "test", "EDGEBOARD_DATA_MODE": "sample", "SAMPLE_MODE": "true",
            "SAMPLE_MODE_ENABLED": "true", "SPORTS_PROVIDER_ID": "SportsDataIO",
            "SPORTS_PROVIDER_API_KEY": "test-key-never-log", "SPORTS_PROVIDER_POC_ENABLED": "true",
        })

    def test_live_adapter_normalizes_without_exposing_key_or_provider_ids(self):
        client = self.Client()
        payload, report, error = SportsDataIoMlbTrialProvider(self.config(), client, today=date(2026, 8, 7)).validate_standings_leaders_access(season=2026)
        self.assertIsNone(error)
        self.assertEqual(len(payload["standings"]), 1)
        self.assertEqual(payload["playerSeasonStats"][0]["playerId"], "mlb-aaron-judge")
        self.assertEqual({item["status"] for item in report}, {"authenticated_available"})
        self.assertNotIn("test-key-never-log", json.dumps(payload))
        self.assertTrue(all(call[1]["Ocp-Apim-Subscription-Key"] == "test-key-never-log" for call in client.calls))

    def test_partial_entitlement_preserves_valid_siblings(self):
        payload, report, error = SportsDataIoMlbTrialProvider(self.config(), self.Client("PlayerSeasonStats")).validate_standings_leaders_access(season=2026)
        self.assertIsNone(error)
        self.assertEqual(payload["playerSeasonStats"], [])
        self.assertEqual(len(payload["standings"]), 1)
        player = next(item for item in report if item["operation"] == "PlayerSeasonStats")
        self.assertEqual(player["status"], "forbidden_by_entitlement")
        self.assertTrue(player["planLimitationPossible"])

    def test_baseball_innings_are_never_treated_as_base_ten(self):
        self.assertEqual(SportsDataIoMlbTrialProvider._innings_outs({"InningsPitchedFull": "5.2"}), 17)
        self.assertEqual(SportsDataIoMlbTrialProvider._innings_outs({"InningsPitchedDecimal": 5.6667}), 17)
        self.assertIsNone(SportsDataIoMlbTrialProvider._innings_outs({"InningsPitchedFull": "5.7"}))


if __name__ == "__main__":
    unittest.main()
