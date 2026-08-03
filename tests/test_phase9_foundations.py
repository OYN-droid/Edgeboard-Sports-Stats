from __future__ import annotations

import io
import http.client
import json
import threading
import time
import unittest
import urllib.error
from http.server import ThreadingHTTPServer
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from server.api import Api
from server.app import create_handler
from server.auth import Principal, SessionManager
from server.cache import CachePolicy, MemoryCache
from server.config import ProviderConfig
from server.config import ProviderTerms
from server.database import Database, utc_now
from server.domain_validation import (
    normalize_american_odds,
    validate_event,
    validate_market,
    validate_provider_payload,
    validate_records,
    validate_stat_row,
    validate_status_record,
)
from server.errors import (
    AuthenticationError,
    ProviderAuthenticationError,
    ProviderUnavailableError,
    redact,
)
from server.freshness import data_quality_score, freshness_metadata, freshness_state
from server.gateway import ProviderGateway, build_gateway
from server.http_client import JsonHttpClient
from server.historical_ingestion import HistoricalStatsIngestor
from server.ingestion import IngestionRunner
from server.live_updates import LiveUpdateCoordinator
from server.observability import Metrics, sanitize_fields
from server.odds_ingestion import OddsIngestor
from server.provider_manager import ProviderManager, compare_provider_payloads
from server.providers import FixtureProvider
from server.reconciliation import CanonicalEntity, EntityReconciler, ProviderMapping, normalize_identity_text
from server.resilience import CircuitBreaker, FixedWindowRateLimiter, RequestCoordinator
from server.runtime import build_runtime
from server.server_alerts import ServerAlertService
from server.workspace_sync import WorkspaceSyncService


NOW = datetime(2026, 7, 30, 16, 0, tzinfo=timezone.utc)


class FakeProvider:
    mode = "live"

    def __init__(self, name: str, payload=None, error: Exception | None = None):
        self.name = name
        self.payload = payload if payload is not None else {"items": []}
        self.error = error
        self.calls = 0

    def fetch(self, domain, scope=None):
        self.calls += 1
        if self.error:
            raise self.error
        return self.payload


class MutableClock:
    def __init__(self):
        self.value = 0.0

    def __call__(self):
        return self.value

    def advance(self, seconds):
        self.value += seconds


class ConfigurationTests(unittest.TestCase):
    def test_sample_environment_is_valid_without_credentials(self):
        config = ProviderConfig.from_env({"APP_ENV": "test", "DATA_MODE": "sample", "SAMPLE_MODE": "true"})
        errors, warnings = config.validate()
        self.assertFalse(errors)
        self.assertTrue(warnings)
        self.assertTrue(config.public_config()["sampleMode"])

    def test_missing_optional_provider_does_not_fail(self):
        config = ProviderConfig.from_env({"APP_ENV": "development"})
        self.assertFalse(config.validate()[0])

    def test_missing_required_live_provider_fails_clearly(self):
        config = ProviderConfig.from_env({
            "DATA_MODE": "live", "SAMPLE_MODE": "false", "LIVE_DATA_ENABLED": "true",
        })
        self.assertEqual(len(config.validate()[0]), 2)

    def test_live_provider_configuration_is_valid(self):
        config = ProviderConfig.from_env({
            "DATA_MODE": "live", "SAMPLE_MODE": "false", "LIVE_DATA_ENABLED": "true",
            "SPORTS_PROVIDER_BASE_URL": "https://provider.invalid",
            "SPORTS_PROVIDER_API_KEY": "server-only",
        })
        self.assertTrue(config.live_configured)
        self.assertFalse(config.validate()[0])

    def test_public_configuration_excludes_secrets(self):
        config = ProviderConfig.from_env({"SPORTS_PROVIDER_API_KEY": "secret-value", "AUTH_SECRET": "another-secret"})
        text = json.dumps(config.public_config())
        self.assertNotIn("secret-value", text)
        self.assertNotIn("another-secret", text)

    def test_redacted_configuration_and_errors(self):
        config = ProviderConfig.from_env({"SPORTS_PROVIDER_API_KEY": "secret-value"})
        self.assertEqual(config.redacted()["api_key"], "[configured]")
        self.assertNotIn("secret-value", redact("api_key=secret-value"))

    def test_offline_mode_does_not_claim_sample_or_live_data(self):
        config = ProviderConfig.from_env({"DATA_MODE": "offline", "SAMPLE_MODE": "false"})
        public = config.public_config()
        self.assertEqual(public["dataMode"], "offline")
        self.assertFalse(public["sampleMode"])
        self.assertIn("no provider or sample fallback", public["warnings"][0].lower())

    def test_public_modes_remain_distinct_and_sample_disable_is_enforced(self):
        cases = {
            "sample": {"DATA_MODE": "sample", "SAMPLE_MODE": "true"},
            "degraded": {"DATA_MODE": "degraded", "SAMPLE_MODE": "false"},
            "offline": {"DATA_MODE": "offline", "SAMPLE_MODE": "false"},
            "live": {
                "DATA_MODE": "live", "SAMPLE_MODE": "false", "LIVE_DATA_ENABLED": "true",
                "SPORTS_PROVIDER_BASE_URL": "https://provider.invalid", "SPORTS_PROVIDER_API_KEY": "server-only",
            },
            "hybrid": {
                "DATA_MODE": "hybrid", "SAMPLE_MODE": "false", "LIVE_DATA_ENABLED": "true",
                "SPORTS_PROVIDER_BASE_URL": "https://provider.invalid", "SPORTS_PROVIDER_API_KEY": "server-only",
            },
        }
        for mode, environment in cases.items():
            with self.subTest(mode=mode):
                config = ProviderConfig.from_env(environment)
                self.assertFalse(config.validate()[0])
                self.assertEqual(config.public_config()["dataMode"], mode)
        disabled = ProviderConfig.from_env({
            "DATA_MODE": "sample", "SAMPLE_MODE": "true", "SAMPLE_MODE_ENABLED": "false",
        })
        self.assertTrue(disabled.validate()[0])

    def test_live_raw_payload_cache_requires_explicit_provider_permission(self):
        base = {
            "DATA_MODE": "live", "SAMPLE_MODE": "false", "LIVE_DATA_ENABLED": "true",
            "SPORTS_PROVIDER_BASE_URL": "https://provider.invalid", "SPORTS_PROVIDER_API_KEY": "server-only",
        }
        restricted = build_gateway(ProviderConfig.from_env(base))
        allowed = build_gateway(ProviderConfig.from_env({**base, "PROVIDER_RAW_RETENTION_ALLOWED": "true"}))
        self.assertFalse(restricted.cache_provider_payloads)
        self.assertTrue(allowed.cache_provider_payloads)


class ContractValidationTests(unittest.TestCase):
    def test_valid_event(self):
        result = validate_records([{
            "event_id": "event-1", "league_key": "nba", "status": "scheduled",
            "starts_at": "2026-08-01T00:00:00Z",
            "participants": [{"id": "team-a"}, {"id": "team-b"}],
        }], validate_event, known_leagues={"nba"})
        self.assertEqual(len(result.accepted), 1)
        self.assertFalse(result.partial)

    def test_missing_required_event_field_is_quarantined(self):
        result = validate_records([{"event_id": "event-1"}], validate_event)
        self.assertEqual(len(result.rejected), 1)

    def test_invalid_timestamp_is_quarantined(self):
        result = validate_records([{
            "event_id": "event-1", "league_key": "nba", "status": "scheduled", "starts_at": "bad",
        }], validate_event)
        self.assertEqual(result.rejected[0]["code"], "validation_error")

    def test_provider_payload_validation_preserves_valid_siblings_before_cache(self):
        result = validate_provider_payload("schedules", {"items": [
            {"id": "event-1", "updated_at": "2026-07-30T16:00:00Z"},
            {"id": "event-2", "updated_at": "not-a-time"},
            "not-an-object",
        ]})
        self.assertEqual([item["id"] for item in result.data["items"]], ["event-1"])
        self.assertEqual(len(result.rejected), 2)
        self.assertTrue(result.partial)

    def test_gateway_does_not_cache_partially_invalid_raw_domain(self):
        provider = FakeProvider("raw", {"items": []})
        provider.mode = "live"
        provider.get_schedules = lambda: {"items": [
            {"id": "valid", "league_id": "nba", "status": "scheduled"},
            {"id": "invalid", "league_id": "nba", "updated_at": "not-a-time"},
        ]}
        for method_name in (
            "get_league_availability", "get_live_status", "get_odds", "get_player_props",
            "get_team_statistics", "get_player_statistics", "get_injuries", "get_lineups",
            "get_weather", "get_line_movement", "get_combat_cards", "get_motorsport_sessions",
        ):
            setattr(provider, method_name, lambda: {"items": []})
        cache = MemoryCache()
        bundle = ProviderGateway(provider, cache=cache).get_bundle()
        self.assertEqual([event["event_id"] for event in bundle["events"]], ["valid"])
        self.assertTrue(bundle["provider_status"]["partial"])
        self.assertFalse(any("domain:schedules" in entry.tags for entry in cache._entries.values()))

    def test_unknown_league_is_rejected(self):
        result = validate_records([{
            "event_id": "event-1", "league_key": "unknown", "status": "scheduled",
        }], validate_event, known_leagues={"nba"})
        self.assertEqual(len(result.accepted), 0)

    def test_duplicate_event_preserves_valid_sibling(self):
        record = {"event_id": "event-1", "league_key": "nba", "status": "scheduled"}
        result = validate_records([record, record, {"event_id": "event-2", "league_key": "nba", "status": "final"}], validate_event)
        self.assertEqual(len(result.accepted), 2)
        self.assertEqual(result.rejected[0]["code"], "duplicate_record")

    def test_stat_unit_and_numeric_validation(self):
        valid = {"id": "stat-1", "entity_id": "athlete-1", "league_id": "nba", "stat_id": "points", "unit": "points", "source": "fixture", "value": 20}
        self.assertEqual(len(validate_records([valid], validate_stat_row).accepted), 1)
        invalid = {**valid, "id": "stat-2", "unit": "bananas"}
        self.assertEqual(len(validate_records([invalid], validate_stat_row).rejected), 1)

    def test_market_validation_preserves_period_and_scope(self):
        market = {
            "offer_id": "offer-1", "event_id": "event-1", "league_key": "nba",
            "provider_market_id": "p1", "canonical_market_id": "basketball-moneyline",
            "source": "fixture", "status": "open", "period": "full-event",
            "settlement_scope": "including-overtime",
            "selections": [{"selection_id": "a", "side": "home", "american_odds": -110}],
        }
        accepted = validate_records([market], validate_market).accepted[0]
        self.assertEqual(accepted["settlement_scope"], "including-overtime")
        self.assertEqual(accepted["selections"][0]["american_odds"], -110)

    def test_malformed_odds_are_disabled_without_fabrication(self):
        market = {
            "offer_id": "offer-1", "event_id": "event-1", "league_key": "nba",
            "provider_market_id": "p1", "canonical_market_id": "basketball-moneyline",
            "source": "fixture", "status": "open", "settlement_scope": "regulation-only",
            "selections": [{"selection_id": "a", "side": "home", "american_odds": "bad"}],
        }
        result = validate_records([market], validate_market)
        self.assertIsNone(result.accepted[0]["selections"][0]["american_odds"])
        self.assertFalse(result.accepted[0]["selections"][0]["available"])
        self.assertTrue(result.partial)

    def test_status_confirmation_states(self):
        base = {"id": "injury-1", "entity_id": "athlete-1", "source": "fixture"}
        for state in ("official", "projected", "unverified", "outdated"):
            with self.subTest(state=state):
                result = validate_records([{**base, "id": f"injury-{state}", "confirmation_state": state}], validate_status_record)
                self.assertEqual(result.accepted[0]["confirmation_state"], state)

    def test_decimal_and_american_odds(self):
        self.assertEqual(normalize_american_odds(2.5, "decimal"), 150)
        self.assertEqual(normalize_american_odds(1.5, "decimal"), -200)
        self.assertEqual(normalize_american_odds(-110), -110)
        self.assertIsNone(normalize_american_odds(99))


class ReconciliationTests(unittest.TestCase):
    def setUp(self):
        self.entities = [
            CanonicalEntity(
                "athlete-jose", "athlete", "José Álvarez", "baseball", "mlb",
                [ProviderMapping("alpha", "123")], ["Jose Alvarez"],
                historical_relationships=[{"type": "member_of", "targetId": "team-a", "validFrom": "2025-01-01"}],
            ),
            CanonicalEntity("athlete-jose-2", "athlete", "Jose Alvarez", "baseball", "other", [], []),
            CanonicalEntity("team-old", "team", "Old Name", "basketball", "nba", [], ["New Name"], active=False),
        ]
        self.reconciler = EntityReconciler(self.entities)

    def test_exact_provider_mapping(self):
        result = self.reconciler.resolve("alpha", "123", entity_type="athlete")
        self.assertEqual(result.state, "confirmed")
        self.assertEqual(result.canonical_id, "athlete-jose")

    def test_alias_and_accent_normalization(self):
        self.assertEqual(normalize_identity_text("José Álvarez"), "jose alvarez")
        result = self.reconciler.resolve("new", "x", entity_type="athlete", name="Jose Alvarez", league_id="mlb")
        self.assertEqual(result.state, "high_confidence")

    def test_duplicate_name_is_ambiguous(self):
        result = self.reconciler.resolve("new", "x", entity_type="athlete", name="Jose Alvarez", sport_id="baseball")
        self.assertEqual(result.state, "ambiguous")
        self.assertIsNone(result.canonical_id)

    def test_conflicting_team_assignment(self):
        result = self.reconciler.resolve(
            "new", "x", entity_type="athlete", name="Jose Alvarez",
            league_id="mlb", team_id="team-wrong",
        )
        self.assertEqual(result.state, "conflicting")

    def test_manual_override(self):
        self.reconciler.add_manual_override("new", "x", "athlete-jose")
        result = self.reconciler.resolve("new", "x", entity_type="athlete")
        self.assertEqual(result.state, "manually_overridden")

    def test_historical_inactive_entity_remains_resolvable(self):
        result = self.reconciler.resolve("new", "old", entity_type="team", name="New Name", league_id="nba")
        self.assertEqual(result.canonical_id, "team-old")

    def test_unresolved_identity_does_not_auto_merge(self):
        result = self.reconciler.resolve("new", "none", entity_type="driver", name="Unknown")
        self.assertEqual(result.state, "unresolved")


class DatabaseTests(unittest.TestCase):
    def setUp(self):
        self.db = Database()
        self.db.migrate()

    def tearDown(self):
        self.db.close()

    def test_migration_and_health(self):
        self.assertEqual(self.db.schema_version(), 2)
        self.assertTrue(self.db.health()["connected"])

    def test_transaction_failure_rolls_back(self):
        with self.assertRaises(Exception):
            with self.db.transaction() as connection:
                connection.execute("INSERT INTO sports(id,name,ingested_at,updated_at) VALUES(?,?,?,?)", ("s1", "Sport", utc_now(), utc_now()))
                raise RuntimeError("rollback")
        self.assertEqual(self.db.execute("SELECT * FROM sports"), [])

    def test_unique_event_constraint_and_provider_correction(self):
        event = {"event_id": "event-1", "league_key": "nba", "event_type": "team", "status": "scheduled", "starts_at": "2026-08-01T00:00:00Z"}
        first = self.db.upsert_event(event, "fixture")
        second = self.db.upsert_event({**event, "starts_at": "2026-08-01T01:00:00Z"}, "fixture")
        self.assertEqual(first["revision"], 1)
        self.assertTrue(second["corrected"])
        self.assertEqual(second["revision"], 2)
        self.assertEqual(len(self.db.execute("SELECT * FROM events")), 1)

    def test_unique_market_snapshot(self):
        snapshot = {
            "id": "snapshot-1", "market_id": "market-1", "selection_id": "selection-1",
            "american_odds": -110, "source": "fixture", "provider_updated_at": "2026-07-30T16:00:00Z",
            "payload_hash": "hash",
        }
        self.assertTrue(self.db.insert_odds_snapshot(snapshot))
        self.assertFalse(self.db.insert_odds_snapshot({**snapshot, "id": "snapshot-2"}))

    def test_soft_deletion(self):
        now = utc_now()
        with self.db.transaction() as connection:
            connection.execute("INSERT INTO sports(id,name,ingested_at,updated_at) VALUES(?,?,?,?)", ("s1", "Sport", now, now))
            connection.execute("UPDATE sports SET deleted_at=? WHERE id=?", (now, "s1"))
        self.assertIsNotNone(self.db.execute("SELECT deleted_at FROM sports WHERE id=?", ("s1",))[0]["deleted_at"])

    def test_parameterized_query_treats_injection_as_data(self):
        value = "x' OR 1=1 --"
        self.assertEqual(self.db.execute("SELECT * FROM sports WHERE id=?", (value,)), [])

    def test_odds_ingestion_respects_retention_terms_and_deduplicates(self):
        offer = {
            "offer_id": "offer-1", "event_id": "event-1", "league_key": "nba",
            "provider_market_id": "provider-1", "canonical_market_id": "basketball-moneyline",
            "source": "fixture", "status": "open", "settlement_scope": "including-overtime",
            "period": "full-event", "updated_at": "2026-07-30T16:00:00Z",
            "selections": [{"selection_id": "home", "side": "home", "american_odds": -110}],
        }
        restricted = OddsIngestor(self.db, ProviderTerms())
        result = restricted.ingest([offer], "fixture")
        self.assertEqual(result.accepted_snapshots, 0)
        self.assertTrue(any("terms" in warning for warning in result.warnings))
        allowed = OddsIngestor(self.db, ProviderTerms(odds_history_storage_allowed=True))
        first = allowed.ingest([offer], "fixture")
        second = allowed.ingest([offer], "fixture")
        self.assertEqual(first.accepted_snapshots, 1)
        self.assertEqual(second.duplicate_snapshots, 1)

    def test_historical_ingestion_requires_completed_event_and_tracks_correction(self):
        event = {
            "event_id": "event-final", "league_key": "nba", "event_type": "team",
            "status": "final", "starts_at": "2026-07-01T00:00:00Z",
        }
        self.db.upsert_event(event, "fixture")
        cache = MemoryCache()
        cache.set("leaderboard", {"rows": []}, 60, 60, tags=("league:nba:leaderboard",))
        ingestor = HistoricalStatsIngestor(self.db, cache)
        row = {
            "id": "stat-1", "event_id": "event-final", "entity_id": "athlete-1",
            "league_id": "nba", "season": "2026", "stage": "regular",
            "stat_id": "points", "value": 20, "unit": "points", "source": "fixture",
        }
        first = ingestor.ingest([row], "fixture")
        corrected = ingestor.ingest([{**row, "value": 22}], "fixture")
        self.assertEqual(first.accepted, 1)
        self.assertEqual(corrected.corrections, 1)
        self.assertEqual(corrected.invalidated_cache_entries, 1)
        self.db.upsert_event({**event, "event_id": "event-live", "status": "live"}, "fixture")
        incomplete = ingestor.ingest([{**row, "id": "stat-2", "event_id": "event-live"}], "fixture")
        self.assertEqual(incomplete.accepted, 0)
        self.assertTrue(incomplete.warnings)


class CacheAndResilienceTests(unittest.TestCase):
    def test_cache_hit_miss_stale_and_invalidation(self):
        clock = MutableClock()
        cache = MemoryCache(clock)
        self.assertEqual(cache.get("a")[1], "miss")
        cache.set("a", {"value": 1}, 1, 10, tags=("event:1",))
        self.assertEqual(cache.get("a")[1], "fresh")
        clock.advance(2)
        self.assertEqual(cache.get("a", allow_stale=True)[1], "stale")
        self.assertEqual(cache.invalidate(tag="event:1"), 1)

    def test_provider_aware_versioned_cache_key(self):
        self.assertNotEqual(CachePolicy.key("v1", "a", "odds"), CachePolicy.key("v1", "b", "odds"))
        self.assertNotEqual(CachePolicy.key("v1", "a", "odds"), CachePolicy.key("v2", "a", "odds"))

    def test_event_status_aware_ttl(self):
        policy = CachePolicy(default_ttl=60, live_ttl=5, maximum_ttl=3600)
        self.assertLess(policy.ttl("live_odds", event_status="live"), policy.ttl("historical_stats"))
        self.assertEqual(policy.ttl("historical_stats", event_status="final"), 3600)

    def test_circuit_breaker_opens_and_recovers(self):
        clock = MutableClock()
        breaker = CircuitBreaker(2, 10, clock)
        breaker.failure(ProviderUnavailableError("one"))
        breaker.failure(ProviderUnavailableError("two"))
        self.assertFalse(breaker.allow())
        clock.advance(11)
        self.assertTrue(breaker.allow())
        self.assertFalse(breaker.allow())
        breaker.success()
        self.assertEqual(breaker.snapshot()["state"], "closed")

    def test_authentication_failure_does_not_open_circuit(self):
        breaker = CircuitBreaker(1, 10)
        breaker.failure(ProviderAuthenticationError("bad auth"))
        self.assertTrue(breaker.allow())

    def test_request_deduplication(self):
        coordinator = RequestCoordinator(2)
        barrier = threading.Barrier(2)
        calls = []
        results = []

        def operation():
            calls.append(1)
            time.sleep(0.05)
            return "ok"

        def worker():
            barrier.wait()
            results.append(coordinator.execute("same", operation))

        threads = [threading.Thread(target=worker) for _ in range(2)]
        for thread in threads: thread.start()
        for thread in threads: thread.join()
        self.assertEqual(results, ["ok", "ok"])
        self.assertEqual(len(calls), 1)

    def test_application_rate_limit_has_retry_after(self):
        limiter = FixedWindowRateLimiter()
        limiter.check("test", "ip", 1, 60)
        with self.assertRaises(Exception) as caught:
            limiter.check("test", "ip", 1, 60)
        self.assertGreater(caught.exception.retry_after, 0)

    def test_http_client_does_not_retry_authentication(self):
        error = urllib.error.HTTPError("https://provider.invalid", 401, "unauthorized", {}, io.BytesIO())
        client = JsonHttpClient(max_retries=3, sleeper=lambda _: None)
        with patch("urllib.request.urlopen", side_effect=error) as request:
            with self.assertRaises(ProviderAuthenticationError):
                client.get_json("https://provider.invalid")
        self.assertEqual(request.call_count, 1)

    def test_http_client_retries_transient_failure_with_maximum(self):
        error = urllib.error.URLError("offline")
        client = JsonHttpClient(max_retries=2, sleeper=lambda _: None)
        with patch("urllib.request.urlopen", side_effect=error) as request:
            with self.assertRaises(ProviderUnavailableError):
                client.get_json("https://provider.invalid")
        self.assertEqual(request.call_count, 3)


class FailoverFreshnessAndLiveTests(unittest.TestCase):
    def test_primary_success(self):
        manager = ProviderManager(FakeProvider("primary", {"items": [{"id": "1"}]}))
        result = manager.fetch("schedules")
        self.assertEqual(result.provider, "primary")
        self.assertFalse(result.fallback_used)

    def test_secondary_success_after_primary_failure(self):
        manager = ProviderManager(
            FakeProvider("primary", error=ProviderUnavailableError("offline")),
            FakeProvider("secondary", {"items": [{"id": "1"}]}),
        )
        result = manager.fetch("schedules")
        self.assertEqual(result.provider, "secondary")
        self.assertTrue(result.fallback_used)

    def test_sample_fallback_is_labeled(self):
        manager = ProviderManager(
            FakeProvider("primary", error=ProviderUnavailableError("offline")),
            sample=FakeProvider("fixture", {"items": []}),
        )
        result = manager.fetch("schedules", allow_sample=True)
        self.assertTrue(result.fallback_used)
        self.assertTrue(any("Sample" in warning for warning in result.warnings))

    def test_provider_conflicts_are_not_mixed(self):
        conflicts = compare_provider_payloads(
            {"items": [{"id": "e1", "status": "live", "score": "1-0"}]},
            {"items": [{"id": "e1", "status": "final", "score": "2-0"}]},
        )
        self.assertEqual(conflicts[0]["primary"], "retained")
        self.assertIn("status", conflicts[0]["fields"])

    def test_freshness_states_and_quality_not_confidence(self):
        for state, seconds in (("fresh", 5), ("delayed", 15), ("stale", 100), ("expired", 2000)):
            with self.subTest(state=state):
                timestamp = (NOW - timedelta(seconds=seconds)).isoformat()
                self.assertEqual(freshness_state("live_status", timestamp, NOW), state)
        self.assertEqual(freshness_state("odds", NOW.isoformat(), NOW, sample=True), "sample")
        quality = data_quality_score(completeness=1, freshness="fresh", reconciliation_confidence=1, provider_health=1)
        self.assertFalse(quality["isBettingConfidence"])

    def test_freshness_metadata_retains_source_timestamps(self):
        metadata = freshness_metadata(
            "schedules", source="fixture", fetched_at=NOW.isoformat(),
            provider_updated_at=NOW.isoformat(), completeness=0.8, now=NOW,
        )
        self.assertEqual(metadata["source"], "fixture")
        self.assertEqual(metadata["freshnessState"], "fresh")
        self.assertEqual(metadata["completeness"], 0.8)

    def test_live_poll_deduplicates_and_orders_updates(self):
        provider = FakeProvider("live", {"items": [{
            "event_id": "e1", "sequence": 2, "status": "live",
            "provider_updated_at": datetime.now(timezone.utc).isoformat(),
        }]})
        coordinator = LiveUpdateCoordinator(ProviderManager(provider))
        first = coordinator.poll()
        second = coordinator.poll()
        self.assertEqual(len(first.updates), 1)
        self.assertEqual(len(second.updates), 0)
        provider.payload = {"items": [{"event_id": "e1", "sequence": 1, "status": "live"}]}
        self.assertEqual(len(coordinator.poll().updates), 0)

    def test_live_poll_pauses_when_hidden_and_backs_off(self):
        provider = FakeProvider("live", error=ProviderUnavailableError("offline"))
        coordinator = LiveUpdateCoordinator(ProviderManager(provider))
        self.assertEqual(coordinator.poll(visible=False).connection_state, "paused")
        failed = coordinator.poll()
        self.assertEqual(failed.connection_state, "reconnecting")
        self.assertGreater(failed.next_poll_seconds, coordinator.base_interval_seconds)


class IngestionAuthSyncAlertAndApiTests(unittest.TestCase):
    def setUp(self):
        self.db = Database()
        self.db.migrate()

    def tearDown(self):
        self.db.close()

    def test_fixture_ingestion_success_and_idempotent_rerun(self):
        manager = ProviderManager(FixtureProvider())
        runner = IngestionRunner(self.db, manager, MemoryCache())
        first = runner.run("refresh_active_schedules", league_id="nba")
        second = runner.run("refresh_active_schedules", league_id="nba")
        self.assertEqual(first.status, "succeeded")
        self.assertEqual(second.status, "succeeded")
        self.assertEqual(len(self.db.execute("SELECT * FROM events")), 1)
        self.assertEqual(self.db.execute("SELECT revision FROM events")[0]["revision"], 1)

    def test_schedule_correction_increments_revision_and_invalidates_related_cache(self):
        provider = FixtureProvider()
        cache = MemoryCache()
        runner = IngestionRunner(self.db, ProviderManager(provider), cache)
        runner.run("refresh_active_schedules", league_id="nba")
        event = provider.fixture["schedules"]["items"][0]
        event_id = event["id"]
        for key, tag in (
            ("event", f"event:{event_id}"),
            ("league", "league:nba:schedule"),
            ("domain", "domain:schedules"),
        ):
            cache.set(key, {"cached": True}, 60, 60, tags=(tag,))
        event["start_time"] = "2026-10-21T00:00:00Z"
        corrected = runner.run("refresh_active_schedules", league_id="nba")
        self.assertEqual(corrected.status, "succeeded")
        self.assertEqual(self.db.execute("SELECT revision FROM events")[0]["revision"], 2)
        self.assertEqual(cache.diagnostics()["entries"], 0)

    def test_ingestion_failure_is_observable(self):
        runner = IngestionRunner(self.db, ProviderManager(FakeProvider("bad", error=ProviderUnavailableError("offline"))))
        result = runner.run("refresh_live_events")
        self.assertEqual(result.status, "failed")
        self.assertEqual(runner.recent()[0]["status"], "failed")

    def test_unconfigured_ingestion_handler_is_not_reported_as_success(self):
        result = IngestionRunner(self.db, ProviderManager(FixtureProvider())).run("refresh_odds")
        self.assertEqual(result.status, "partial")
        self.assertIn("no configured domain handler", result.warnings[0])

    def test_partial_ingestion_quarantines_safe_rejection_metadata(self):
        provider = FakeProvider("fixture", {"items": [
            {"event_id": "valid-event", "league_key": "nba", "status": "scheduled"},
            {"event_id": "invalid-event"},
        ]})
        result = IngestionRunner(self.db, ProviderManager(provider)).run("refresh_active_schedules")
        self.assertEqual(result.status, "partial")
        self.assertEqual((result.records_read, result.records_accepted, result.records_rejected), (2, 1, 1))
        warning = self.db.execute("SELECT details_json FROM data_quality_warnings")[0]
        details = json.loads(warning["details_json"])
        self.assertEqual(details["index"], 1)
        self.assertEqual(set(details), {"jobId", "index", "message"})
        self.assertNotIn("payload", warning["details_json"])

    def test_ingestion_duplicate_job_lock(self):
        runner = IngestionRunner(self.db, ProviderManager(FixtureProvider()))
        runner._locks["refresh_active_schedules::::"] = threading.Lock()
        runner._locks["refresh_active_schedules::::"].acquire()
        with self.assertRaises(Exception):
            runner.run("refresh_active_schedules")
        runner._locks["refresh_active_schedules::::"].release()

    def test_anonymous_mode_and_session_lifecycle(self):
        manager = SessionManager(self.db, "1234567890abcdef")
        self.assertEqual(manager.anonymous().mode, "anonymous_local")
        now = utc_now()
        with self.db.transaction() as connection:
            connection.execute("INSERT INTO users(id,status,created_at,updated_at) VALUES(?,?,?,?)", ("user-1", "active", now, now))
        session = manager.create("user-1")
        cookie = manager.cookie(session["token"])
        self.assertIn("HttpOnly", cookie)
        self.assertIn("Secure", cookie)
        self.assertIn("SameSite=Lax", cookie)
        principal = manager.authenticate(session["token"])
        self.assertTrue(principal.authenticated)
        manager.verify_csrf(principal, session["csrf"])
        manager.logout(principal)
        with self.assertRaises(AuthenticationError):
            manager.authenticate(session["token"])

    def test_account_deletion_requires_confirmation_and_revokes_sessions(self):
        manager = SessionManager(self.db, "1234567890abcdef")
        now = utc_now()
        with self.db.transaction() as connection:
            connection.execute("INSERT INTO users(id,status,created_at,updated_at) VALUES(?,?,?,?)", ("user-delete", "active", now, now))
        session = manager.create("user-delete")
        principal = manager.authenticate(session["token"])
        with self.assertRaises(Exception):
            manager.delete_account(principal, confirmed=False)
        manager.delete_account(principal, confirmed=True)
        self.assertEqual(self.db.execute("SELECT status FROM users WHERE id=?", ("user-delete",))[0]["status"], "deleted")
        with self.assertRaises(AuthenticationError):
            manager.authenticate(session["token"])

    def test_workspace_sync_ownership_conflict_and_tombstone(self):
        service = WorkspaceSyncService(self.db)
        owner = Principal("authenticated", "user-1", "session-1")
        intruder = Principal("authenticated", "user-2", "session-2")
        service.create_workspace(owner, "workspace-1", "Private")
        first = service.push(owner, "workspace-1", [{
            "id": "object-1", "objectType": "saved_research", "objectVersion": 1,
            "payload": {"title": "Original"},
        }], 0)
        conflict = service.push(owner, "workspace-1", [{
            "id": "object-1", "objectType": "saved_research", "objectVersion": 2,
            "serverRevision": 0, "payload": {"title": "Stale"},
        }], first.server_revision)
        self.assertEqual(conflict.conflicts[0]["state"], "conflicted")
        deleted = service.push(owner, "workspace-1", [{
            "id": "object-1", "objectType": "saved_research", "objectVersion": 2,
            "serverRevision": first.accepted[0]["serverRevision"], "payload": {}, "deletedAt": utc_now(),
        }], first.server_revision)
        self.assertEqual(deleted.accepted[0]["syncState"], "deleted")
        with self.assertRaises(Exception):
            service.pull(intruder, "workspace-1")

    def test_server_alert_capabilities_stale_suppression_cooldown_and_audit(self):
        service = ServerAlertService(self.db)
        self.assertEqual(service.capabilities(), {
            "inApp": True, "email": False, "push": False, "continuousMonitoring": False,
        })
        rule = {
            "id": "rule-1", "ownerId": "user-1", "category": "odds_threshold",
            "condition": {"metric": "odds", "operator": "less_than", "value": -120},
            "lastKnownValue": -110, "cooldownSeconds": 60, "delivery": ["in_app", "email"],
        }
        stale = service.evaluate(rule, {"value": -130, "freshnessState": "stale"})
        self.assertEqual(stale.reason, "stale_data_ignored")
        triggered = service.evaluate(rule, {"value": -130, "freshnessState": "fresh", "source": "fixture"}, NOW)
        self.assertTrue(triggered.triggered)
        self.assertEqual(triggered.event["delivery"], ["in_app"])
        self.assertFalse(triggered.event["guaranteedOutcome"])
        service.persist_event(triggered.event)
        self.assertEqual(len(self.db.execute("SELECT * FROM alert_events")), 1)

    def test_api_security_rate_limit_public_config_and_safe_errors(self):
        config = ProviderConfig.from_env({"APP_ENV": "test", "ADMIN_TOKEN": "admin-secret"})
        runtime = build_runtime(config)
        try:
            api = Api(runtime)
            status, public, headers = api.handle("GET", "/api/config/public", client_ip="1")
            self.assertEqual(status, 200)
            self.assertNotIn("admin-secret", json.dumps(public))
            self.assertTrue(headers["X-Request-ID"])
            denied, payload, _ = api.handle("GET", "/api/admin/diagnostics", client_ip="2")
            self.assertEqual(denied, 403)
            self.assertNotIn("Traceback", json.dumps(payload))
            allowed, diagnostics, _ = api.handle(
                "GET", "/api/admin/diagnostics", headers={"X-EdgeBoard-Admin": "admin-secret"}, client_ip="3",
            )
            self.assertEqual(allowed, 200)
            self.assertTrue(diagnostics["readOnly"])
        finally:
            runtime.close()

    def test_api_unsupported_features_are_honest(self):
        runtime = build_runtime(ProviderConfig.from_env({"APP_ENV": "test"}))
        try:
            api = Api(runtime)
            status, workspaces, _ = api.handle("GET", "/api/workspaces")
            self.assertEqual(status, 200)
            self.assertEqual(workspaces["mode"], "local_only")
            status, result, _ = api.handle("POST", "/api/research", body=json.dumps({
                "structuredQuery": {"intent": "historical_summary"},
            }).encode())
            self.assertEqual(status, 200)
            self.assertEqual(result["status"], "unavailable")
            self.assertFalse(result["llmSourceOfTruth"])
            invalid, payload, _ = api.handle("POST", "/api/research", body=json.dumps({
                "structuredQuery": {"intent": "event_search", "limit": "not-a-number"},
            }).encode())
            self.assertEqual(invalid, 400)
            self.assertEqual(payload["error"]["code"], "validation_error")
            status, alerts, _ = api.handle("GET", "/api/alerts")
            self.assertEqual(status, 200)
            self.assertFalse(alerts["enabled"])
            self.assertFalse(any(alerts["capabilities"].values()))
            with patch.object(runtime.database, "health", return_value={"connected": False, "schemaVersion": 0}):
                readiness, body, _ = api.handle("GET", "/api/status/ready")
            self.assertEqual(readiness, 503)
            self.assertEqual(body["status"], "not_ready")
            too_long, payload, headers = api.handle("GET", "/api/events", query="q=" + ("x" * 8192))
            self.assertEqual(too_long, 400)
            self.assertEqual(payload["error"]["code"], "validation_error")
            self.assertEqual(payload["error"]["requestId"], headers["X-Request-ID"])
        finally:
            runtime.close()

    def test_alert_api_loads_authorized_stored_rule_and_persists_state(self):
        config = ProviderConfig.from_env({
            "APP_ENV": "test",
            "AUTH_SECRET": "1234567890abcdef",
            "CLOUD_WORKSPACE_SYNC_ENABLED": "true",
            "SERVER_ALERTS_ENABLED": "true",
        })
        runtime = build_runtime(config)
        try:
            now = utc_now()
            with runtime.database.transaction() as connection:
                connection.execute(
                    "INSERT INTO users(id,status,created_at,updated_at) VALUES(?,?,?,?)",
                    ("alert-user", "active", now, now),
                )
                connection.execute(
                    """INSERT INTO alert_rules(
                        id,owner_id,workspace_id,category,condition_json,frequency,cooldown_seconds,
                        delivery_json,created_at,updated_at
                    ) VALUES(?,?,?,?,?,?,?,?,?,?)""",
                    (
                        "owned-rule", "alert-user", "workspace-1", "odds_threshold",
                        json.dumps({"metric": "odds", "operator": "less_than", "value": -120}),
                        "on_change", 60, json.dumps(["in_app"]), now, now,
                    ),
                )
            session = runtime.sessions.create("alert-user")
            headers = {"Authorization": f"Bearer {session['token']}", "X-CSRF-Token": session["csrf"]}
            api = Api(runtime)
            denied, _, _ = api.handle(
                "POST", "/api/alerts/evaluate",
                body=json.dumps({"rule": {"id": "not-owned"}, "reading": {"value": -130, "freshnessState": "fresh"}}).encode(),
                headers=headers,
            )
            self.assertEqual(denied, 403)
            status, result, _ = api.handle(
                "POST", "/api/alerts/evaluate",
                body=json.dumps({
                    "rule": {"id": "owned-rule", "ownerId": "someone-else"},
                    "reading": {"value": -130, "freshnessState": "fresh", "source": "fixture"},
                }).encode(),
                headers=headers,
            )
            self.assertEqual(status, 200)
            self.assertTrue(result["triggered"])
            state = runtime.database.execute(
                "SELECT last_known_json,last_triggered_json FROM alert_rules WHERE id=?",
                ("owned-rule",),
            )[0]
            self.assertEqual(json.loads(state["last_known_json"])["value"], -130)
            self.assertTrue(json.loads(state["last_triggered_json"])["at"])
        finally:
            runtime.close()

    def test_logs_metrics_and_import_safety_helpers(self):
        sanitized = sanitize_fields({"api_key": "secret", "notes": "<script>", "route": "/api/status\nfake"})
        self.assertEqual(sanitized["api_key"], "[REDACTED]")
        self.assertEqual(sanitized["notes"], "[REDACTED]")
        self.assertNotIn("\n", sanitized["route"])
        metrics = Metrics()
        metrics.increment("requests", route="status")
        metrics.observe("latency", 3.2, route="status")
        snapshot = metrics.snapshot()
        self.assertTrue(snapshot["counts"])
        self.assertTrue(snapshot["durationMs"])


class HttpBoundaryTests(unittest.TestCase):
    def setUp(self):
        config = ProviderConfig.from_env({
            "APP_ENV": "test", "REQUEST_BODY_LIMIT_BYTES": "1024",
            "ALLOWED_ORIGINS": "https://edgeboard.example",
        })
        self.runtime = build_runtime(config)
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), create_handler(self.runtime))
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.connection = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=5)

    def tearDown(self):
        self.connection.close()
        self.server.shutdown()
        self.server.server_close()
        self.runtime.close()

    def test_security_headers_and_allowed_cors(self):
        self.connection.request("GET", "/api/status", headers={"Origin": "https://edgeboard.example"})
        response = self.connection.getresponse()
        response.read()
        self.assertEqual(response.status, 200)
        self.assertEqual(response.getheader("Access-Control-Allow-Origin"), "https://edgeboard.example")
        self.assertEqual(response.getheader("X-Content-Type-Options"), "nosniff")
        self.assertEqual(response.getheader("X-Frame-Options"), "SAMEORIGIN")
        self.assertIn("frame-ancestors 'self'", response.getheader("Content-Security-Policy"))

    def test_disallowed_cors_and_request_size_limit(self):
        self.connection.request("OPTIONS", "/api/status", headers={"Origin": "https://evil.example"})
        denied = self.connection.getresponse()
        denied.read()
        self.assertEqual(denied.status, 403)
        self.connection.request(
            "POST", "/api/research", body=b"x" * 2048,
            headers={"Content-Length": "2048", "Content-Type": "application/json"},
        )
        oversized = self.connection.getresponse()
        payload = json.loads(oversized.read())
        self.assertEqual(oversized.status, 413)
        self.assertEqual(payload["error"]["code"], "validation_error")

    def test_server_paths_are_not_public(self):
        self.connection.request("GET", "/server/config.py")
        response = self.connection.getresponse()
        response.read()
        self.assertEqual(response.status, 404)

    def test_production_disallows_framing_and_browser_harnesses(self):
        config = ProviderConfig.from_env({
            "APP_ENV": "production", "ALLOWED_ORIGINS": "https://edgeboard.example",
        })
        runtime = build_runtime(config)
        server = ThreadingHTTPServer(("127.0.0.1", 0), create_handler(runtime))
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        connection = http.client.HTTPConnection("127.0.0.1", server.server_port, timeout=5)
        try:
            connection.request("GET", "/api/status")
            response = connection.getresponse()
            response.read()
            self.assertEqual(response.getheader("X-Frame-Options"), "DENY")
            self.assertIn("frame-ancestors 'none'", response.getheader("Content-Security-Policy"))
            connection.request("GET", "/browser-tests/workspace.html")
            blocked = connection.getresponse()
            blocked.read()
            self.assertEqual(blocked.status, 404)
        finally:
            connection.close()
            server.shutdown()
            server.server_close()
            runtime.close()


if __name__ == "__main__":
    unittest.main()
