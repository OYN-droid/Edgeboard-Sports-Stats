from __future__ import annotations

import copy
import json
import unittest
from pathlib import Path

from server.api import Api
from server.cache import MemoryCache
from server.config import ProviderConfig
from server.database import Database
from server.errors import ProviderValidationError, ValidationError
from server.mlb_schedule_entities import (
    MLB_CONTRACT_VERSION,
    MlbScheduleEntityAdapter,
    MlbScheduleEntityService,
)
from server.rollout import RolloutService
from server.runtime import build_runtime
from server.shadow import ShadowService


FIXTURE_PATH = Path(__file__).parents[1] / "server" / "fixtures" / "mlb_schedule_entities_ticket2.json"


def fixture() -> dict:
    return json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))


class AdapterTests(unittest.TestCase):
    def setUp(self):
        self.adapter = MlbScheduleEntityAdapter()

    def test_normalizes_all_supported_entities_and_statuses(self):
        result = self.adapter.normalize(fixture())
        self.assertEqual(result["league"]["id"], "mlb")
        self.assertEqual({item["type"] for item in result["entities"]}, {"team", "venue", "athlete", "manager"})
        self.assertEqual({item["status"] for item in result["games"]}, {"scheduled", "final", "delayed", "postponed", "cancelled", "suspended"})
        self.assertTrue(all(item["league_key"] == "mlb" for item in result["games"]))

    def test_provider_record_ids_are_internal_only(self):
        result = self.adapter.normalize(fixture())
        public = json.dumps({"entities": result["entities"], "games": result["games"]})
        self.assertNotIn("fixture-team-nyy", public)
        self.assertNotIn("fixture-game-20260804", public)
        self.assertIn("fixture-team-nyy", result["_providerMappings"])

    def test_doubleheaders_have_distinct_canonical_ids_and_numbers(self):
        result = self.adapter.normalize(fixture())
        games = [item for item in result["games"] if item["schedule_date"] == "2026-08-05"]
        self.assertEqual(len({item["id"] for item in games}), 2)
        self.assertEqual({item["doubleheader"]["gameNumber"] for item in games}, {1, 2})

    def test_invalid_siblings_are_rejected_without_destroying_valid_records(self):
        payload = fixture()
        payload["entities"].append({"providerId": "bad", "canonicalId": "", "type": "athlete"})
        payload["games"].append({"providerId": "bad-game", "canonicalId": "bad", "date": "not-a-date"})
        result = self.adapter.normalize(payload)
        self.assertEqual(len(result["entities"]), 8)
        self.assertEqual(len(result["games"]), 7)
        self.assertEqual({item["domain"] for item in result["rejected"]}, {"entities", "schedules"})

    def test_duplicate_entities_and_games_are_rejected(self):
        payload = fixture()
        payload["entities"].append(copy.deepcopy(payload["entities"][0]))
        payload["games"].append(copy.deepcopy(payload["games"][0]))
        result = self.adapter.normalize(payload)
        self.assertEqual(len(result["entities"]), 8)
        self.assertEqual(len(result["games"]), 7)
        self.assertEqual(len(result["rejected"]), 2)

    def test_unknown_team_and_invalid_timezone_never_reach_output(self):
        payload = fixture()
        unknown = copy.deepcopy(payload["games"][0])
        unknown.update({"providerId": "unknown-team-game", "canonicalId": "unknown-team", "awayTeamProviderId": "does-not-exist"})
        bad_zone = copy.deepcopy(payload["games"][1])
        bad_zone.update({"providerId": "bad-zone-game", "canonicalId": "bad-zone", "timezone": "Mars/Olympus"})
        payload["games"].extend([unknown, bad_zone])
        result = self.adapter.normalize(payload)
        self.assertEqual(len(result["games"]), 7)
        self.assertEqual(len(result["rejected"]), 2)

    def test_date_must_match_venue_local_start_time(self):
        payload = fixture()
        payload["games"][1]["date"] = "2026-08-05"
        result = self.adapter.normalize(payload)
        self.assertNotIn("mlb-2026-08-04-nyy-lad-1", {item["id"] for item in result["games"]})

    def test_contract_and_top_level_identity_fail_closed(self):
        payload = fixture()
        payload["contractVersion"] = "vendor-shape-v2"
        with self.assertRaises(ProviderValidationError):
            self.adapter.normalize(payload)


class ServiceTests(unittest.TestCase):
    def setUp(self):
        self.database = Database()
        self.database.migrate()
        self.rollout = RolloutService(self.database)
        self.shadow = ShadowService(self.database)
        self.service = MlbScheduleEntityService(MemoryCache(), self.rollout, self.shadow)

    def tearDown(self):
        self.database.close()

    def test_date_status_search_profiles_and_edge_trust(self):
        tomorrow = self.service.schedule(selected_date="2026-08-05")
        self.assertEqual(len(tomorrow["items"]), 2)
        self.assertEqual(len(self.service.schedule(status="final")["items"]), 1)
        self.assertEqual(self.service.search("Yankees")["items"][0]["id"], "NYY")
        self.assertEqual(self.service.search("Aaron Judge")["items"][0]["id"], "mlb-aaron-judge")
        self.assertEqual(self.service.entity("venue-yankee-stadium")["type"], "venue")
        self.assertEqual(self.service.game("mlb-2026-08-05-bos-nyy-2")["doubleheader"]["gameNumber"], 2)
        self.assertFalse(tomorrow["edgeTrust"]["researchQuality"]["isProbability"])

    def test_invalid_date_and_unknown_identity_fail_safely(self):
        with self.assertRaises(ValidationError):
            self.service.schedule(selected_date="08/04/2026")
        self.assertIsNone(self.service.entity("unknown"))
        self.assertIsNone(self.service.game("unknown"))

    def test_cache_deduplicates_requests_and_manual_refresh_invalidates(self):
        self.service.read()
        self.service.read()
        self.assertEqual(self.service.provider_requests, 1)
        self.service.refresh()
        self.assertEqual(self.service.provider_requests, 2)

    def test_provider_correction_preserves_canonical_game_identity(self):
        payload = fixture()
        service = MlbScheduleEntityService(MemoryCache(), self.rollout, self.shadow, payload_loader=lambda: payload)
        before = service.game("mlb-2026-08-04-nyy-lad-1")
        payload["games"][1]["startTime"] = "2026-08-05T03:10:00Z"
        after = service.refresh()
        corrected = next(item for item in after["games"] if item["id"] == before["id"])
        self.assertEqual(corrected["id"], before["id"])
        self.assertNotEqual(corrected["starts_at"], before["starts_at"])

    def test_shadow_logs_differences_without_exposing_candidate(self):
        self.rollout.transition("mlb", "internal_testing", actor="test", reason="contract validation")
        self.rollout.transition("mlb", "shadow", actor="test", reason="shadow comparison")
        candidate = fixture()
        candidate["provider"] = "candidate-provider"
        candidate["games"][1]["startTime"] = "2026-08-05T03:10:00Z"
        result = self.service.compare_shadow_candidate(candidate, "candidate-provider")
        self.assertFalse(result["exposedAsPrimary"])
        self.assertIn("time_conflict", {item["category"] for item in result["discrepancies"]})
        self.assertGreater(self.shadow.summary("mlb")["total"], 0)

    def test_limited_live_requires_injected_server_adapter(self):
        for target in ("internal_testing", "shadow", "limited_live"):
            self.rollout.transition("mlb", target, actor="test", reason=target)
        with self.assertRaises(ProviderValidationError):
            self.service.read(refresh=True)
        live_payload = fixture()
        live_payload["provider"] = "reviewed-live-adapter"
        live = MlbScheduleEntityService(MemoryCache(), self.rollout, self.shadow, live_payload_loader=lambda: live_payload)
        result = live.read()
        self.assertEqual(result["source"]["mode"], "live")
        self.assertFalse(result["source"]["certifiedLive"])
        self.assertIn("Limited live", result["source"]["notice"])


class ApiIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.config = ProviderConfig.from_env({
            "EDGEBOARD_ENV": "test", "EDGEBOARD_DATA_MODE": "sample", "SAMPLE_MODE": "true",
            "SAMPLE_MODE_ENABLED": "true", "DATABASE_URL": "sqlite:///:memory:",
        })
        self.runtime = build_runtime(self.config)
        self.api = Api(self.runtime)

    def tearDown(self):
        self.runtime.close()

    def test_schedule_search_profile_game_and_bundle_routes(self):
        status, schedule, _ = self.api.handle("GET", "/api/events", query="leagueId=mlb&date=2026-08-05")
        self.assertEqual(status, 200)
        self.assertEqual(len(schedule["items"]), 2)
        status, search, _ = self.api.handle("GET", "/api/entities", query="leagueId=mlb&q=Dodgers")
        self.assertEqual((status, search["items"][0]["id"]), (200, "LAD"))
        self.assertEqual(self.api.handle("GET", "/api/entities/mlb-aaron-judge")[1]["item"]["id"], "mlb-aaron-judge")
        self.assertEqual(self.api.handle("GET", "/api/games/mlb-2026-08-05-bos-nyy-2")[1]["item"]["status"], "scheduled")
        bundle = self.api.handle("GET", "/api/provider-data")[1]
        self.assertTrue(any(item["event_id"].startswith("mlb-") for item in bundle["events"]))
        self.assertTrue(any(item["id"] == "mlb-aaron-judge" for item in bundle["entities"]))
        self.assertEqual(bundle["provider_status"]["schedule_entity_source"]["mode"], "fixture")
        self.assertEqual(bundle["provider_status"]["mode"], "sample")

    def test_unknown_public_ids_fail_safely(self):
        self.assertEqual(self.api.handle("GET", "/api/entities/not-real")[0], 400)
        self.assertEqual(self.api.handle("GET", "/api/games/not-real")[0], 400)

    def test_capabilities_are_declared_but_never_live(self):
        diagnostic = self.runtime.capabilities.diagnostic("edgeboard-mlb-contract-fixture", "mlb", "schedules")
        self.assertTrue(diagnostic["fixtureAvailable"])
        self.assertFalse(diagnostic["liveCallAllowed"])
        self.assertFalse(diagnostic["userVisibleLive"])


if __name__ == "__main__":
    unittest.main()
