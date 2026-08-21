from __future__ import annotations

import copy
import json
import unittest
from datetime import datetime, timedelta, timezone

from server.api import Api
from server.cache import MemoryCache
from server.config import ProviderConfig
from server.errors import ProviderAuthenticationError, ProviderRateLimitError
from server.mlb_live_state import (
    FRESHNESS_THRESHOLDS, MLB_LIVE_STATE_CONTRACT_VERSION, LivePollingPolicy,
    MlbLiveStateAdapter, MlbLiveStateService, compare_mlb_live_shadow,
)
from server.mlb_schedule_entities import MlbScheduleEntityService
from server.runtime import build_runtime


class _Rollout:
    def __init__(self, state="shadow"): self.state = state
    def get(self, _league): return {"rolloutState": self.state}


class _Shadow:
    def __init__(self): self.calls = []
    def record(self, *args): self.calls.append(args); return 1


class MlbLiveStateTests(unittest.TestCase):
    def setUp(self):
        self.cache, self.rollout, self.shadow = MemoryCache(), _Rollout(), _Shadow()
        self.schedule = MlbScheduleEntityService(self.cache, self.rollout, self.shadow)
        self.service = MlbLiveStateService(self.cache, self.rollout, self.shadow, self.schedule)
        self.raw = self.service._fixture()
        self.now = datetime(2026, 8, 4, 14, tzinfo=timezone.utc)

    def normalize(self, raw=None, now=None):
        return MlbLiveStateAdapter().normalize(raw or self.raw, self.schedule.read(), now=now or self.now)

    def single(self, **changes):
        raw = copy.deepcopy(self.raw)
        row = copy.deepcopy(raw["updates"][2]); row.update(changes)
        raw["updates"] = [row]
        return raw

    def test_fixture_normalizes_and_provider_fields_stay_private(self):
        result = self.normalize()
        self.assertEqual(MLB_LIVE_STATE_CONTRACT_VERSION, result["contractVersion"])
        self.assertEqual(6, len(result["states"])); self.assertEqual([], result["rejected"])
        public = self.service.read()
        self.assertNotIn("providerStatus", json.dumps(public))
        self.assertFalse(public["source"]["liveVerified"])

    def test_statuses_normalize_conservatively(self):
        for raw_status, expected in {
            "Scheduled":"scheduled", "Pregame":"pregame", "InProgress":"in_progress",
            "Delayed":"delayed", "Suspended":"suspended", "Resumed":"resumed",
            "Canceled":"cancelled", "Completed":"final", "mystery":"unknown",
        }.items():
            row = self.normalize(self.single(status=raw_status))["states"][0]
            self.assertEqual(expected, row["status"])

    def test_score_and_inning_state_accept_extra_innings(self):
        row = self.normalize(self.single(period={"inning": 12, "half": "bottom"}, score={"away": 8, "home": 8}))["states"][0]
        self.assertEqual(12, row["period"]["inning"]); self.assertEqual({"away": 8, "home": 8}, row["score"])

    def test_negative_score_invalid_inning_and_half_are_quarantined(self):
        for changes in ({"score":{"away":-1,"home":2}}, {"period":{"inning":0,"half":"top"}}, {"period":{"inning":2,"half":"side"}}):
            result = self.normalize(self.single(**changes))
            self.assertEqual([], result["states"]); self.assertEqual("invalid_live_state", result["rejected"][0]["code"])

    def test_complete_inning_scores_must_match_totals(self):
        raw = self.single(score={"away": 4, "home": 3}, inningScores=[{"inning":1,"away":1,"home":1}], inningScoresComplete=True)
        self.assertEqual([], self.normalize(raw)["states"])

    def test_partial_inning_scores_are_not_filled(self):
        row = self.normalize()["states"][2]
        self.assertEqual(5, len(row["inningScores"])); self.assertFalse(row["inningScoresComplete"])

    def test_outs_zero_one_two_and_three_transition(self):
        for outs in (0, 1, 2): self.assertEqual(outs, self.normalize(self.single(outs=outs))["states"][0]["outs"])
        row = self.normalize(self.single(outs=3))["states"][0]
        self.assertIsNone(row["outs"]); self.assertIn("provider_three_out_transition_omitted", row["warnings"])
        self.assertEqual([], self.normalize(self.single(outs=4))["states"])

    def test_count_validation_and_partial_coverage(self):
        row = self.normalize(self.single(count={"balls":3,"strikes":2}))["states"][0]
        self.assertEqual({"balls":3,"strikes":2}, row["count"])
        partial = self.normalize(self.single(count={"balls":2}))["states"][0]
        self.assertIn("partial_count_coverage", partial["warnings"])
        self.assertEqual([], self.normalize(self.single(count={"balls":4,"strikes":0}))["states"])

    def test_base_occupancy_supports_booleans_and_rejects_duplicate_runners(self):
        row = self.normalize(self.single(bases={"first":True,"second":False,"third":True}))["states"][0]
        self.assertEqual({"first":True,"second":False,"third":True}, row["bases"]); self.assertIsNone(row["baseRunners"])
        duplicate = self.single(bases={"first":"mlb-aaron-judge","second":"mlb-aaron-judge","third":False})
        self.assertEqual([], self.normalize(duplicate)["states"])

    def test_participants_require_canonical_ids_and_name_only_never_resolves(self):
        row = self.normalize(self.single(currentBatterId="not-real", currentPitcherId="not-real"))["states"][0]
        self.assertIsNone(row["currentBatterId"]); self.assertIsNone(row["currentPitcherId"])
        self.assertTrue(any("unresolved" in item for item in row["warnings"]))
        named = self.single(currentBatterId=None, currentBatterName="Aaron Judge")
        self.assertIn("currentBatterId_unresolved_name_only", self.normalize(named)["states"][0]["warnings"])

    def test_unknown_event_is_quarantined_without_destroying_sibling(self):
        raw = copy.deepcopy(self.raw); raw["updates"][0]["eventId"] = "unknown"
        result = self.normalize(raw)
        self.assertEqual(5, len(result["states"])); self.assertEqual(1, len(result["rejected"]))

    def test_meaningful_version_is_stable_and_identical_updates_are_suppressed(self):
        first = self.normalize(self.single())["states"][0]
        changed_time = self.single(providerUpdatedAt="2026-08-04T13:59:55Z")
        second = self.normalize(changed_time)["states"][0]
        self.assertEqual(first["fingerprint"], second["fingerprint"])
        service = MlbLiveStateService(MemoryCache(), self.rollout, self.shadow, self.schedule)
        normalized = self.normalize(self.single())
        self.assertEqual(1, service._accept(normalized["states"])["accepted"])
        self.assertEqual(1, service._accept(normalized["states"])["duplicates"])

    def test_refreshing_fixture_timeline_does_not_replay_old_transitions(self):
        first = self.service.read(); before = len(first["transitions"])
        second = self.service.read(refresh=True)
        self.assertEqual(before, len(second["transitions"]))
        self.assertEqual(len(first["states"]), len(second["states"]))

    def test_score_inning_and_status_changes_create_new_versions(self):
        base = self.normalize(self.single())["states"][0]
        for changes in ({"score":{"away":5,"home":3}}, {"period":{"inning":7,"half":"top"}}, {"status":"Delayed"}):
            self.assertNotEqual(base["fingerprint"], self.normalize(self.single(**changes))["states"][0]["fingerprint"])

    def test_transitions_are_audited_and_invalid_transition_warns(self):
        service = MlbLiveStateService(MemoryCache(), self.rollout, self.shadow, self.schedule)
        scheduled = self.normalize(self.single(status="Scheduled", period=None, score=None, outs=None, count=None, bases=None))["states"]
        live = self.normalize(self.single(status="InProgress"))["states"]
        final = self.normalize(self.single(status="Final", score={"away":4,"home":3}))["states"]
        service._accept(scheduled); service._accept(live); service._accept(final)
        self.assertTrue(all(item["valid"] for item in service._transitions))
        bad = self.normalize(self.single(status="Pregame"))["states"]
        result = service._accept(bad)
        self.assertEqual(1, result["invalidTransitions"])

    def test_correction_retains_old_and_new_state(self):
        service = MlbLiveStateService(MemoryCache(), self.rollout, self.shadow, self.schedule)
        first = self.normalize(self.single(status="Final", score={"away":5,"home":3}))["states"]
        corrected = self.normalize(self.single(status="Final", score={"away":4,"home":3}, providerUpdatedAt="2026-08-04T14:00:00Z"))["states"]
        service._accept(first); result = service._accept(corrected)
        self.assertEqual(1, result["corrections"]); self.assertFalse(service._corrections[0]["savedSnapshotsChanged"])

    def test_event_aware_freshness_never_labels_stale_state_live(self):
        stale_now = self.now + timedelta(seconds=FRESHNESS_THRESHOLDS["in_progress"] * 4)
        row = self.normalize(self.single(), now=stale_now)["states"][0]
        self.assertEqual("stale", row["freshness"]["state"])
        bundle = self.service.provider_bundle({"events":[{"event_id":"mlb-2026-08-04-nyy-lad-1","league_key":"mlb","status":"live"}],"offers":[]})
        self.assertIn(bundle["events"][0]["status"], {"in_progress", "stale"})

    def test_poll_policy_has_distinct_cadences_and_final_window(self):
        policy = LivePollingPolicy(enabled=True)
        self.assertGreater(policy.interval("scheduled"), policy.interval("pregame"))
        self.assertLess(policy.interval("in_progress"), policy.interval("delayed"))
        self.assertGreater(policy.interval("suspended"), policy.interval("delayed"))
        self.assertEqual(120, policy.interval("final", final_age_seconds=10))
        self.assertEqual(0, policy.interval("final", final_age_seconds=1000))

    def test_polling_defaults_off_and_requires_valid_allowlist(self):
        self.assertEqual("kill_switch", self.service.poll_once(lambda _ids: self.raw)["reason"])
        with self.assertRaises(Exception): self.service.configure_polling(enabled=True, event_ids=["not-real"])
        with self.assertRaises(Exception): self.service.configure_polling(enabled=True, event_ids=[])
        with self.assertRaises(Exception): self.service.configure_polling(enabled=True, event_ids=[
            "mlb-game-0000000000000001", "mlb-game-0000000000000002",
            "mlb-game-0000000000000003", "mlb-game-0000000000000004",
        ])
        configured = self.service.configure_polling(enabled=True, event_ids=["mlb-game-0123456789abcdef"])
        self.assertEqual(["mlb-game-0123456789abcdef"], configured["activeEvents"])

    def test_polling_budget_and_active_scope(self):
        service = MlbLiveStateService(MemoryCache(), self.rollout, self.shadow, self.schedule,
            polling_policy=LivePollingPolicy(enabled=True, request_budget=1))
        event = "mlb-2026-08-04-nyy-lad-1"; service.configure_polling(enabled=True, event_ids=[event])
        payload = self.single(); payload["updates"][0]["eventId"] = event
        self.assertEqual("accepted", service.poll_once(lambda _ids: payload, now=self.now)["status"])
        self.assertEqual("request_budget_exhausted", service.poll_once(lambda _ids: payload, now=self.now)["reason"])

    def test_auth_failure_stops_and_rate_limit_backs_off(self):
        for error, expected in ((ProviderAuthenticationError("no"), "stopped"), (ProviderRateLimitError("slow", 17), "backoff")):
            service = MlbLiveStateService(MemoryCache(), self.rollout, self.shadow, self.schedule,
                polling_policy=LivePollingPolicy(enabled=True, request_budget=2))
            event = "mlb-2026-08-04-nyy-lad-1"; service.configure_polling(enabled=True, event_ids=[event]); service.read()
            result = service.poll_once(lambda _ids, e=error: (_ for _ in ()).throw(e), now=self.now)
            self.assertEqual(expected, result["status"])
        self.assertEqual(17, result["retryAfterSeconds"])

    def test_final_and_cancelled_events_leave_active_scope(self):
        policy = LivePollingPolicy(enabled=True)
        allow = {"x"}
        self.assertFalse(policy.eligible({"eventId":"x","status":"cancelled","freshness":{"ageSeconds":0}}, allow))
        self.assertFalse(policy.eligible({"eventId":"x","status":"final","freshness":{"ageSeconds":1000}}, allow))

    def test_shadow_comparison_is_diagnostic(self):
        fixture = {"states":[self.normalize(self.single())["states"][0]]}
        candidate = copy.deepcopy(fixture); candidate["states"][0]["score"] = {"away":9,"home":3}
        differences = compare_mlb_live_shadow(fixture, candidate)
        self.assertIn("score_conflict", {item["category"] for item in differences})

    def test_edge_intelligence_answers_supported_and_unknown_fields(self):
        self.assertIn("4–3", self.service.answer("mlb-2026-08-04-nyy-lad-1", "What is the score?")["answer"])
        unavailable = self.service.answer("mlb-2026-08-05-bos-nyy-1", "Who is batting?")
        self.assertEqual("unavailable", unavailable["status"])

    def test_provider_bundle_marks_started_pregame_markets_for_review(self):
        base = {"events":[{"event_id":"mlb-2026-08-04-nyy-lad-1","league_key":"mlb","status":"scheduled"}],
                "offers":[{"event_id":"mlb-2026-08-04-nyy-lad-1","selections":[{"selection_id":"x"}]}]}
        result = self.service.provider_bundle(base)
        selection = result["offers"][0]["selections"][0]
        self.assertFalse(selection["pregame_context_current"]); self.assertTrue(selection["context_review_required"])
        self.assertNotIn("settlement", selection)

    def test_history_is_bounded_and_diagnostics_confirm_no_background_loop(self):
        service = MlbLiveStateService(MemoryCache(), self.rollout, self.shadow, self.schedule, history_limit=2)
        for score in (4, 5, 6): service._accept(self.normalize(self.single(score={"away":score,"home":3}))["states"])
        self.assertEqual(2, len(service.history("mlb-2026-08-04-nyy-lad-1")["items"]))
        self.assertFalse(service.diagnostics()["backgroundLoopActive"])

    def test_api_exposes_normalized_state_and_protects_diagnostics(self):
        runtime = build_runtime(ProviderConfig.from_env({"EDGEBOARD_ENV":"test","EDGEBOARD_DATA_MODE":"sample","DATABASE_URL":"sqlite:///:memory:"}))
        try:
            api = Api(runtime)
            status, state, _ = api.handle("GET", "/api/live/mlb")
            self.assertEqual(200, status); self.assertTrue(state["states"]); self.assertFalse(state["source"]["liveVerified"])
            denied, _, _ = api.handle("GET", "/api/admin/mlb/live-state/status")
            self.assertEqual(403, denied)
        finally: runtime.close()


if __name__ == "__main__": unittest.main()
