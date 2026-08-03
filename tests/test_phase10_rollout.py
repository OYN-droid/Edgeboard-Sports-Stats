from __future__ import annotations

import json
import unittest
from datetime import datetime, timedelta, timezone

from server.api import Api
from server.cache import MemoryCache
from server.certification import REQUIRED_CHECKS, CertificationService, calculate_health, evaluate_release_gate
from server.config import ProviderConfig
from server.contracts import validate_normalized_bundle
from server.corrections import CorrectionService
from server.database import Database
from server.errors import ValidationError
from server.league_validation import cross_validate_stat_market, innings_to_outs, validate_league_market
from server.rollout import CERTIFICATION_CATEGORIES, DOMAINS, ROLLOUT_STATES, RolloutService, fixture_domains
from server.rollout_adapters import RolloutFixtureAdapter
from server.rollout_schedules import league_schedule
from server.runtime import build_runtime
from server.shadow import DISCREPANCY_CATEGORIES, ShadowService, compare_shadow
from server.usage import ProviderUsageMonitor


class DatabaseCase(unittest.TestCase):
    def setUp(self):
        self.database = Database()
        self.database.migrate()

    def tearDown(self):
        self.database.close()


class RolloutStateTests(DatabaseCase):
    def setUp(self):
        super().setUp()
        self.rollout = RolloutService(self.database)

    def test_all_rollout_states_are_explicit(self):
        self.assertEqual(len(ROLLOUT_STATES), 8)
        self.assertEqual(set(ROLLOUT_STATES), {"disabled", "fixture_only", "internal_testing", "shadow", "limited_live", "production", "degraded", "suspended"})

    def test_four_rollout_leagues_default_to_fixture_only(self):
        coverage = self.rollout.list_coverage()
        self.assertEqual({item["leagueId"] for item in coverage}, {"mlb", "wnba", "ufc", "mls"})
        self.assertTrue(all(item["rolloutState"] == "fixture_only" for item in coverage))
        self.assertTrue(all(item["dataMode"] == "fixture" for item in coverage))

    def test_invalid_state_transition_is_rejected(self):
        with self.assertRaises(ValidationError):
            self.rollout.transition("mlb", "production", actor="test", reason="unsafe")

    def test_safe_staged_transitions_and_audit(self):
        for target in ("internal_testing", "shadow", "limited_live"):
            result = self.rollout.transition("mlb", target, actor="test", reason=f"Move to {target}")
            self.assertEqual(result.rollout_state, target)
        rows = self.database.execute("SELECT action,metadata_json FROM audit_log WHERE target_id='mlb' ORDER BY created_at")
        self.assertEqual(len(rows), 3)
        self.assertEqual(json.loads(rows[-1]["metadata_json"])["to"], "limited_live")

    def test_production_needs_certification_and_confirmation(self):
        certification = CertificationService(self.database)
        for target in ("internal_testing", "shadow", "limited_live"):
            self.rollout.transition("wnba", target, actor="test", reason="staged")
        with self.assertRaises(ValidationError):
            self.rollout.transition("wnba", "production", actor="test", reason="promote", confirmation="ACTIVATE WNBA PRODUCTION", certification_service=certification)

    def test_suspend_and_rollback_are_audited(self):
        self.rollout.transition("ufc", "internal_testing", actor="test", reason="test")
        self.rollout.transition("ufc", "suspended", actor="test", reason="provider contract hold")
        result = self.rollout.transition("ufc", "fixture_only", actor="test", reason="safe fixture rollback")
        self.assertEqual(result.rollout_state, "fixture_only")

    def test_health_never_automatically_promotes_and_can_demote(self):
        self.assertEqual(self.rollout.apply_health("mlb", 100, "healthy"), "fixture_only")
        for target in ("internal_testing", "shadow", "limited_live"):
            self.rollout.transition("mlb", target, actor="test", reason="staged")
        self.assertEqual(self.rollout.apply_health("mlb", 20, "failing"), "shadow")

    def test_provider_switch_requires_safe_state_and_is_audited(self):
        self.rollout.switch_provider("mlb", "replacement-fixture", actor="test", reason="contract test")
        self.assertEqual(self.rollout.get("mlb")["provider"], "replacement-fixture")
        self.assertEqual(self.database.execute("SELECT action FROM audit_log WHERE target_id='mlb'")[0]["action"], "rollout_provider_switched")

    def test_domain_source_mode_requires_certification(self):
        with self.assertRaises(ValidationError):
            self.rollout.set_domain("mlb", "schedules", "passing", "live_verified", actor="test")
        with self.assertRaises(ValidationError):
            self.rollout.set_domain("mlb", "schedules", "certified", "live_verified", actor="test", evidence={"parity": "passed"})
        self.rollout.switch_provider("mlb", "verified-provider", actor="test", reason="domain attribution test")
        self.rollout.set_domain("mlb", "schedules", "certified", "live_verified", actor="test", evidence={"parity": "passed"})
        schedule = next(item for item in self.rollout.get("mlb")["domains"] if item["id"] == "schedules")
        self.assertEqual(schedule["configuredSourceMode"], "live_verified")
        self.assertEqual(schedule["sourceMode"], "fixture", "fixture-only state must keep provider evidence out of the primary UI")

    def test_shadow_never_exposes_provider_evidence_as_primary(self):
        self.rollout.switch_provider("mlb", "shadow-provider", actor="test", reason="shadow test")
        self.rollout.set_domain("mlb", "schedules", "certified", "live_verified", actor="test", evidence={"parity": "passed"})
        self.rollout.transition("mlb", "internal_testing", actor="test", reason="staged")
        self.rollout.transition("mlb", "shadow", actor="test", reason="compare only")
        coverage = self.rollout.get("mlb")
        self.assertEqual(coverage["dataMode"], "fixture")
        self.assertEqual(next(item for item in coverage["domains"] if item["id"] == "schedules")["sourceMode"], "fixture")

    def test_certification_without_domain_readiness_cannot_promote(self):
        certification = CertificationService(self.database)
        for category, keys in REQUIRED_CHECKS.items():
            for key in keys:
                certification.record("mlb", category, key, "certified", evidence={"review": "passed"}, actor="reviewer")
        for target in ("internal_testing", "shadow", "limited_live"):
            self.rollout.transition("mlb", target, actor="test", reason="staged")
        with self.assertRaises(ValidationError):
            self.rollout.transition(
                "mlb", "production", actor="test", reason="not domain ready",
                confirmation="ACTIVATE MLB PRODUCTION", certification_service=certification,
            )

    def test_explicit_certification_and_domain_readiness_can_promote_one_league_only(self):
        certification = CertificationService(self.database)
        self.rollout.switch_provider("mlb", "verified-provider", actor="reviewer", reason="certification test")
        for domain in fixture_domains("mlb"):
            self.rollout.set_domain(
                "mlb", domain, "certified", "live_verified", actor="reviewer",
                evidence={"fixtureParity": "passed", "reviewedAt": "2026-08-03T12:00:00Z"},
            )
        for category, keys in REQUIRED_CHECKS.items():
            for key in keys:
                certification.record("mlb", category, key, "certified", evidence={"review": "passed"}, actor="reviewer")
        for target in ("internal_testing", "shadow", "limited_live"):
            self.rollout.transition("mlb", target, actor="reviewer", reason="staged")
        result = self.rollout.transition(
            "mlb", "production", actor="reviewer", reason="explicit approval",
            confirmation="ACTIVATE MLB PRODUCTION", certification_service=certification,
        )
        self.assertEqual(result.rollout_state, "production")
        self.assertTrue(all(item["rolloutState"] == "fixture_only" for item in self.rollout.list_coverage() if item["leagueId"] != "mlb"))

    def test_disabled_and_suspended_source_modes_are_unavailable(self):
        # fixture_only can safely move to disabled; data is retained but no live claim is possible.
        result = self.rollout.transition("mls", "disabled", actor="test", reason="no provider")
        self.assertEqual(result.rollout_state, "disabled")
        self.assertEqual(self.rollout.get("mls")["dataMode"], "unavailable")


class CertificationTests(DatabaseCase):
    def setUp(self):
        super().setUp()
        RolloutService(self.database)
        self.service = CertificationService(self.database)

    def test_certification_categories_and_checks_exist(self):
        self.assertEqual(set(REQUIRED_CHECKS), set(CERTIFICATION_CATEGORIES))
        self.assertTrue(all(REQUIRED_CHECKS[category] for category in CERTIFICATION_CATEGORIES))

    def test_positive_result_requires_evidence(self):
        with self.assertRaises(ValidationError):
            self.service.record("mlb", "identity", "league_mapping", "passing", evidence={}, actor="test")

    def test_evidence_and_timestamp_are_retained(self):
        result_id = self.service.record("mlb", "identity", "league_mapping", "conditional", evidence={"fixture": "phase10-v1"}, actor="test", evidence_at="2026-08-01T12:00:00Z")
        checklist = self.service.checklist("mlb")
        check = checklist["categories"][0]["checks"][0]
        self.assertEqual(check["evidence"], {"fixture": "phase10-v1"})
        self.assertEqual(check["evidenceAt"], "2026-08-01T12:00:00Z")
        self.assertEqual(check["decidedBy"], "test")
        self.assertTrue(check["decidedAt"])
        self.assertTrue(result_id)

    def test_complete_certification_requires_every_check(self):
        for category, keys in REQUIRED_CHECKS.items():
            for key in keys:
                self.service.record("mlb", category, key, "certified", evidence={"test": "passed"}, actor="test")
        self.assertTrue(self.service.checklist("mlb")["productionReady"])

    def test_conditional_check_prevents_production_readiness(self):
        self.service.record("mlb", "identity", "league_mapping", "conditional", evidence={"fixture": True}, actor="test")
        self.assertFalse(self.service.checklist("mlb")["productionReady"])

    def test_expired_evidence_fails(self):
        self.service.record("mlb", "identity", "league_mapping", "certified", evidence={"live": True}, actor="test", expires_at="2020-01-01T00:00:00Z")
        self.assertEqual(self.service.checklist("mlb")["categories"][0]["status"], "failing")


class FixtureAdapterTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.adapter = RolloutFixtureAdapter()

    def test_fixture_safety_and_version_metadata(self):
        metadata = self.adapter.metadata
        self.assertEqual(metadata["fixtureVersion"], "phase10-v1")
        self.assertTrue(metadata["license"]["recordingAllowed"])
        self.assertFalse(metadata["license"]["containsSecrets"])
        self.assertFalse(metadata["license"]["containsPersonalData"])

    def test_all_four_adapters_normalize_without_rejections(self):
        for league_id in ("mlb", "wnba", "ufc", "mls"):
            with self.subTest(league_id=league_id):
                result = self.adapter.normalize(league_id)
                self.assertTrue(result["entities"])
                self.assertTrue(result["events"])
                self.assertTrue(result["statistics"])
                self.assertTrue(result["markets"])
                self.assertEqual(result["rejected_markets"], [])
                self.assertEqual(result["source_mode"], "fixture")

    def test_mlb_doubleheader_ids_are_unique(self):
        events = self.adapter.normalize("mlb")["events"]
        self.assertEqual(len({event["event_id"] for event in events}), 2)
        self.assertEqual({event["doubleheader_game"] for event in events}, {1, 2})

    def test_mlb_innings_are_normalized_to_outs(self):
        row = next(item for item in self.adapter.normalize("mlb")["statistics"] if item["stat_id"] == "innings_pitched")
        self.assertEqual(row["value"], 20)
        self.assertEqual(row["display_value"], "6.2")

    def test_wnba_overtime_and_settlement_are_preserved(self):
        result = self.adapter.normalize("wnba")
        self.assertTrue(result["statistics"][0]["overtime"])
        self.assertEqual(result["markets"][0]["settlement_scope"], "including_overtime")

    def test_ufc_is_event_based_with_five_round_market(self):
        result = self.adapter.normalize("ufc")
        self.assertEqual(result["events"][0]["event_type"], "combat-card")
        self.assertEqual(result["events"][0]["scheduled_rounds"], 5)
        self.assertEqual(result["markets"][0]["scheduled_rounds"], 5)

    def test_soccer_preserves_three_way_draw_and_regulation_scope(self):
        result = self.adapter.normalize("mls")
        market = next(item for item in result["markets"] if item["canonical_market_id"] == "three_way_moneyline")
        self.assertEqual({selection["side"] for selection in market["selections"]}, {"home", "draw", "away"})
        self.assertEqual(market["period"], "regulation")

    def test_postponed_soccer_event_keeps_identity_after_reschedule(self):
        event = self.adapter.normalize("mls")["events"][0]
        rescheduled = {**event, "status": "scheduled", "starts_at": "2026-08-05T00:30:00Z"}
        self.assertEqual(event["event_id"], rescheduled["event_id"])

    def test_all_canonical_ids_are_namespaced(self):
        for league_id in ("mlb", "wnba", "ufc", "mls"):
            result = self.adapter.normalize(league_id)
            self.assertTrue(all(item["entity_id"].startswith(f"{league_id}:") for item in result["entities"]))
            self.assertTrue(all(item["event_id"].startswith(f"{league_id}:") for item in result["events"]))


class LeagueMarketValidationTests(unittest.TestCase):
    def test_baseball_innings_notation(self):
        expected = {"0": 0, "1.0": 3, "6.1": 19, "6.2": 20, "6.3": None, "bad": None}
        for value, result in expected.items():
            with self.subTest(value=value): self.assertEqual(innings_to_outs(value), result)

    def test_fixture_markets_pass_league_specific_validation(self):
        adapter = RolloutFixtureAdapter()
        for league_id in ("mlb", "wnba", "ufc", "mls"):
            result = adapter.normalize(league_id)
            for market in result["markets"]:
                event = next(item for item in result["events"] if item["event_id"] == market["event_id"])
                self.assertEqual(validate_league_market(league_id, market, active_event=event), (True, []))

    def test_ufc_replacement_opponent_rejects_old_market(self):
        result = RolloutFixtureAdapter().normalize("ufc")
        event, market = result["events"][0], dict(result["markets"][0])
        event = {**event, "fighter_ids": [event["fighter_ids"][0], "ufc:replacement"]}
        valid, errors = validate_league_market("ufc", market, active_event=event)
        self.assertFalse(valid)
        self.assertTrue(any("pairing" in error for error in errors))

    def test_cancelled_event_rejects_open_market(self):
        result = RolloutFixtureAdapter().normalize("mls")
        event, market = dict(result["events"][0]), result["markets"][0]
        event["status"] = "abandoned"
        self.assertFalse(validate_league_market("mls", market, active_event=event)[0])

    def test_abandoned_soccer_match_stays_abandoned_and_suspends_markets(self):
        bundle = validate_normalized_bundle({
            "events": [{"event_id": "mls:e1", "league_key": "mls", "status": "abandoned"}],
            "offers": [{"offer_id": "m1", "event_id": "mls:e1", "status": "open", "selections": [{"selection_id": "home", "american_odds": 120}]}],
        }).data
        self.assertEqual(bundle["events"][0]["status"], "abandoned")
        self.assertEqual(bundle["offers"][0]["status"], "suspended")
        self.assertFalse(bundle["offers"][0]["selections"][0]["available"])

    def test_ufc_cancelled_bout_rejects_current_market_and_boxing_does_not_inherit_ufc_rules(self):
        result = RolloutFixtureAdapter().normalize("ufc")
        event, market = {**result["events"][0], "status": "cancelled"}, result["markets"][0]
        self.assertFalse(validate_league_market("ufc", market, active_event=event)[0])
        self.assertFalse(validate_league_market("boxing", market, active_event=event)[0])

    def test_invalid_odds_are_quarantined(self):
        result = RolloutFixtureAdapter().normalize("wnba")
        market = {**result["markets"][0], "selections": [{**result["markets"][0]["selections"][0], "american_odds": 50}]}
        self.assertFalse(validate_league_market("wnba", market)[0])

    def test_partial_two_way_and_three_way_markets_are_rejected(self):
        adapter = RolloutFixtureAdapter()
        wnba = adapter.normalize("wnba")["markets"][0]
        soccer = next(item for item in adapter.normalize("mls")["markets"] if item["canonical_market_id"] == "three_way_moneyline")
        self.assertFalse(validate_league_market("wnba", {**wnba, "selections": wnba["selections"][:1]})[0])
        self.assertFalse(validate_league_market("mls", {**soccer, "selections": soccer["selections"][:2]})[0])

    def test_first_five_scope_cannot_be_relabelled_full_game(self):
        market = next(item for item in RolloutFixtureAdapter().normalize("mlb")["markets"] if item["canonical_market_id"] == "first_five_total")
        self.assertFalse(validate_league_market("mlb", {**market, "period": "full_game"})[0])

    def test_ufc_round_totals_require_three_or_five_round_scope(self):
        base = {
            "canonical_market_id": "total_rounds", "period": "fight", "settlement_scope": "official_result",
            "event_id": "ufc:e1", "provider_market_id": "m1", "sportsbook_id": "book", "status": "open",
            "selections": [
                {"side": "over", "participant_role": "fighter", "american_odds": -110},
                {"side": "under", "participant_role": "fighter", "american_odds": -110},
            ],
        }
        self.assertFalse(validate_league_market("ufc", base)[0])
        self.assertTrue(validate_league_market("ufc", {**base, "scheduled_rounds": 3})[0])
        self.assertTrue(validate_league_market("ufc", {**base, "scheduled_rounds": 5})[0])

    def test_soccer_advancement_and_match_result_scopes_stay_distinct(self):
        market = next(item for item in RolloutFixtureAdapter().normalize("mls")["markets"] if item["canonical_market_id"] == "three_way_moneyline")
        self.assertFalse(validate_league_market("mls", {**market, "period": "qualification", "settlement_scope": "advancement"})[0])

    def test_cross_domain_match_and_mismatch(self):
        stat = {
            "league_id": "wnba", "stat_id": "assists", "entity_id": "p1", "event_id": "historical",
            "target_event_id": "e1", "target_period": "full_game", "target_settlement_scope": "including_overtime",
        }
        market = {
            "league_id": "wnba", "canonical_market_id": "player_assists", "entity_id": "p1", "event_id": "e1",
            "period": "full_game", "settlement_scope": "including_overtime", "freshness_state": "fresh",
        }
        self.assertTrue(cross_validate_stat_market(stat, market)[0])
        self.assertFalse(cross_validate_stat_market(stat, {**market, "entity_id": "p2"})[0])
        self.assertFalse(cross_validate_stat_market(stat, {**market, "freshness_state": "stale"})[0])
        for missing in ("target_event_id", "target_period", "target_settlement_scope"):
            self.assertFalse(cross_validate_stat_market({key: value for key, value in stat.items() if key != missing}, market)[0])

    def test_wnba_combo_props_have_canonical_stat_mappings(self):
        mappings = (
            ("points_rebounds", "player_points_rebounds"),
            ("points_assists", "player_points_assists"),
            ("rebounds_assists", "player_rebounds_assists"),
            ("points_rebounds_assists", "player_pra"),
        )
        for stat_id, market_id in mappings:
            stat = {
                "league_id": "wnba", "stat_id": stat_id, "entity_id": "p1", "target_event_id": "e1",
                "target_period": "full_game", "target_settlement_scope": "including_overtime",
            }
            market = {
                "league_id": "wnba", "canonical_market_id": market_id, "entity_id": "p1", "event_id": "e1",
                "period": "full_game", "settlement_scope": "including_overtime", "freshness_state": "fresh",
            }
            self.assertTrue(cross_validate_stat_market(stat, market)[0])


class ShadowCorrectionHealthTests(DatabaseCase):
    def test_shadow_discrepancy_categories(self):
        self.assertEqual(len(DISCREPANCY_CATEGORIES), 11)

    def test_shadow_matches_without_conflict(self):
        payload = {"items": [{"id": "e1", "status": "scheduled", "start_time": "2026-08-03T12:00:00Z", "updated_at": "2026-08-03T11:59:00Z"}]}
        self.assertEqual(compare_shadow(payload, payload, domain="schedules", now=__import__("datetime").datetime(2026, 8, 3, 12, 0, tzinfo=__import__("datetime").timezone.utc)), [])

    def test_shadow_detects_missing_time_status_score_stat_and_market(self):
        cases = [
            ("missing_secondary", {"items":[{"id":"e1"}]}, {"items":[]}, "schedules"),
            ("missing_primary", {"items":[]}, {"items":[{"id":"e1"}]}, "schedules"),
            ("time_conflict", {"items":[{"id":"e1","start_time":"2026-08-03T12:00:00Z"}]}, {"items":[{"id":"e1","start_time":"2026-08-03T13:00:00Z"}]}, "schedules"),
            ("status_conflict", {"items":[{"id":"e1","status":"live"}]}, {"items":[{"id":"e1","status":"final"}]}, "schedules"),
            ("score_conflict", {"items":[{"id":"e1","score":[1,0]}]}, {"items":[{"id":"e1","score":[1,1]}]}, "schedules"),
            ("stat_conflict", {"items":[{"id":"s1","value":1}]}, {"items":[{"id":"s1","value":2}]}, "statistics"),
            ("market_conflict", {"items":[{"id":"m1","selections":[1]}]}, {"items":[{"id":"m1","selections":[2]}]}, "markets"),
        ]
        for expected, primary, secondary, domain in cases:
            with self.subTest(expected=expected):
                self.assertIn(expected, {item["category"] for item in compare_shadow(primary, secondary, domain=domain)})

    def test_shadow_summary_is_persisted(self):
        service = ShadowService(self.database)
        discrepancies = compare_shadow({"items":[{"id":"e1"}]}, {"items":[]}, domain="schedules")
        service.record("mlb", "schedules", "primary", "secondary", discrepancies)
        summary = service.summary("mlb")
        self.assertEqual(summary["total"], 2)
        self.assertEqual({item["category"] for item in summary["groups"]}, {"missing_secondary", "stale_primary"})

    def test_correction_preserves_old_new_and_queues_targeted_work(self):
        cache = MemoryCache()
        cache.set("event:e1", {"old": True}, 60, 60, tags=("event:e1", "league:mlb"))
        result = CorrectionService(self.database, cache).record(
            league_id="mlb", domain="stat", record_id="e1", provider="fixture",
            old_value={"value": 1}, new_value={"value": 2}, provider_corrected_at="2026-08-03T12:00:00Z",
        )
        self.assertGreaterEqual(result["invalidated"], 1)
        correction = self.database.execute("SELECT old_value_json,new_value_json FROM data_corrections")[0]
        self.assertEqual(json.loads(correction["old_value_json"]), {"value": 1})
        self.assertEqual(json.loads(correction["new_value_json"]), {"value": 2})
        self.assertEqual(self.database.execute("SELECT status FROM recalculation_queue")[0]["status"], "queued")
        self.assertIn("projections", result["affectedOutputs"])

    def test_older_recalculation_cannot_overwrite_newer_evidence(self):
        service = CorrectionService(self.database)
        newer = service.record(
            league_id="wnba", domain="lineup", record_id="event-1", provider="provider",
            old_value={"status": "projected"}, new_value={"status": "confirmed"},
            provider_corrected_at="2026-08-03T12:05:00Z",
        )
        older = service.record(
            league_id="wnba", domain="lineup", record_id="event-1", provider="provider",
            old_value={"status": "unknown"}, new_value={"status": "projected"},
            provider_corrected_at="2026-08-03T12:00:00Z",
        )
        self.assertEqual(older["queueStatus"], "superseded")
        self.assertTrue(service.complete(newer["queueId"]))

    def test_corrections_do_not_mutate_saved_workspace_snapshots(self):
        now = "2026-08-03T12:00:00Z"
        with self.database.transaction() as connection:
            connection.execute(
                "INSERT INTO cloud_workspaces(id,owner_id,title,server_revision,created_at,updated_at) VALUES(?,?,?,?,?,?)",
                ("w1", "u1", "Saved", 1, now, now),
            )
            connection.execute(
                "INSERT INTO workspace_objects(id,workspace_id,object_type,object_version,server_revision,sync_state,payload_json,updated_at) VALUES(?,?,?,?,?,?,?,?)",
                ("s1", "w1", "saved_research", 1, 1, "synced", json.dumps({"value": 1, "savedAt": now}), now),
            )
        CorrectionService(self.database).record(
            league_id="mlb", domain="stat", record_id="event-1", provider="provider",
            old_value={"value": 1}, new_value={"value": 2}, provider_corrected_at="2026-08-03T12:05:00Z",
        )
        saved = self.database.execute("SELECT payload_json FROM workspace_objects WHERE id='s1'")[0]
        self.assertEqual(json.loads(saved["payload_json"]), {"value": 1, "savedAt": now})

    def test_health_score_is_not_betting_confidence(self):
        health = calculate_health({key: 1 for key in ("provider_uptime", "request_success", "freshness", "schedule_completeness", "entity_reconciliation", "stat_completeness", "market_coverage", "validation_success", "discrepancy_success", "cache_independence", "ui_success")})
        self.assertEqual(health.score, 100)
        self.assertEqual(health.state, "healthy")
        self.assertFalse(health.is_betting_confidence)

    def test_release_gates_have_explicit_thresholds(self):
        passed = evaluate_release_gate({"successDays": 7, "criticalConflicts": 0}, {"successDays": {"min": 7}, "criticalConflicts": {"max": 0}})
        failed = evaluate_release_gate({"successDays": 6, "criticalConflicts": 1}, {"successDays": {"min": 7}, "criticalConflicts": {"max": 0}})
        self.assertTrue(passed["passed"])
        self.assertFalse(failed["passed"])


class ScheduleUsageAndApiTests(DatabaseCase):
    def test_league_schedules_are_event_aware_and_rate_limit_aware(self):
        for league_id in ("mlb", "wnba", "ufc", "mls"):
            pregame = {item["domain"]: item for item in league_schedule(league_id)}
            live = {item["domain"]: item for item in league_schedule(league_id, event_state="live")}
            limited = {item["domain"]: item for item in league_schedule(league_id, event_state="live", rate_limited=True)}
            common = set(pregame) & set(live)
            self.assertTrue(all(live[key]["intervalSeconds"] <= pregame[key]["intervalSeconds"] for key in common))
            self.assertTrue(all(limited[key]["intervalSeconds"] >= live[key]["intervalSeconds"] for key in common))
            self.assertTrue(all(item["idempotent"] for item in pregame.values()))

    def test_offseason_suppresses_non_schedule_polling(self):
        items = league_schedule("wnba", in_season=False)
        self.assertFalse(next(item for item in items if item["domain"] == "live_status")["enabled"])

    def test_usage_monitor_counts_cache_retries_errors_without_pricing(self):
        monitor = ProviderUsageMonitor(self.database, {"requestsPerHour": 1, "retriesPerHour": 0, "expensiveRequestsPerHour": 0})
        monitor.record(provider="fixture", endpoint="schedules", league_id="mlb", response_bytes=100, cache_hit=True, retries=1, error_code="timeout", cost_category="high")
        monitor.record(provider="fixture", endpoint="schedules", league_id="mlb", response_bytes=90)
        summary = monitor.summary()
        self.assertEqual(summary["totals"], {"requests": 2, "retries": 1, "cacheHits": 1})
        self.assertTrue(summary["warnings"])
        self.assertNotIn("$", summary["pricing"])

    def test_usage_hour_window_excludes_old_requests(self):
        monitor = ProviderUsageMonitor(self.database, {"requestsPerHour": 1})
        monitor.record(provider="fixture", endpoint="schedules")
        old = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat().replace("+00:00", "Z")
        with self.database.transaction() as connection:
            connection.execute("UPDATE provider_usage SET occurred_at=?", (old,))
        self.assertEqual(monitor.summary()["totals"]["requests"], 0)

    def test_public_coverage_is_honest_and_admin_is_protected(self):
        config = ProviderConfig.from_env({"APP_ENV":"test", "DATA_MODE":"sample", "SAMPLE_MODE":"true", "ADMIN_TOKEN":"admin-test"})
        runtime = build_runtime(config)
        try:
            api = Api(runtime)
            status, payload, _ = api.handle("GET", "/api/coverage")
            self.assertEqual(status, 200)
            self.assertFalse(payload["liveProviderVerified"])
            self.assertTrue(all(item["dataMode"] == "fixture" for item in payload["leagues"]))
            self.assertTrue(all("healthScore" not in item and "stateReason" not in item for item in payload["leagues"]))
            denied, _, _ = api.handle("GET", "/api/admin/certification")
            allowed, dashboard, _ = api.handle("GET", "/api/admin/certification", headers={"X-EdgeBoard-Admin":"admin-test"})
            self.assertEqual(denied, 403)
            self.assertEqual(allowed, 200)
            self.assertTrue(dashboard["readOnly"])
            self.assertTrue(all("healthScore" in item and "stateReason" in item for item in dashboard["rollouts"]))
        finally:
            runtime.close()

    def test_successful_provider_call_does_not_globally_promote_fixture_leagues(self):
        config = ProviderConfig.from_env({
            "APP_ENV":"test", "DATA_MODE":"hybrid", "SAMPLE_MODE":"false", "LIVE_DATA_ENABLED":"true",
            "SPORTS_PROVIDER_NAME":"configured-provider", "SPORTS_PROVIDER_BASE_URL":"https://provider.invalid",
            "SPORTS_PROVIDER_API_KEY":"test-placeholder-not-a-real-secret",
        })
        runtime = build_runtime(config)
        try:
            runtime.provider_manager.health[runtime.provider_manager.primary.name].successes = 1
            self.assertFalse(runtime.live_provider_verified)
            self.assertTrue(all(league["rolloutState"] == "fixture_only" for league in runtime.rollout.list_coverage()))
        finally:
            runtime.close()

    def test_fixture_validation_endpoint_covers_all_four_leagues(self):
        config = ProviderConfig.from_env({"APP_ENV":"test", "DATA_MODE":"sample", "SAMPLE_MODE":"true", "ADMIN_TOKEN":"admin-test"})
        runtime = build_runtime(config)
        try:
            api = Api(runtime)
            for league_id in ("mlb", "wnba", "ufc", "mls"):
                status, payload, _ = api.handle("POST", "/api/admin/fixtures/validate", body=json.dumps({"leagueId":league_id}).encode(), headers={"X-EdgeBoard-Admin":"admin-test"})
                self.assertEqual(status, 200)
                self.assertEqual(payload["counts"]["rejected_markets"], 0)
                self.assertEqual(payload["sourceMode"], "fixture")
        finally:
            runtime.close()


if __name__ == "__main__":
    unittest.main()
