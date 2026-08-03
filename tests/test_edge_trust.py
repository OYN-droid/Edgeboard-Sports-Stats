from __future__ import annotations

import unittest

from server.api import Api
from server.config import ProviderConfig
from server.database import Database
from server.edge_trust import EdgeTrustService, evaluate_edge_trust, trust_from_coverage
from server.rollout import RolloutService
from server.runtime import build_runtime


class EdgeTrustEvaluationTests(unittest.TestCase):
    def test_applicability_does_not_penalize_irrelevant_domains(self):
        trust = evaluate_edge_trust(
            {"historical_data": "verified", "freshness": "fresh", "coverage": 1, "identity": "verified", "lineups": "unavailable"},
            applicable={"historical_data", "freshness", "coverage", "identity"},
        )
        self.assertEqual(trust["researchQuality"]["score"], 100)
        self.assertFalse(any(item["id"] == "lineups" for item in trust["details"]))

    def test_sample_evidence_cannot_look_certified_live(self):
        trust = evaluate_edge_trust({"historical_data": "verified", "freshness": "fresh", "coverage": 1, "identity": "verified"}, sample=True)
        self.assertLessEqual(trust["researchQuality"]["score"], 69)
        self.assertEqual(trust["researchQuality"]["label"], "Limited")
        self.assertFalse(trust["researchQuality"]["isBettingConfidence"])
        self.assertFalse(trust["researchQuality"]["isProbability"])

    def test_provider_conflict_reduces_quality_and_is_not_silently_resolved(self):
        baseline = evaluate_edge_trust({"historical_data": "verified", "provider_agreement": "verified", "freshness": "fresh", "coverage": 1, "identity": "verified"})
        conflict = evaluate_edge_trust(
            {"historical_data": "verified", "provider_agreement": "verified", "freshness": "fresh", "coverage": 1, "identity": "verified"},
            conflicts=[{"category": "status_conflict", "recordId": "player-1", "sources": [{"provider": "A", "status": "Questionable"}, {"provider": "B", "status": "Out"}]}],
        )
        self.assertLess(conflict["researchQuality"]["score"], baseline["researchQuality"]["score"])
        self.assertEqual(len(conflict["conflicts"]), 1)
        self.assertIn("Await official confirmation", conflict["conflicts"][0]["recommendation"])

    def test_history_is_persisted(self):
        database = Database()
        database.migrate()
        rollout = RolloutService(database)
        service = EdgeTrustService(database)
        service.evaluate_league(rollout.get("wnba"), trigger="test", record=True)
        history = service.history("wnba")
        self.assertEqual(history[0]["trigger"], "test")
        self.assertEqual(history[0]["label"], "Limited")
        database.close()


class EdgeTrustApiTests(unittest.TestCase):
    def test_public_coverage_and_research_expose_quality_without_internal_weights(self):
        runtime = build_runtime(ProviderConfig.from_env({"APP_ENV": "test", "DATA_MODE": "sample", "SAMPLE_MODE": "true", "ADMIN_TOKEN": "admin-test"}))
        try:
            api = Api(runtime)
            status, coverage, _ = api.handle("GET", "/api/coverage")
            self.assertEqual(status, 200)
            self.assertTrue(all("edgeTrust" in league for league in coverage["leagues"]))
            self.assertTrue(all("internal" not in league["edgeTrust"] for league in coverage["leagues"]))
            status, research, _ = api.handle("POST", "/api/research", body=b'{"structuredQuery":{"intent":"event_search"}}')
            self.assertEqual(status, 200)
            self.assertIn("edgeTrust", research)
            denied, _, _ = api.handle("GET", "/api/admin/diagnostics")
            allowed, diagnostics, _ = api.handle("GET", "/api/admin/diagnostics", headers={"X-EdgeBoard-Admin": "admin-test"})
            self.assertEqual(denied, 403)
            self.assertEqual(allowed, 200)
            self.assertTrue(diagnostics["researchQualityHistory"])
            self.assertTrue(all("internal" in item for item in diagnostics["edgeTrust"]))
        finally:
            runtime.close()

    def test_public_shadow_conflicts_retain_both_attributed_values(self):
        runtime = build_runtime(ProviderConfig.from_env({"APP_ENV": "test", "DATA_MODE": "sample", "SAMPLE_MODE": "true"}))
        try:
            runtime.shadow.record("wnba", "events", "Provider A", "Provider B", [{
                "category": "status_conflict", "recordId": "event-1",
                "details": {"primary": "scheduled", "secondary": "postponed"},
            }])
            status, coverage, _ = Api(runtime).handle("GET", "/api/coverage")
            trust = next(item for item in coverage["leagues"] if item["leagueId"] == "wnba")["edgeTrust"]
            self.assertEqual(status, 200)
            self.assertEqual(trust["conflicts"][0]["sources"], [
                {"provider": "Provider A", "value": "scheduled"},
                {"provider": "Provider B", "value": "postponed"},
            ])
            self.assertIn("Await official confirmation", trust["conflicts"][0]["recommendation"])
        finally:
            runtime.close()


if __name__ == "__main__":
    unittest.main()
