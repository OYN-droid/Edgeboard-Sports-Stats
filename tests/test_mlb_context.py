from __future__ import annotations

import copy
import json
import unittest
from datetime import datetime, timezone

from server.api import Api
from server.cache import MemoryCache
from server.config import ProviderConfig
from server.errors import ProviderEntitlementError, ProviderValidationError, ValidationError
from server.mlb_context import (
    AVAILABILITY_STATES, CONTEXT_EVENT_TYPES, LINEUP_STATES, MLB_CONTEXT_CONTRACT_VERSION,
    ROSTER_STATES, STARTER_STATES, MlbContextAdapter, MlbContextService,
    compare_mlb_context_shadow,
)
from server.mlb_schedule_entities import MlbScheduleEntityService
from server.runtime import build_runtime


class _Rollout:
    def get(self, _league): return {"rolloutState": "shadow"}


class _Shadow:
    def __init__(self): self.calls = []
    def record(self, *args): self.calls.append(args)


class MlbContextTests(unittest.TestCase):
    def setUp(self):
        self.cache = MemoryCache(); self.shadow = _Shadow()
        self.schedule = MlbScheduleEntityService(self.cache, _Rollout(), self.shadow)
        self.service = MlbContextService(self.cache, _Rollout(), self.shadow, self.schedule)
        self.raw = self.service._fixture()
        self.now = datetime(2026, 8, 4, 14, tzinfo=timezone.utc)

    def normalize(self, raw=None):
        return MlbContextAdapter().normalize(raw or self.raw, self.schedule.read(), now=self.now)

    def test_contract_enumerates_conservative_states(self):
        self.assertTrue({"probable", "questionable", "doubtful", "out", "unknown"}.issubset(AVAILABILITY_STATES))
        self.assertTrue({"active", "injured_list", "traded", "released"}.issubset(ROSTER_STATES))
        self.assertIn("conflicting", LINEUP_STATES); self.assertIn("changed", STARTER_STATES)
        self.assertTrue({"lineup_changed", "starter_changed", "provider_correction"}.issubset(CONTEXT_EVENT_TYPES))

    def test_fixture_normalizes_without_rejections_and_hides_provider_ids(self):
        data = self.normalize()
        self.assertEqual(MLB_CONTEXT_CONTRACT_VERSION, data["contractVersion"])
        self.assertEqual([], data["rejected"])
        self.assertNotIn("providerRecordId", json.dumps(data))
        self.assertFalse(data["edgeTrust"]["researchQuality"]["isProbability"])

    def test_unknown_player_is_quarantined_without_destroying_sibling(self):
        raw = copy.deepcopy(self.raw); raw["availability"][0]["playerId"] = "unknown"
        data = self.normalize(raw)
        self.assertEqual(1, len(data["availability"])); self.assertEqual("invalid_availability", data["rejected"][0]["code"])

    def test_unknown_status_maps_to_unknown_not_out(self):
        raw = copy.deepcopy(self.raw); raw["availability"][0]["status"] = "maybe"
        self.assertEqual("unknown", self.normalize(raw)["availability"][0]["status"])

    def test_reported_reason_is_preserved_without_medical_inference(self):
        raw = copy.deepcopy(self.raw); raw["availability"][0]["reportedReason"] = "Provider note only"
        row = self.normalize(raw)["availability"][0]
        self.assertEqual("Provider note only", row["reportedReason"]); self.assertNotIn("severity", row)

    def test_historical_roster_association_does_not_overwrite_current_entity(self):
        raw = copy.deepcopy(self.raw); raw["rosters"][0].update({"teamId": "LAD", "status": "traded", "endedAt": "2026-07-01T12:00:00Z"})
        data = self.normalize(raw)
        self.assertEqual("LAD", data["rosters"][0]["teamId"])
        self.assertEqual("NYY", self.schedule.entity("mlb-aaron-judge")["teamId"])

    def test_lineup_requires_valid_unique_slots_and_players(self):
        raw = copy.deepcopy(self.raw); raw["lineups"][0]["entries"].append({"playerId":"mlb-gerrit-cole","battingOrder":2,"position":"P"})
        data = self.normalize(raw)
        self.assertEqual([], data["lineups"]); self.assertTrue(any(item["code"] == "invalid_lineup" for item in data["rejected"]))

    def test_partial_lineup_stays_partial_and_does_not_invent_slots(self):
        lineup = self.normalize()["lineups"][0]
        self.assertFalse(lineup["complete"]); self.assertEqual([2], [item["battingOrder"] for item in lineup["entries"]])

    def test_lineup_must_reference_team_in_exact_game(self):
        raw = copy.deepcopy(self.raw); raw["lineups"][0]["teamId"] = "BOS"
        self.assertEqual([], self.normalize(raw)["lineups"])

    def test_probable_starter_must_be_pitcher_and_game_specific(self):
        raw = copy.deepcopy(self.raw); raw["starters"][0]["playerId"] = "mlb-aaron-judge"
        self.assertEqual([], self.normalize(raw)["starters"])
        first = self.normalize()["starters"][0]
        self.assertEqual("mlb-2026-08-04-nyy-lad-1", first["eventId"])

    def test_doubleheader_context_does_not_cross_events(self):
        context = self.service.context(event_id="mlb-2026-08-05-bos-nyy-1")
        self.assertTrue(context["weather"]); self.assertFalse(any(item.get("eventId") == "mlb-2026-08-05-bos-nyy-2" for item in context["weather"]))

    def test_invalid_weather_value_is_quarantined(self):
        raw = copy.deepcopy(self.raw); raw["weather"][0]["windMph"] = 999
        data = self.normalize(raw)
        self.assertEqual(1, len(data["weather"])); self.assertTrue(any(item["domain"] == "weather" for item in data["rejected"]))

    def test_weather_has_no_invented_risk_score(self):
        row = self.normalize()["weather"][0]
        self.assertNotIn("risk", row); self.assertNotIn("impact", row)

    def test_context_events_preserve_before_after_and_never_claim_cause(self):
        event = self.normalize()["contextualEvents"][0]
        self.assertIn("previousState", event); self.assertIn("currentState", event)
        self.assertEqual("related_event", event["causalRelationship"])

    def test_invalid_context_event_is_suppressed(self):
        raw = copy.deepcopy(self.raw); raw["contextualEvents"][0]["type"] = "medical_diagnosis"
        data = self.normalize(raw)
        self.assertEqual(4, len(data["contextualEvents"])); self.assertTrue(any(item["domain"] == "contextualEvents" for item in data["rejected"]))

    def test_cache_prevents_duplicate_fixture_loads(self):
        self.service.read(); requests = self.service.provider_requests; self.service.read()
        self.assertEqual(requests, self.service.provider_requests)

    def test_targeted_context_invalidation_refreshes_research_not_saved_snapshots(self):
        called = []; self.service.invalidation_callbacks.append(lambda: called.append(True)); self.service.read()
        result = self.service.invalidate(player_id="mlb-aaron-judge")
        self.assertGreater(result["invalidatedCacheEntries"], 0); self.assertTrue(result["refreshableResearchInvalidated"])
        self.assertFalse(result["savedSnapshotsChanged"]); self.assertEqual([True], called)

    def test_entity_and_game_context_use_canonical_ids(self):
        player = self.service.enrich_entity(self.schedule.entity("mlb-aaron-judge"))
        game = self.service.enrich_game(self.schedule.game("mlb-2026-08-04-nyy-lad-1"))
        self.assertTrue(player["context"]["availability"]); self.assertTrue(game["context"]["lineups"])

    def test_prop_offer_context_is_visible_and_unverified_cause_is_not_created(self):
        runtime = build_runtime(ProviderConfig.from_env({"EDGEBOARD_ENV":"test","EDGEBOARD_DATA_MODE":"sample","SAMPLE_MODE":"true","SAMPLE_MODE_ENABLED":"true","DATABASE_URL":"sqlite:///:memory:"}))
        try:
            bundle = runtime.mlb_player_props.provider_bundle({"offers": [], "provider_status": {}})
            offer = runtime.mlb_context.provider_bundle(bundle)["offers"][0]
            selection = offer["selections"][0]
            self.assertEqual("confirmed", selection["starter_status"])
            self.assertTrue(selection["market_events"])
            self.assertTrue(all(item["causal_relationship"] == "related_event" for item in selection["market_events"]))
        finally: runtime.close()

    def test_out_player_market_is_invalidated_not_silently_available(self):
        raw = copy.deepcopy(self.raw); raw["availability"][1]["status"] = "out"
        service = MlbContextService(MemoryCache(), _Rollout(), _Shadow(), self.schedule, payload_loader=lambda: raw)
        runtime_offer = {"league_key":"mlb","event_id":"mlb-2026-08-04-nyy-lad-1","selections":[{"participant":{"id":"mlb-gerrit-cole"},"team_id":"NYY","canonical_stat_id":"baseball-pitcher-strikeouts","available":True}]}
        selection = service.enrich_offers([runtime_offer])[0]["selections"][0]
        self.assertFalse(selection["available"]); self.assertTrue(selection["context_review_required"])

    def test_shadow_entitlement_failure_preserves_fixture(self):
        def unavailable(**_kwargs): return None, [{"domain":"injuries","status":"forbidden_by_entitlement"}], ProviderEntitlementError("unavailable")
        service = MlbContextService(MemoryCache(), _Rollout(), _Shadow(), self.schedule, shadow_validator=unavailable)
        report = service.run_shadow_validation(selected_date="2026-08-04")
        self.assertFalse(report["exposedAsPrimary"]); self.assertFalse(report["normalization"]["accepted"])
        self.assertEqual("fixture", service.read()["source"]["mode"])

    def test_shadow_comparison_exposes_conflict_without_resolution(self):
        fixture = self.normalize(); candidate = copy.deepcopy(fixture); candidate["availability"][0]["status"] = "out"
        differences = compare_mlb_context_shadow(fixture, candidate)
        self.assertTrue(any(item["category"] == "availability_conflict" for item in differences))

    def test_public_api_context_endpoints_and_profile_context(self):
        runtime = build_runtime(ProviderConfig.from_env({"EDGEBOARD_ENV":"test","EDGEBOARD_DATA_MODE":"sample","SAMPLE_MODE":"true","SAMPLE_MODE_ENABLED":"true","DATABASE_URL":"sqlite:///:memory:"}))
        try:
            api = Api(runtime)
            status, payload, _ = api.handle("GET", "/api/availability", query="playerId=mlb-aaron-judge")
            self.assertEqual(200, status); self.assertEqual(1, len(payload["items"])); self.assertTrue(payload["source"]["sample"])
            status, profile, _ = api.handle("GET", "/api/entities/mlb-aaron-judge")
            self.assertEqual(200, status); self.assertIn("context", profile["item"])
            status, game, _ = api.handle("GET", "/api/games/mlb-2026-08-04-nyy-lad-1")
            self.assertEqual(200, status); self.assertTrue(game["item"]["context"]["starters"])
        finally: runtime.close()

    def test_invalid_contract_fails_closed(self):
        raw = copy.deepcopy(self.raw); raw["contractVersion"] = "wrong"
        with self.assertRaises(ProviderValidationError): self.normalize(raw)

    def test_admin_shadow_requires_authorization(self):
        runtime = build_runtime(ProviderConfig.from_env({"EDGEBOARD_ENV":"test","EDGEBOARD_DATA_MODE":"sample","SAMPLE_MODE":"true","SAMPLE_MODE_ENABLED":"true","DATABASE_URL":"sqlite:///:memory:"}))
        try:
            status, _, _ = Api(runtime).handle("GET", "/api/admin/mlb/context/status")
            self.assertEqual(403, status)
        finally: runtime.close()


if __name__ == "__main__":
    unittest.main()
