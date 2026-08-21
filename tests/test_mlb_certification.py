from __future__ import annotations

import copy
import json
import unittest

from server.api import Api
from server.config import ProviderConfig
from server.errors import ValidationError
from server.mlb_certification import CERTIFICATION_VERSION, CRITERIA, MlbCertificationService
from server.runtime import build_runtime


def config(**overrides):
    values = {
        "EDGEBOARD_ENV": "test", "EDGEBOARD_DATA_MODE": "sample", "SAMPLE_MODE": "true",
        "DATABASE_URL": "sqlite:///:memory:", "SPORTS_PROVIDER_ID": "sportsdataio",
        "SPORTS_PROVIDER_API_KEY": "test-only-not-a-real-key",
    }
    values.update({key: str(value) for key, value in overrides.items()})
    return ProviderConfig.from_env(values)


class MlbCertificationTests(unittest.TestCase):
    def setUp(self):
        self.runtime = build_runtime(config())
        self.service = self.runtime.mlb_certification

    def tearDown(self): self.runtime.close()

    def _force_state(self, domain, state):
        with self.runtime.database.transaction() as connection:
            connection.execute("UPDATE mlb_domain_certification SET state=? WHERE domain=?", (state, domain))

    def test_matrix_is_valid_versioned_and_domain_specific(self):
        report = self.service.report(public=False)
        self.assertEqual(CERTIFICATION_VERSION, report["certificationVersion"])
        self.assertEqual(41, len(report["domains"]))
        self.assertEqual(41, report["stateCounts"]["fixture_supported"])
        self.assertFalse(report["automaticPromotion"]); self.assertFalse(report["ownerActivationReady"])
        for item in report["domains"]:
            MlbCertificationService.validate_definition(item)
            self.assertEqual(set(CRITERIA), {criterion["id"] for criterion in item["criteria"]})
            self.assertTrue(item["knownLimitations"])

    def test_unknown_domain_invalid_state_version_and_missing_criterion_fail_closed(self):
        with self.assertRaises(ValidationError): self.service.domain("not-real")
        valid = self.service.domain("schedules")
        for mutation in (
            lambda item: item.update(state="not-real"),
            lambda item: item.update(certificationVersion="bad"),
            lambda item: item.update(criteria=item["criteria"][:-1]),
        ):
            candidate = copy.deepcopy(valid); mutation(candidate)
            with self.assertRaises(ValidationError): MlbCertificationService.validate_definition(candidate)

    def test_every_domain_has_explicit_pass_fail_or_blocked_criteria(self):
        accepted = {"passed", "failed", "blocked", "manual_review", "not_applicable"}
        for domain in self.service.report(public=False)["domains"]:
            self.assertTrue(all(item["status"] in accepted for item in domain["criteria"]))
            self.assertFalse(domain["promotion"]["eligibleForLimitedLive"])

    def test_promotion_requires_confirmation_and_complete_evidence(self):
        with self.assertRaises(ValidationError):
            self.service.set_state("schedules", "shadow", actor="owner", reason="review", confirmation="wrong")
        shadow = self.service.set_state("schedules", "shadow", actor="owner", reason="begin internal comparison", confirmation="SET MLB SCHEDULES SHADOW")
        self.assertEqual("shadow", shadow["state"])
        with self.assertRaises(ValidationError):
            self.service.set_state("schedules", "limited_live", actor="owner", reason="try", confirmation="SET MLB SCHEDULES LIMITED_LIVE")

    def test_state_change_is_audited_and_never_automatic(self):
        self.service.set_state("teams", "shadow", actor="reviewer", reason="manual shadow approval", confirmation="SET MLB TEAMS SHADOW")
        rows = self.runtime.database.execute("SELECT * FROM audit_log WHERE action='mlb_domain_certification_changed'")
        self.assertEqual(1, len(rows)); self.assertEqual("teams", rows[0]["target_id"])
        self.assertFalse(self.service.report()["automaticPromotion"])

    def test_certified_to_limited_to_shadow_to_fixture_rollback_is_explicit(self):
        self._force_state("schedules", "certified_live")
        limited = self.service.set_state("schedules", "limited_live", actor="ops", reason="health warning", confirmation="SET MLB SCHEDULES LIMITED_LIVE")
        self.assertEqual("limited_live", limited["configuredState"])
        shadow = self.service.set_state("schedules", "shadow", actor="ops", reason="provider outage", confirmation="SET MLB SCHEDULES SHADOW")
        self.assertEqual("shadow", shadow["configuredState"])
        fixture = self.service.set_state("schedules", "fixture_supported", actor="ops", reason="safe fallback", confirmation="SET MLB SCHEDULES FIXTURE_SUPPORTED")
        self.assertEqual("fixture_supported", fixture["configuredState"])
        with self.assertRaises(ValidationError):
            self.service.set_state("schedules", "certified_live", actor="ops", reason="unsafe jump", confirmation="SET MLB SCHEDULES CERTIFIED_LIVE")

    def test_live_to_stale_cache_to_fixture_to_unavailable_is_labeled(self):
        self._force_state("schedules", "limited_live")
        self.service.evaluate_health("schedules", {"configured": True, "requests": 100, "failures": 0, "latencyMs": 100})
        live = self.service.select_source("schedules", live={"source": "live"}, stale_cache={"source": "cache"}, fixture={"source": "fixture"})
        self.assertEqual("live", live.source_mode); self.assertFalse(live.fallback_used)
        self.service.evaluate_health("schedules", {"configured": True, "requests": 10, "failures": 4})
        stale = self.service.select_source("schedules", stale_cache={"source": "cache"}, fixture={"source": "fixture"})
        self.assertEqual("cached_stale", stale.source_mode); self.assertEqual("Delayed", stale.label)
        fixture = self.service.select_source("schedules", fixture={"source": "fixture"})
        self.assertEqual("fixture", fixture.source_mode); self.assertEqual("Fixture", fixture.label)
        missing = self.service.select_source("schedules", supports_fixture=False)
        self.assertEqual("unavailable", missing.source_mode); self.assertIsNone(missing.value)
        self.assertFalse(any(item.mixed_sources for item in (live, stale, fixture, missing)))

    def test_unsupported_domain_has_no_fake_fallback(self):
        result = self.service.select_source("schedules", fixture={"sample": True}, supports_fixture=False)
        self.assertEqual("unsupported", result.state); self.assertIsNone(result.value)

    def test_domain_health_isolated_and_recovers(self):
        self._force_state("player_props", "limited_live"); self._force_state("schedules", "limited_live")
        self.service.evaluate_health("player_props", {"configured": True, "requests": 10, "failures": 3})
        self.service.evaluate_health("schedules", {"configured": True, "requests": 100, "latencyMs": 100})
        self.assertEqual("degraded", self.service.domain("player_props")["state"])
        self.assertEqual("limited_live", self.service.domain("schedules")["state"])
        self.service.evaluate_health("player_props", {"configured": True, "requests": 100, "failures": 0, "latencyMs": 100})
        self.assertEqual("limited_live", self.service.domain("player_props")["state"])

    def test_health_states_cover_timeout_rate_limit_validation_auth_partial_and_full_outage(self):
        cases = (
            ({"configured": True, "requests": 100, "latencyMs": 100}, "healthy"),
            ({"configured": True, "requests": 20, "timeouts": 2, "latencyMs": 2000}, "impaired"),
            ({"configured": True, "requests": 10, "rateLimits": 3}, "degraded"),
            ({"configured": True, "requests": 10, "validationRejected": 5}, "unavailable"),
            ({"configured": True, "authFailure": True}, "unavailable"),
            ({"configured": False}, "misconfigured"),
            ({"configured": True, "requests": 0}, "unavailable"),
        )
        for metrics, expected in cases:
            self.assertEqual(expected, self.service.evaluate_health("injuries", metrics)["state"])
        self.assertEqual("fixture_supported", self.service.domain("schedules")["state"])
        alerts = self.service.evaluate_health("injuries", {"configured": True, "requests": 10,
            "failures": 3, "rateLimits": 2, "mappingFailures": 5,
            "pollingBudgetRemaining": 1, "corrections": 10, "shadowDiscrepancies": 25})["internalAlerts"]
        self.assertTrue({"provider_failure_rate", "rate_limit_pressure", "mapping_failures",
            "polling_budget", "correction_spike", "shadow_discrepancy_spike"}.issubset(alerts))

    def test_provider_league_domain_market_and_live_kill_switches_are_independent(self):
        controls = (("domain", "player_props", "player_props"), ("market_data", "mlb", "moneyline"), ("live_event", "mlb", "live_score"))
        for control, domain_arg, affected in controls:
            domain_id = domain_arg if control == "domain" else ""
            self.service.set_control(control, False, actor="ops", reason="failure injection", domain_id=domain_id)
            self.assertEqual("suspended", self.service.domain(affected)["state"])
            self.assertEqual("fixture_supported", self.service.domain("schedules")["state"])
            self.service.set_control(control, True, actor="ops", reason="recovery", domain_id=domain_id)
        self.service.set_control("league", False, actor="ops", reason="league incident")
        self.assertEqual("suspended", self.service.domain("schedules")["state"])
        self.service.set_control("league", True, actor="ops", reason="league recovered")
        self.assertEqual("fixture_supported", self.service.domain("schedules")["state"])

    def test_polling_control_is_distinct_from_live_event_state(self):
        before = self.service.controls("live_score")
        self.assertFalse(before["pollingEnabled"])
        updated = self.service.set_control("polling", True, actor="ops", reason="bounded test")
        self.assertTrue(updated["pollingEnabled"])
        self.assertEqual("fixture_supported", self.service.domain("live_score")["state"])

    def test_edge_trust_and_intelligence_wording_are_certification_aware(self):
        fixture = self.service.explain("projected_lineups")
        self.assertIn("fixture", fixture["answer"].lower()); self.assertFalse(fixture["isBettingConfidence"])
        self._force_state("projected_lineups", "limited_live")
        self.service.evaluate_health("projected_lineups", {"configured": True, "requests": 100})
        self.assertIn("coverage is limited", self.service.explain("projected_lineups")["answer"])
        self.service.evaluate_health("projected_lineups", {"configured": True, "requests": 10, "failures": 3})
        self.assertIn("degraded", self.service.explain("projected_lineups")["answer"])
        self.service.set_control("domain", False, actor="ops", reason="outage", domain_id="projected_lineups")
        self.assertIn("don’t have verified live", self.service.explain("projected_lineups")["answer"])

    def test_public_report_hides_criteria_controls_and_internal_status_names(self):
        report = self.service.report(public=True)
        serialized = json.dumps(report)
        self.assertNotIn('"criteria"', serialized); self.assertNotIn('"controls"', serialized)
        self.assertTrue(all(item["publicLabel"] in {"Certified Live", "Limited Live", "Degraded", "Unavailable", "Fixture"} for item in report["domains"]))

    def test_coverage_api_has_fine_grained_mlb_matrix_and_last_certification(self):
        status, payload, _ = Api(self.runtime).handle("GET", "/api/coverage")
        self.assertEqual(200, status)
        mlb = next(item for item in payload["leagues"] if item["leagueId"] == "mlb")
        self.assertEqual(41, len(mlb["certificationDomains"])); self.assertIn("lastCertification", mlb)
        self.assertFalse(payload["liveProviderVerified"])

    def test_admin_report_and_mutations_are_protected(self):
        api = Api(self.runtime)
        self.assertEqual(403, api.handle("GET", "/api/admin/mlb/certification/status")[0])
        self.assertEqual(403, api.handle("POST", "/api/admin/mlb/certification/control", body=b"{}")[0])

    def test_database_migration_is_repeatable_and_persists_controls(self):
        self.assertEqual(7, self.runtime.database.migrate())
        self.assertEqual(7, self.runtime.database.migrate())
        self.service.set_control("domain", False, actor="ops", reason="retain", domain_id="weather")
        self.assertFalse(self.service.controls("weather")["domainEnabled"])

    def test_technical_success_does_not_clear_licensing_infrastructure_or_quota_gates(self):
        report = self.service.report(public=False)
        blockers = " ".join(report["productionBlockers"]).lower()
        self.assertIn("quota", blockers); self.assertIn("rights", blockers); self.assertIn("database", blockers)
        schedule = self.service.domain("schedules")
        self.assertIn("retention_licensing", schedule["promotion"]["blockers"])
        self.assertIn("production_monitoring", schedule["promotion"]["blockers"])
        self.assertFalse(report["ownerActivationReady"])

    def test_shadow_counts_are_not_mislabeled_as_rates(self):
        report = self.service.report(public=False)
        self.assertFalse(report["shadowEvidence"]["ratesAvailable"])
        self.assertIn("denominator", report["shadowEvidence"]["notice"])


if __name__ == "__main__": unittest.main()
