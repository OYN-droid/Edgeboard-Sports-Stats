from __future__ import annotations

import copy
import json
import unittest
from pathlib import Path

from server.config import ProviderConfig
from server.edge_trust import evaluate_edge_trust, public_component_status, trust_from_provenance
from server.errors import ProviderValidationError
from server.provider_adapter import ProviderAdapterBase
from server.provider_contracts import (
    DOMAIN_DESCRIPTIONS,
    LEGACY_DOMAIN_ALIASES,
    PROVIDER_DOMAINS,
    CapabilityDeclaration,
    CapabilityRegistry,
    ProvenanceEnvelope,
    canonical_domain,
    fixture_capability_registry,
    provenance_trust_inputs,
)
from server.providers import FixtureProvider, MockProvider, TemplateHttpProvider
from server.redaction import REDACTED, redact_text, redact_value


FIXTURE_PATH = Path(__file__).resolve().parents[1] / "server" / "fixtures" / "provider_contracts.json"


def capability(**overrides):
    values = {
        "provider_id": "poc-fixture", "sport_id": "basketball", "league_id": "wnba",
        "domain": "schedules", "support_state": "fixture_supported",
        "rollout_state": "fixture_only", "fixture_available": True,
    }
    values.update(overrides)
    return CapabilityDeclaration(**values)


class DomainVocabularyTests(unittest.TestCase):
    def test_every_canonical_domain_is_documented_and_unique(self):
        self.assertEqual(len(PROVIDER_DOMAINS), len(set(PROVIDER_DOMAINS)))
        self.assertEqual(set(PROVIDER_DOMAINS), set(DOMAIN_DESCRIPTIONS))
        self.assertGreaterEqual(len(PROVIDER_DOMAINS), 45)

    def test_legacy_domains_have_explicit_canonical_migrations(self):
        expected = {"live_status": "event_status", "combat_cards": "fight_cards",
                    "motorsport_sessions": "race_sessions", "lineups": "projected_lineups"}
        for legacy, canonical in expected.items():
            with self.subTest(legacy=legacy):
                self.assertEqual(canonical_domain(legacy), canonical)
                self.assertIn(legacy, LEGACY_DOMAIN_ALIASES)

    def test_unknown_domain_does_not_resolve(self):
        self.assertIsNone(canonical_domain("provider_magic_feed"))


class CapabilityRegistryTests(unittest.TestCase):
    def test_known_fixture_capability_never_implies_live(self):
        registry = fixture_capability_registry()
        declaration = registry.get("edgeboard-fixture", "sample", "schedules")
        self.assertIsNotNone(declaration)
        self.assertTrue(registry.supports("edgeboard-fixture", "sample", "schedules"))
        self.assertFalse(registry.permits_live_call("edgeboard-fixture", "sample", "schedules"))
        self.assertFalse(declaration.user_visible_live)

    def test_unknown_league_and_domain_fail_closed_with_diagnostic(self):
        registry = fixture_capability_registry()
        for league, domain in (("unknown", "schedules"), ("sample", "competition_catalog"), ("sample", "invalid")):
            with self.subTest(league=league, domain=domain):
                self.assertFalse(registry.permits_live_call("edgeboard-fixture", league, domain))
                diagnostic = registry.diagnostic("edgeboard-fixture", league, domain)
                self.assertFalse(diagnostic["declared"])
                self.assertIn("fails closed", diagnostic["reason"])

    def test_configured_and_shadow_are_not_user_visible_live(self):
        for state, rollout, permitted in (("configured", "internal_testing", False), ("shadow", "shadow", True)):
            item = capability(support_state=state, rollout_state=rollout, live_call_permission=True)
            with self.subTest(state=state):
                self.assertEqual(item.live_call_allowed, permitted)
                self.assertFalse(item.user_visible_live)

    def test_limited_live_is_domain_specific_and_explicit(self):
        item = capability(support_state="limited_live", rollout_state="limited_live",
                          live_call_permission=True, contract_confirmed=True)
        registry = CapabilityRegistry([item])
        self.assertTrue(registry.permits_live_call("poc-fixture", "wnba", "schedules"))
        self.assertTrue(item.user_visible_live)
        self.assertFalse(registry.permits_live_call("poc-fixture", "wnba", "odds"))

    def test_degraded_is_labeled_and_suspended_blocks(self):
        degraded = capability(support_state="degraded", rollout_state="degraded", live_call_permission=True)
        suspended = capability(domain="fight_cards", sport_id="mma", league_id="ufc",
                               support_state="suspended", rollout_state="suspended", live_call_permission=True)
        registry = CapabilityRegistry([degraded, suspended])
        self.assertEqual(registry.diagnostic("poc-fixture", "wnba", "schedules")["supportState"], "degraded")
        self.assertFalse(registry.permits_live_call("poc-fixture", "ufc", "fight_cards"))

    def test_invalid_state_and_duplicate_declaration_fail(self):
        with self.assertRaises(ValueError):
            capability(support_state="probably_supported")
        item = capability()
        with self.assertRaises(ValueError):
            CapabilityRegistry([item, item])

    def test_contract_fixture_contains_each_required_safety_state(self):
        payload = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
        states = {item["supportState"] for item in payload["capabilities"]}
        self.assertTrue({"unsupported", "configured", "shadow", "limited_live", "degraded", "suspended"} <= states)
        self.assertNotIn("apiKey", json.dumps(payload))


class EnvironmentBoundaryTests(unittest.TestCase):
    def test_sample_and_fixture_need_no_credentials(self):
        for mode, sample in (("sample", "true"), ("fixture", "false")):
            with self.subTest(mode=mode):
                config = ProviderConfig.from_env({"EDGEBOARD_ENV": "test", "EDGEBOARD_DATA_MODE": mode, "SAMPLE_MODE": sample})
                self.assertFalse(config.validate()[0])
                self.assertEqual(config.public_config()["fixtureMode"], mode == "fixture")

    def test_live_requires_key_base_url_and_explicit_identifier_when_new_name_is_used(self):
        base = {"EDGEBOARD_DATA_MODE": "live", "SAMPLE_MODE": "false", "LIVE_DATA_ENABLED": "true"}
        errors = ProviderConfig.from_env({**base, "SPORTS_PROVIDER_ID": ""}).validate()[0]
        self.assertTrue(any("SPORTS_PROVIDER_ID" in error for error in errors))
        self.assertTrue(any("BASE_URL" in error for error in errors))
        self.assertTrue(any("API_KEY" in error for error in errors))
        configured = ProviderConfig.from_env({**base, "SPORTS_PROVIDER_ID": "poc-fixture",
                                               "SPORTS_PROVIDER_BASE_URL": "https://provider.invalid",
                                               "SPORTS_PROVIDER_API_KEY": "fixture-secret"})
        self.assertFalse(configured.validate()[0])

    def test_invalid_mode_and_environment_fail_clearly(self):
        config = ProviderConfig.from_env({"EDGEBOARD_ENV": "space", "EDGEBOARD_DATA_MODE": "magic"})
        errors = config.validate()[0]
        self.assertEqual(len(errors), 2)
        self.assertEqual(config.data_mode, "magic")

    def test_optional_secondary_and_odds_providers_are_not_required(self):
        config = ProviderConfig.from_env({"EDGEBOARD_DATA_MODE": "sample", "SAMPLE_MODE": "true"})
        self.assertFalse(config.secondary_name)
        self.assertFalse(config.odds_name)
        self.assertFalse(config.validate()[0])

    def test_new_names_override_legacy_aliases(self):
        config = ProviderConfig.from_env({"EDGEBOARD_ENV": "test", "APP_ENV": "production",
                                          "EDGEBOARD_DATA_MODE": "fixture", "DATA_MODE": "offline",
                                          "SAMPLE_MODE": "false", "SPORTS_PROVIDER_ID": "canonical",
                                          "SPORTS_PROVIDER_NAME": "legacy"})
        self.assertEqual((config.app_env, config.data_mode, config.name), ("test", "fixture", "canonical"))

    def test_public_config_is_explicitly_allowlisted(self):
        config = ProviderConfig.from_env({"EDGEBOARD_DATA_MODE": "sample", "SAMPLE_MODE": "true",
                                          "SPORTS_PROVIDER_API_KEY": "fixture-secret",
                                          "SPORTS_PROVIDER_ACCOUNT_ID": "private-account",
                                          "DATABASE_URL": "postgresql://private/db", "CACHE_URL": "redis://private",
                                          "PROVIDER_DIAGNOSTICS_ENABLED": "true"})
        public = json.dumps(config.public_config(), sort_keys=True)
        for forbidden in ("fixture-secret", "private-account", "postgresql", "redis", "provider_diagnostics"):
            self.assertNotIn(forbidden, public)
        self.assertTrue(config.public_config()["sampleMode"])

    def test_template_adapter_never_calls_network_without_certified_capability(self):
        config = ProviderConfig.from_env({"EDGEBOARD_DATA_MODE": "live", "SAMPLE_MODE": "false",
                                          "LIVE_DATA_ENABLED": "true", "SPORTS_PROVIDER_ID": "poc-fixture",
                                          "SPORTS_PROVIDER_BASE_URL": "https://provider.invalid",
                                          "SPORTS_PROVIDER_API_KEY": "fixture-secret"})
        adapter = TemplateHttpProvider(config)
        with self.assertRaisesRegex(ProviderValidationError, "no certified adapter"):
            adapter.get_schedules()


class SecretRedactionTests(unittest.TestCase):
    def test_nested_values_urls_queries_and_bearer_are_redacted_without_mutation(self):
        original = {
            "safe": "WNBA schedules", "authorization": "Bearer abc.def",
            "nested": [{"apiKey": "abc123", "database_url": "postgresql://u:p@db/x"}],
            "url": "https://fixture.invalid/path?league=wnba&token=abc123",
        }
        before = copy.deepcopy(original)
        safe = redact_value(original)
        self.assertEqual(original, before)
        self.assertEqual(safe["authorization"], REDACTED)
        self.assertEqual(safe["nested"][0]["apiKey"], REDACTED)
        self.assertEqual(safe["nested"][0]["database_url"], REDACTED)
        self.assertIn("league=wnba", safe["url"])
        self.assertNotIn("abc123", json.dumps(safe))
        self.assertEqual(safe["safe"], "WNBA schedules")

    def test_text_redaction_covers_assignments_bearer_and_connection_urls(self):
        text = redact_text("api_key=abc Bearer def postgres://u:p@db/x cache_url=redis://private")
        self.assertNotIn("abc", text)
        self.assertNotIn("Bearer def", text)
        self.assertNotIn("u:p", text)
        self.assertNotIn("redis://private", text)

    def test_contract_secret_fixture_is_fully_sanitized(self):
        fixture = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))["secretError"]
        sanitized = json.dumps(redact_value(fixture))
        for secret in ("fixture-secret", "fixture-key", "user:pass", "fixture-token"):
            self.assertNotIn(secret, sanitized)


class ProvenanceAndTrustTests(unittest.TestCase):
    def test_complete_partial_stale_fallback_conflict_and_correction_metadata(self):
        cases = [
            ProvenanceEnvelope("edgeboard-fixture", "fixture", fetched_at="2026-08-04T12:00:00Z", completeness_state="complete"),
            ProvenanceEnvelope("edgeboard-fixture", "fixture", completeness_state="partial", validation_warnings=("missing optional field",)),
            ProvenanceEnvelope("poc-fixture", "cached", freshness_state="stale", completeness_state="partial",
                               fallback_used=True, fallback_provider_id="edgeboard-fixture"),
            ProvenanceEnvelope("poc-fixture", "live", provider_agreement_state="provider_conflict",
                               correction_status="corrected", completeness_state="partial"),
        ]
        self.assertEqual(cases[0].to_dict()["sourceMode"], "fixture")
        self.assertNotIn("providerUpdatedAt", cases[0].to_dict())
        self.assertEqual(provenance_trust_inputs(cases[2])["freshness"], "stale")
        self.assertEqual(provenance_trust_inputs(cases[3])["provider_agreement"], "provider_conflict")
        self.assertEqual(cases[3].to_dict()["correctionStatus"], "corrected")
        trust = trust_from_provenance(cases[3])
        self.assertTrue(trust["conflicts"])
        self.assertFalse(trust["researchQuality"]["isProbability"])

    def test_invalid_source_timestamp_confidence_and_fallback_fail(self):
        constructors = (
            lambda: ProvenanceEnvelope("fixture", "magic"),
            lambda: ProvenanceEnvelope("fixture", "fixture", fetched_at="yesterday"),
            lambda: ProvenanceEnvelope("fixture", "fixture", identity_confidence=1.2),
            lambda: ProvenanceEnvelope("fixture", "cached", fallback_used=True),
        )
        for constructor in constructors:
            with self.subTest(constructor=constructor):
                with self.assertRaises(ValueError): constructor()

    def test_edge_trust_states_remain_distinct_and_quality_is_not_probability(self):
        states = ("fixture", "certified_live", "limited_live", "degraded", "cached_stale",
                  "provider_conflict", "unavailable", "sample")
        labels = {state: public_component_status(state, 0.5) for state in states}
        self.assertEqual(len(set(labels.values())), len(states))
        result = evaluate_edge_trust({"coverage": "fixture"}, applicable={"coverage"}, sample=True)
        quality = result["researchQuality"]
        self.assertFalse(quality["isBettingConfidence"])
        self.assertFalse(quality["isModelConfidence"])
        self.assertFalse(quality["isProbability"])


class AdapterContractTests(unittest.TestCase):
    def test_fixture_and_mock_conform_without_public_secrets(self):
        for adapter in (FixtureProvider(), MockProvider()):
            with self.subTest(adapter=adapter.provider_id):
                self.assertTrue(adapter.provider_id)
                self.assertTrue(adapter.provider_name)
                self.assertTrue(adapter.get_capabilities())
                metadata = json.dumps(adapter.attribution_metadata())
                self.assertNotIn("api", metadata.casefold())

    def test_unsupported_domains_fail_explicitly(self):
        for adapter in (FixtureProvider(), MockProvider(), ProviderAdapterBase()):
            with self.subTest(adapter=adapter.provider_id):
                with self.assertRaises(ProviderValidationError):
                    adapter.fetch("provider_magic_feed")

    def test_provider_errors_normalize_safely(self):
        payload = MockProvider().normalize_error(RuntimeError("token=fixture-secret"))
        self.assertNotIn("fixture-secret", json.dumps(payload))
        self.assertEqual(payload["code"], "provider_error")


if __name__ == "__main__":
    unittest.main()
