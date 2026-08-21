from __future__ import annotations

import copy
import unittest

from server.api import Api
from server.config import ProviderConfig, ProviderTerms
from server.errors import ProviderValidationError
from server.market_movement import (
    MarketChangeEventAdapter, MarketMovementService, MarketSnapshotAdapter,
    MarketSnapshotStore, attach_change_events, determine_retention_policy,
    movement_analysis,
)
from server.runtime import build_runtime


def snapshot(**overrides):
    value = {
        "eventId": "mlb-event-1", "canonicalMarketId": "baseball-total",
        "sportsbookId": "sportsbook-a", "family": "total", "side": "over",
        "line": 8.5, "decimalOdds": 1.91, "americanOdds": -110,
        "status": "available", "period": "full_game",
        "settlementScope": "including_extra_innings", "isAlternate": False,
        "observedAt": "2026-08-07T12:00:00Z", "provider": "fixture-provider",
        "sourceMode": "fixture", "verification": "fixture_validated",
    }
    value.update(overrides)
    return value


class MarketMovementTests(unittest.TestCase):
    def test_retention_defaults_to_bounded_nondurable_cache(self):
        policy = determine_retention_policy(ProviderTerms())
        self.assertEqual("short_term_cache", policy["state"])
        self.assertFalse(policy["durable"])
        self.assertEqual(3600, policy["ttlSeconds"])

    def test_explicit_history_rights_are_distinct_from_cache_rights(self):
        policy = determine_retention_policy(ProviderTerms(odds_history_storage_allowed=True))
        self.assertEqual("historical_storage_allowed", policy["state"])
        self.assertTrue(policy["durable"])

    def test_unknown_rights_fail_closed_to_ephemeral(self):
        policy = determine_retention_policy({})
        self.assertEqual("unknown", policy["state"])
        self.assertEqual("ephemeral_only", policy["effectiveState"])
        self.assertTrue(policy["failClosed"])

    def test_prohibited_normalized_retention_is_ephemeral(self):
        policy = determine_retention_policy({"normalized_retention_allowed": False})
        self.assertEqual("ephemeral_only", policy["state"])

    def test_snapshot_identity_is_stable_across_line_and_price_changes(self):
        first = MarketSnapshotAdapter.normalize(snapshot())
        second = MarketSnapshotAdapter.normalize(snapshot(line=9, decimalOdds=1.83, observedAt="2026-08-07T12:05:00Z"))
        self.assertEqual(first["seriesId"], second["seriesId"])
        self.assertNotEqual(first["snapshotId"], second["snapshotId"])

    def test_snapshot_identity_separates_book_period_scope_and_player(self):
        base = MarketSnapshotAdapter.normalize(snapshot())
        for changed in (
            {"sportsbookId": "sportsbook-b"}, {"period": "first_five"},
            {"settlementScope": "regulation_only"}, {"playerId": "mlb-player-1"},
        ):
            self.assertNotEqual(base["seriesId"], MarketSnapshotAdapter.normalize(snapshot(**changed))["seriesId"])

    def test_invalid_odds_and_missing_identity_are_rejected(self):
        for raw in (snapshot(decimalOdds=1), snapshot(eventId=""), snapshot(decimalOdds=float("inf"))):
            with self.assertRaises(ProviderValidationError):
                MarketSnapshotAdapter.normalize(raw)

    def test_available_snapshot_requires_price_but_suspension_does_not(self):
        with self.assertRaises(ProviderValidationError):
            MarketSnapshotAdapter.normalize(snapshot(decimalOdds=None))
        row = MarketSnapshotAdapter.normalize(snapshot(decimalOdds=None, status="suspended", suspended=True))
        self.assertTrue(row["suspended"])

    def test_store_deduplicates_unchanged_observations(self):
        store = MarketSnapshotStore(determine_retention_policy(ProviderTerms()))
        result = store.capture([snapshot(), snapshot(observedAt="2026-08-07T12:01:00Z")])
        self.assertEqual(1, result["accepted"])
        self.assertEqual(1, result["duplicates"])

    def test_store_preserves_line_and_price_changes_separately(self):
        store = MarketSnapshotStore(determine_retention_policy(ProviderTerms()))
        store.capture([
            snapshot(), snapshot(decimalOdds=1.8, observedAt="2026-08-07T12:01:00Z"),
            snapshot(line=9, decimalOdds=1.8, observedAt="2026-08-07T12:02:00Z"),
        ])
        rows = store.history()
        self.assertEqual(["initial_observation", "price_change", "line_change"], [row["changeType"] for row in rows])

    def test_store_handles_out_of_order_observations_chronologically(self):
        store = MarketSnapshotStore(determine_retention_policy(ProviderTerms()))
        store.capture([snapshot(line=9, observedAt="2026-08-07T12:10:00Z")])
        store.capture([snapshot(observedAt="2026-08-07T12:00:00Z")])
        rows = store.history()
        self.assertEqual([8.5, 9], [row["line"] for row in rows])
        self.assertEqual(["initial_observation", "line_change"], [row["changeType"] for row in rows])

    def test_same_timestamp_correction_replaces_prior_value(self):
        store = MarketSnapshotStore(determine_retention_policy(ProviderTerms()))
        store.capture([snapshot()]); store.capture([snapshot(line=9)])
        rows = store.history()
        self.assertEqual(1, len(rows)); self.assertEqual(9, rows[0]["line"])
        self.assertEqual("corrected", rows[0]["changeType"])

    def test_suspension_reopen_and_close_are_explicit(self):
        store = MarketSnapshotStore(determine_retention_policy(ProviderTerms()))
        store.capture([
            snapshot(), snapshot(status="suspended", suspended=True, observedAt="2026-08-07T12:01:00Z"),
            snapshot(observedAt="2026-08-07T12:02:00Z"),
            snapshot(status="closed", observedAt="2026-08-07T12:03:00Z"),
        ])
        self.assertEqual(["initial_observation", "suspended", "reopened", "closed"], [row["changeType"] for row in store.history()])

    def test_provider_opening_is_not_conflated_with_earliest_observation(self):
        rows = [MarketSnapshotAdapter.normalize(snapshot(
            providerOpeningLine=8, providerOpeningDecimalOdds=2.0,
            providerOpenedAt="2026-08-07T10:00:00Z",
        ))]
        result = movement_analysis(rows)
        self.assertEqual(8, result["providerOpening"]["line"])
        self.assertEqual(8.5, result["earliestObserved"]["line"])
        self.assertEqual(.5, result["lineDelta"])

    def test_implied_probability_is_disclosed_as_sportsbook_derived(self):
        rows = [
            MarketSnapshotAdapter.normalize(snapshot(decimalOdds=2.0)),
            MarketSnapshotAdapter.normalize(snapshot(decimalOdds=1.8, observedAt="2026-08-07T12:05:00Z")),
        ]
        result = movement_analysis(rows)
        self.assertIn("not a model win probability", result["impliedProbabilityDisclosure"])

    def test_change_event_rejects_unsupported_types_and_relationships(self):
        base = {"changeEventId":"e1","eventId":"g1","eventType":"weather","occurredAt":"2026-08-07T12:00:00Z"}
        with self.assertRaises(ProviderValidationError): MarketChangeEventAdapter.normalize({**base, "eventType":"rumor"})
        with self.assertRaises(ProviderValidationError): MarketChangeEventAdapter.normalize({**base, "causalRelationship":"probably"})

    def test_related_event_never_becomes_verified_cause(self):
        analysis = movement_analysis([MarketSnapshotAdapter.normalize(snapshot())])
        event = MarketChangeEventAdapter.normalize({
            "changeEventId":"e1", "eventId":"mlb-event-1", "eventType":"weather",
            "occurredAt":"2026-08-07T12:00:00Z", "verification":"verified",
            "causalRelationship":"related_event",
        })
        result = attach_change_events(analysis, [event])
        self.assertEqual("unknown", result["cause"]["relationship"])
        self.assertEqual("No verified cause has been identified.", result["cause"]["disclosure"])

    def test_only_verified_causal_relationship_explains_change(self):
        analysis = movement_analysis([MarketSnapshotAdapter.normalize(snapshot())])
        event = MarketChangeEventAdapter.normalize({
            "changeEventId":"e1", "eventId":"mlb-event-1", "eventType":"weather",
            "occurredAt":"2026-08-07T12:00:00Z", "verification":"verified",
            "causalRelationship":"verified_cause", "evidenceIds":["evidence-1"],
        })
        self.assertEqual("verified_cause", attach_change_events(analysis, [event])["cause"]["relationship"])

    def test_fixture_has_known_and_unknown_cause_examples(self):
        service = MarketMovementService(ProviderTerms())
        items = service.timeline(event_id="mlb-2026-08-04-nyy-lad-1")["items"]
        total = next(item for item in items if item["current"]["canonicalMarketId"] == "baseball-total")
        prop = next(item for item in items if item["current"].get("playerId") == "mlb-gerrit-cole")
        self.assertEqual("verified_cause", total["cause"]["relationship"])
        self.assertEqual("unknown", prop["cause"]["relationship"])

    def test_consensus_never_creates_synthetic_sportsbook(self):
        service = MarketMovementService(ProviderTerms())
        result = service.consensus(event_id="mlb-2026-08-04-nyy-lad-1", market_id="baseball-total")
        self.assertFalse(result["syntheticBookCreated"])
        self.assertTrue(any(item["sportsbookCount"] == 2 for item in result["items"]))

    def test_recent_only_returns_meaningful_changes_by_default(self):
        service = MarketMovementService(ProviderTerms())
        result = service.recent(event_id="mlb-2026-08-04-nyy-lad-1")
        self.assertTrue(result["items"])
        self.assertTrue(all(item["meaningful"] for item in result["items"]))

    def test_round_trip_move_remains_meaningful_when_net_delta_is_zero(self):
        rows = [
            MarketSnapshotAdapter.normalize(snapshot()),
            MarketSnapshotAdapter.normalize(snapshot(line=9, observedAt="2026-08-07T12:05:00Z")),
            MarketSnapshotAdapter.normalize(snapshot(observedAt="2026-08-07T12:10:00Z")),
        ]
        result = movement_analysis(rows)
        self.assertEqual(0, result["lineDelta"])
        self.assertEqual(.5, result["largestObservedLineChange"])
        self.assertTrue(result["meaningful"])

    def test_provider_bundle_enrichment_preserves_canonical_offer_behavior(self):
        runtime = build_runtime(ProviderConfig.from_env({}))
        try:
            bundle = runtime.mlb_schedule_entities.provider_bundle(runtime.gateway.get_bundle())
            bundle = runtime.mlb_game_markets.provider_bundle(bundle)
            bundle = runtime.mlb_player_props.provider_bundle(bundle)
            offers = runtime.market_movement.enrich_offers(bundle["offers"])
            cole = next(selection for offer in offers for selection in offer["selections"] if (selection.get("participant") or {}).get("id") == "mlb-gerrit-cole" and selection.get("side") == "over")
            self.assertGreaterEqual(len(cole["price_history"]), 2)
            self.assertEqual("No verified cause has been identified.", cole["movement_summary"]["cause_disclosure"])
        finally:
            runtime.close()

    def test_public_endpoints_expose_history_consensus_and_recent_without_admin(self):
        runtime = build_runtime(ProviderConfig.from_env({}))
        try:
            api = Api(runtime)
            for path in ("/api/market-movement", "/api/market-movement/recent", "/api/market-movement/consensus"):
                status, payload, _headers = api.handle("GET", path, query="eventId=mlb-2026-08-04-nyy-lad-1")
                self.assertEqual(200, status); self.assertIn("items", payload)
        finally:
            runtime.close()

    def test_admin_diagnostics_require_auth_and_do_not_expose_secrets(self):
        runtime = build_runtime(ProviderConfig.from_env({}))
        try:
            status, payload, _ = Api(runtime).handle("GET", "/api/admin/mlb/market-movement/status")
            self.assertEqual(403, status)
            self.assertNotIn("api_key", str(payload).lower())
        finally:
            runtime.close()

    def test_capture_endpoint_requires_explicit_confirmation(self):
        config = ProviderConfig.from_env({"ADMIN_TOKEN":"test-admin"})
        runtime = build_runtime(config)
        try:
            api = Api(runtime)
            status, _payload, _ = api.handle("POST", "/api/admin/mlb/market-movement/capture", body=b"{}", headers={"x-edgeboard-admin":"test-admin"})
            self.assertEqual(400, status)
            status, payload, _ = api.handle("POST", "/api/admin/mlb/market-movement/capture", body=b'{"confirmation":"CAPTURE MLB MARKET MOVEMENT"}', headers={"x-edgeboard-admin":"test-admin"})
            self.assertEqual(200, status); self.assertIn("retention", payload)
        finally:
            runtime.close()


if __name__ == "__main__":
    unittest.main()
