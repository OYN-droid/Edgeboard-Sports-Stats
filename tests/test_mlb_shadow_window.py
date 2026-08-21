from __future__ import annotations

import json
import unittest

from server.api import Api
from server.config import ProviderConfig
from server.errors import ShadowBudgetExhaustedError, ValidationError
from server.mlb_shadow_window import (
    DISCREPANCY_TYPES, ENTITLEMENT_STATES, RECOMMENDATIONS,
    classify_discrepancy, classify_entitlement, safe_rate,
)
from server.runtime import build_runtime


def config(**overrides):
    values = {
        "EDGEBOARD_ENV": "test", "EDGEBOARD_DATA_MODE": "sample", "SAMPLE_MODE": "true",
        "DATABASE_URL": "sqlite:///:memory:", "SPORTS_PROVIDER_ID": "sportsdataio",
        "SPORTS_PROVIDER_API_KEY": "test-only-not-a-real-key", "SPORTS_PROVIDER_POC_ENABLED": "true",
        "MLB_ROLLOUT_STATE": "shadow", "EDGEBOARD_ADMIN_TOKEN": "admin-test",
    }
    values.update({key: str(value) for key, value in overrides.items()})
    return ProviderConfig.from_env(values)


def report(*, endpoints=None, accepted=12, rejected=1, discrepancies=2, unresolved=1, stale=0):
    return {
        "provider": "sportsdataio", "exposedAsPrimary": False,
        "primarySource": "edgeboard-fixture",
        "endpoints": endpoints or [{"domain": "schedules", "operation": "GamesByDate", "status": "authenticated_available", "recordCount": accepted}],
        "normalization": {"accepted": accepted, "rejected": rejected, "stale": stale},
        "canonicalIds": {
            "valid": not unresolved, "count": accepted, "unresolvedMappingCount": unresolved,
            "unresolvedMappings": ([{"entityType": "player", "providerId": "safe-provider-player-7", "candidates": ["mlb-player-a", "mlb-player-b"]}] if unresolved else []),
        },
        "discrepancies": {"total": discrepancies, "comparisonCount": accepted, "categories": {"status_conflict": discrepancies}},
        "cache": {"state": "miss", "coalescedRequests": 1},
        "edgeTrust": {"status": "partial", "researchQuality": 72},
        "limitations": ["Shadow-only test evidence."],
    }


class MlbShadowWindowTests(unittest.TestCase):
    def setUp(self):
        self.runtime = build_runtime(config())
        self.service = self.runtime.mlb_shadow_window

    def tearDown(self): self.runtime.close()

    def start(self, **overrides):
        values = {
            "confirmation": "START BOUNDED MLB SHADOW WINDOW", "actor": "tester",
            "request_budget": 10, "duration_minutes": 15, "date_start": "2026-08-08",
            "domains": ["schedules", "teams", "venues", "players", "event_identity", "event_status"],
        }
        values.update(overrides)
        return self.service.start(**values)

    def test_window_requires_explicit_bounded_authorization_and_credential(self):
        with self.assertRaises(ValidationError): self.start(confirmation="wrong")
        with self.assertRaises(ValidationError): self.service.start(
            confirmation="START BOUNDED MLB SHADOW WINDOW", actor="tester", request_budget=5,
        )
        bad = build_runtime(config(SPORTS_PROVIDER_API_KEY="", SPORTS_PROVIDER_POC_ENABLED="false", MLB_ROLLOUT_STATE="fixture_only"))
        try:
            with self.assertRaises(ValidationError): bad.mlb_shadow_window.start(
                confirmation="START BOUNDED MLB SHADOW WINDOW", actor="tester",
                request_budget=5, duration_minutes=1,
            )
        finally: bad.close()

    def test_fixed_duration_date_event_set_manual_stop_and_single_active_window(self):
        window = self.start(event_ids=["mlb-game-safe"], date_end="2026-08-09")
        self.assertEqual("active", window["status"]); self.assertEqual(["mlb-game-safe"], window["eventIds"])
        with self.assertRaises(ValidationError): self.start()
        stopped = self.service.stop(window["id"], confirmation="STOP MLB SHADOW WINDOW", reason="bounded test complete", actor="tester")
        self.assertEqual("stopped", stopped["status"]); self.assertFalse(stopped["shadowExposedAsPrimary"])

    def test_duration_expires_automatically(self):
        window = self.start()
        with self.runtime.database.transaction() as connection:
            connection.execute("UPDATE mlb_shadow_windows SET ends_at='2000-01-01T00:00:00Z' WHERE id=?", (window["id"],))
        self.assertEqual("expired", self.service.status(window["id"])["status"])

    def test_global_domain_and_endpoint_budgets_stop_new_calls(self):
        window = self.start(request_budget=1)
        token = self.service.before_request("GamesByDate/2026-AUG-08", 0)
        self.service.after_request(token, 0, "success", "", 12)
        with self.assertRaises(ShadowBudgetExhaustedError): self.service.before_request("GamesByDate/2026-AUG-09", 0)
        self.assertEqual("budget_exhausted", self.service.status(window["id"])["status"])

        second = self.start(request_budget=5, domain_budgets={"schedules": 1}, endpoint_budgets={"GamesByDate": 1})
        token = self.service.before_request("GamesByDate/2026-AUG-08", 0); self.service.after_request(token, 0, "success", "", 5)
        with self.assertRaises(ShadowBudgetExhaustedError): self.service.before_request("GamesByDate/2026-AUG-09", 0)
        self.assertEqual(1, self.service.status(second["id"])["requestBudget"]["used"])

    def test_retry_is_counted_and_cache_or_coalescing_does_not_create_requests(self):
        window = self.start()
        first = self.service.before_request("GamesByDate/2026-AUG-08", 0); self.service.after_request(first, 0, "error", "provider_timeout", 30)
        retry = self.service.before_request("GamesByDate/2026-AUG-08", 1); self.service.after_request(retry, 1, "success", "", 10)
        self.assertEqual(2, self.service.status(window["id"])["requestBudget"]["used"])
        self.service.record_group_report(window["id"], "schedule_entities", report())
        evidence = self.service.report(window["id"])["domainEvidence"][0]
        self.assertEqual(1, evidence["requestMetrics"]["retries"])
        self.assertEqual(1, evidence["cacheMetrics"]["coalescedRequestCount"])

    def test_entitlement_discovery_uses_observation_not_documentation(self):
        cases = {
            "entitled_and_working": [{"status": "authenticated_available"}],
            "entitled_but_empty": [{"status": "authenticated_empty"}],
            "entitlement_denied": [{"status": "forbidden_by_entitlement"}],
            "unsupported_by_plan": [{"status": "unsupported_by_plan"}],
            "endpoint_unavailable": [{"status": "invalid_endpoint"}],
            "provider_error": [{"status": "provider_error"}],
            "not_tested": [],
        }
        for expected, endpoints in cases.items(): self.assertEqual(expected, classify_entitlement(endpoints))
        self.assertEqual(ENTITLEMENT_STATES, set(cases) | {"configuration_error"})

    def test_rates_are_measured_only_with_meaningful_denominators(self):
        self.assertEqual("insufficient_sample", safe_rate(0, 0)["status"])
        self.assertEqual("insufficient_sample", safe_rate(1, 4)["status"])
        self.assertEqual(0.2, safe_rate(2, 10)["value"])

    def test_domain_evidence_measures_validation_mapping_discrepancy_and_freshness(self):
        window = self.start(); self.service.record_group_report(window["id"], "schedule_entities", report())
        output = self.service.report(window["id"])
        schedule = next(item for item in output["domainEvidence"] if item["domain"] == "schedules")
        self.assertEqual("entitled_and_working", schedule["entitlement"])
        self.assertEqual(12, schedule["validationMetrics"]["acceptedRecordCount"])
        self.assertEqual("measured", schedule["validationMetrics"]["validationRejectionRate"]["status"])
        self.assertEqual("insufficient_sample", schedule["mappingMetrics"]["mappingSuccessRate"]["status"])
        player = next(item for item in output["domainEvidence"] if item["domain"] == "players")
        self.assertEqual("measured", player["mappingMetrics"]["mappingSuccessRate"]["status"])
        self.assertEqual("measured", schedule["shadowMetrics"]["discrepancyRate"]["status"])
        self.assertEqual("measured", schedule["freshnessMetrics"]["freshRecordRate"]["status"])

    def test_insufficient_samples_are_honest_and_recommendations_are_closed(self):
        window = self.start(); self.service.record_group_report(window["id"], "schedule_entities", report(accepted=2, rejected=0, discrepancies=0, unresolved=0))
        evidence = next(item for item in self.service.report(window["id"])["domainEvidence"] if item["domain"] == "schedules")
        self.assertEqual("insufficient_sample", evidence["recommendation"])
        self.assertIn(evidence["recommendation"], RECOMMENDATIONS)

    def test_denied_entitlement_blocks_domain_without_rollout_change(self):
        window = self.start()
        denied = report(endpoints=[{"domain": "schedules", "status": "forbidden_by_entitlement", "reasonCode": "provider_entitlement_denied"}], accepted=0)
        self.service.record_group_report(window["id"], "schedule_entities", denied)
        evidence = next(item for item in self.service.report(window["id"])["domainEvidence"] if item["domain"] == "schedules")
        self.assertEqual("blocked_entitlement", evidence["recommendation"])
        self.assertEqual("fixture_supported", self.runtime.mlb_certification.domain("schedules")["configuredState"])

    def test_discrepancy_classification_and_manual_review_suppress_expected_gaps(self):
        self.assertTrue(set(classify_discrepancy(value) for value in ("status_conflict", "time_conflict", "missing_primary")).issubset(DISCREPANCY_TYPES))
        window = self.start()
        candidate = report(); candidate["discrepancies"] = {"total": 2, "comparisonCount": 10, "categories": {"status_conflict": 1, "outside_fixture_coverage": 1}}
        self.service.record_group_report(window["id"], "schedule_entities", candidate)
        reviews = self.service.reviews(window["id"])
        self.assertEqual(1, len(reviews)); self.assertEqual("status_conflict", reviews[0]["discrepancyType"])
        resolved = self.service.update_review(reviews[0]["id"], status="provider_issue")
        self.assertEqual("provider_issue", resolved["status"])

    def test_ambiguous_mapping_never_auto_resolves_and_explicit_correction_is_auditable(self):
        window = self.start(); self.service.record_group_report(window["id"], "schedule_entities", report())
        mapping = self.service.mappings(window["id"])[0]
        self.assertEqual("ambiguous", mapping["resolutionState"]); self.assertIsNone(mapping["canonicalId"])
        with self.assertRaises(ValidationError): self.service.correct_mapping(mapping["id"], canonical_id="mlb-player-a", actor="reviewer", reason="verified", confirmation="wrong")
        corrected = self.service.correct_mapping(mapping["id"], canonical_id="mlb-player-a", actor="reviewer", reason="verified source identity", confirmation="APPLY EXPLICIT MLB MAPPING")
        self.assertEqual("resolved", corrected["resolutionState"])

    def test_simulated_failures_are_separate_from_observed_provider_metrics(self):
        window = self.start(); self.service.record_simulated_failure(window["id"], domain="schedules", error_code="provider_timeout")
        output = self.service.report(window["id"])
        self.assertEqual(1, output["simulatedFailureMetrics"]["count"])
        self.assertEqual(0, output["requestMetrics"]["totalProviderRequests"])

    def test_live_and_market_empty_samples_remain_insufficient(self):
        window = self.start(domains=["live_event_status", "moneyline", "player_props"])
        self.service.record_group_report(window["id"], "live_state", report(accepted=0, rejected=0, discrepancies=0, unresolved=0))
        self.service.record_group_report(window["id"], "markets", report(accepted=0, rejected=0, discrepancies=0, unresolved=0))
        output = self.service.report(window["id"])
        self.assertTrue(all(item["recommendation"] == "insufficient_sample" for item in output["domainEvidence"]))

    def test_completed_evidence_is_consumed_by_ticket10_without_promotion(self):
        window = self.start(); self.service.record_group_report(window["id"], "schedule_entities", report())
        self.service.stop(window["id"], confirmation="STOP MLB SHADOW WINDOW", reason="complete", actor="tester")
        domain = self.runtime.mlb_certification.domain("schedules")
        criteria = {item["id"]: item for item in domain["criteria"]}
        self.assertEqual("passed", criteria["provider_entitlement"]["status"])
        self.assertEqual("fixture_supported", domain["configuredState"])
        self.assertTrue(domain["promotion"]["requiresExplicitOwnerAction"])
        self.assertFalse(domain["promotion"]["eligibleForLimitedLive"])

    def test_report_preserves_independent_owner_licensing_infrastructure_and_quota_gates(self):
        window = self.start(); output = self.service.report(window["id"])
        self.assertEqual({"ownerApproval": "required", "licensing": "blocked", "infrastructure": "blocked", "quota": "unconfirmed"}, output["productionGates"])
        self.assertFalse(output["automaticPromotion"]); self.assertEqual("fixture", output["publicSource"])

    def test_admin_endpoints_are_protected_and_public_config_is_unchanged(self):
        api = Api(self.runtime)
        self.assertEqual(403, api.handle("GET", "/api/admin/mlb/shadow-window/status")[0])
        self.assertEqual(403, api.handle("POST", "/api/admin/mlb/shadow-window/start", body=b"{}")[0])
        public = api.handle("GET", "/api/config/public")[1]
        serialized = json.dumps(public)
        self.assertNotIn("test-only-not-a-real-key", serialized); self.assertNotIn("apiKey", serialized)

    def test_schema_migration_is_repeatable_and_safe_report_contains_no_credential_or_url(self):
        self.assertEqual(7, self.runtime.database.migrate()); self.assertEqual(7, self.runtime.database.migrate())
        window = self.start(); serialized = json.dumps(self.service.report(window["id"]))
        self.assertNotIn("test-only-not-a-real-key", serialized); self.assertNotIn("api.sportsdata.io", serialized)


if __name__ == "__main__": unittest.main()
