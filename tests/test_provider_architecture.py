from __future__ import annotations

import copy
import unittest
from datetime import datetime, timedelta, timezone

from server.adapters import CompositeProviderAdapter
from server.cache import MemoryCache
from server.contracts import COLLECTION_KEYS, validate_normalized_bundle
from server.errors import ProviderUnavailableError
from server.freshness import freshness_state
from server.gateway import ProviderGateway
from server.providers import MockProvider


NOW = datetime(2026, 7, 28, 17, 0, tzinfo=timezone.utc)
NOW_TEXT = NOW.isoformat().replace("+00:00", "Z")


def valid_bundle() -> dict:
    bundle = {key: [] for key in COLLECTION_KEYS}
    bundle.update({
        "provider": "test-provider",
        "generated_at": NOW_TEXT,
        "provider_status": {
            "provider": "Test Provider",
            "mode": "sample",
            "state": "fresh",
            "last_updated_at": NOW_TEXT,
            "last_successful_update_at": NOW_TEXT,
        },
        "events": [{
            "event_id": "EVENT-1",
            "league_key": "nba",
            "event_type": "team",
            "status": "scheduled",
            "starts_at": "2026-07-28T20:00:00Z",
            "participants": [],
        }],
        "offers": [{
            "offer_id": "OFFER-1",
            "league_key": "nba",
            "event_id": "EVENT-1",
            "market_type": "moneyline",
            "canonical_market_id": "basketball-moneyline",
            "provider_market_id": "vendor:moneyline:1",
            "period": "full-event",
            "settlement_scope": "including-overtime",
            "ui_group": "moneylines",
            "status": "open",
            "selections": [{
                "selection_id": "HOME-1",
                "label": "Home",
                "american_odds": -110,
                "available": True,
                "last_updated_at": NOW_TEXT,
            }],
        }],
    })
    return bundle


class SwitchingProvider(MockProvider):
    name = "switching-provider"
    mode = "live"

    def __init__(self):
        super().__init__()
        self.fail = False

    def __getattribute__(self, name):
        if name.startswith("get_") and object.__getattribute__(self, "fail"):
            def failed():
                raise ProviderUnavailableError("Synthetic provider outage.")
            return failed
        return super().__getattribute__(name)


class PartialProvider(MockProvider):
    name = "partial-provider"
    mode = "live"

    def get_injuries(self):
        raise ProviderUnavailableError("Injury feed unavailable.")


class PassthroughProvider(MockProvider):
    name = "passthrough-provider"

    def get_team_statistics(self):
        return {"items": [{"id": "TEAM-STAT-1", "nested": {"value": 1}}]}


class RawMutationProbeAdapter(CompositeProviderAdapter):
    def __init__(self):
        super().__init__()
        self.seen_values: list[int] = []

    def adapt(self, raw, provider_name, generated_at=None):
        item = raw["team_statistics"]["items"][0]
        self.seen_values.append(item["nested"]["value"])
        if len(self.seen_values) == 1:
            item["nested"]["value"] = 999
        return super().adapt(raw, provider_name, generated_at)


class MutableClock:
    def __init__(self):
        self.value = 0.0

    def __call__(self):
        return self.value

    def advance(self, seconds: float):
        self.value += seconds


class ProviderArchitectureTests(unittest.TestCase):
    def test_valid_data(self):
        result = validate_normalized_bundle(valid_bundle(), NOW)
        self.assertFalse(result.errors)
        self.assertFalse(result.partial)
        self.assertEqual(result.data["events"][0]["status"], "scheduled")
        self.assertEqual(result.data["offers"][0]["selections"][0]["american_odds"], -110)
        self.assertEqual(result.data["offers"][0]["canonical_market_id"], "basketball-moneyline")

    def test_adapter_preserves_provider_agnostic_market_metadata(self):
        raw = {
            "odds": {"items": [{
                "id": "raw-offer",
                "league_id": "nba",
                "event_id": "EVENT-1",
                "market_type": "player-prop",
                "canonical_market_id": "basketball-assists",
                "provider_market_id": "vendor:ast",
                "period": "full-game",
                "settlement_scope": "including-overtime",
                "sgp_eligible": True,
                "selections": [{"id": "sel", "name": "Player", "line": 6.5, "side": "over", "odds": -110}],
            }]},
        }
        offer = CompositeProviderAdapter().odds.adapt(raw["odds"])[0]
        self.assertEqual(offer["canonical_market_id"], "basketball-assists")
        self.assertEqual(offer["provider_market_id"], "vendor:ast")
        self.assertEqual(offer["settlement_scope"], "including-overtime")
        self.assertEqual(offer["selections"][0]["side"], "over")

    def test_missing_fields(self):
        result = validate_normalized_bundle({"provider": "test"}, NOW)
        self.assertTrue(result.partial)
        self.assertIn("events", result.data)
        self.assertGreater(len(result.warnings), 0)

    def test_malformed_odds(self):
        bundle = valid_bundle()
        bundle["offers"][0]["selections"][0]["american_odds"] = "not-odds"
        result = validate_normalized_bundle(bundle, NOW)
        selection = result.data["offers"][0]["selections"][0]
        self.assertIsNone(selection["american_odds"])
        self.assertFalse(selection["available"])
        self.assertTrue(result.partial)

    def test_duplicate_events(self):
        bundle = valid_bundle()
        bundle["events"].append(copy.deepcopy(bundle["events"][0]))
        result = validate_normalized_bundle(bundle, NOW)
        self.assertEqual(len(result.data["events"]), 1)
        self.assertTrue(any("Duplicate event" in warning for warning in result.warnings))

    def test_postponed_game_suspends_markets(self):
        bundle = valid_bundle()
        bundle["events"][0]["status"] = "postponed"
        result = validate_normalized_bundle(bundle, NOW)
        self.assertEqual(result.data["offers"][0]["status"], "suspended")
        self.assertFalse(result.data["offers"][0]["selections"][0]["available"])

    def test_cancelled_event_suspends_markets(self):
        bundle = valid_bundle()
        bundle["events"][0]["status"] = "cancelled"
        result = validate_normalized_bundle(bundle, NOW)
        self.assertEqual(result.data["offers"][0]["status"], "suspended")
        self.assertIn("cancelled", result.data["offers"][0]["selections"][0]["data_quality_warning"])

    def test_changed_start_time_is_recorded(self):
        bundle = valid_bundle()
        changed = copy.deepcopy(bundle["events"][0])
        changed["starts_at"] = "2026-07-28T21:30:00Z"
        bundle["events"].append(changed)
        result = validate_normalized_bundle(bundle, NOW)
        event = result.data["events"][0]
        self.assertTrue(event["schedule_changed"])
        self.assertEqual(event["previous_starts_at"], "2026-07-28T20:00:00Z")
        self.assertEqual(event["starts_at"], "2026-07-28T21:30:00Z")

    def test_stale_data_rules(self):
        stale = (NOW - timedelta(minutes=10)).isoformat().replace("+00:00", "Z")
        delayed = (NOW - timedelta(seconds=90)).isoformat().replace("+00:00", "Z")
        self.assertEqual(freshness_state("live_odds", stale, NOW), "stale")
        self.assertEqual(freshness_state("pregame_odds", delayed, NOW), "delayed")
        self.assertEqual(freshness_state("completed_events", stale, NOW), "fresh")

    def test_provider_outage_uses_cache_fallback(self):
        provider = SwitchingProvider()
        clock = MutableClock()
        gateway = ProviderGateway(
            provider,
            cache=MemoryCache(clock=clock),
            adapter=CompositeProviderAdapter(),
            cache_ttl_seconds=1,
            cache_stale_seconds=60,
        )
        first = gateway.get_bundle()
        self.assertEqual(first["provider_status"]["state"], "fresh")
        cached = gateway.get_bundle()
        self.assertTrue(all(source["cache"] == "fresh" for source in cached["provider_status"]["sources"]))
        provider.fail = True
        clock.advance(2)
        fallback = gateway.get_bundle()
        self.assertEqual(fallback["provider_status"]["state"], "offline-fallback")
        self.assertTrue(fallback["provider_status"]["offline_fallback"])
        self.assertGreater(len(fallback["events"]), 0)
        self.assertIsNotNone(fallback["provider_status"]["last_successful_update_at"])

    def test_passthrough_bundle_mutation_does_not_corrupt_cached_payload(self):
        gateway = ProviderGateway(PassthroughProvider(), cache=MemoryCache())
        first = gateway.get_bundle()
        first["team_statistics"][0]["nested"]["value"] = 999

        second = gateway.get_bundle()

        self.assertEqual(second["team_statistics"][0]["nested"]["value"], 1)

    def test_gateway_detaches_cached_passthrough_payload_before_adapter(self):
        adapter = RawMutationProbeAdapter()
        gateway = ProviderGateway(PassthroughProvider(), cache=MemoryCache(), adapter=adapter)

        gateway.get_bundle()
        gateway.get_bundle()

        self.assertEqual(adapter.seen_values, [1, 1])

    def test_partial_provider_response(self):
        gateway = ProviderGateway(PartialProvider(), cache=MemoryCache(), adapter=CompositeProviderAdapter())
        bundle = gateway.get_bundle()
        self.assertTrue(bundle["provider_status"]["partial"])
        self.assertEqual(bundle["provider_status"]["state"], "partial")
        self.assertEqual(bundle["injuries"], [])
        self.assertTrue(any(error["domain"] == "injuries" for error in bundle["provider_status"]["errors"]))

    def test_specialized_provider_adapters(self):
        raw = {
            "combat_cards": {"items": [{
                "card_id": "CARD-1", "promotion_id": "ufc", "promotion": "UFC",
                "event_name": "Sample Card", "start_time": NOW_TEXT, "main_event": {"fighter_a": {}, "fighter_b": {}},
            }]},
            "motorsport_sessions": {"items": [{
                "weekend_id": "RACE-1", "series_id": "f1", "series": "Formula 1",
                "event_name": "Sample Grand Prix", "race_start_time": NOW_TEXT,
                "track": "Sample Circuit", "sessions": {"race": {"status": "scheduled"}},
                "competitors": [{"name": "Sample Driver", "manufacturer": "Sample Constructor"}],
            }]},
        }
        bundle = CompositeProviderAdapter().adapt(raw, "test-provider", NOW_TEXT)
        kinds = {event["event_type"] for event in bundle["events"]}
        self.assertEqual(kinds, {"combat-card", "motorsport"})
        self.assertEqual(bundle["events"][0]["card"]["promotion"], "UFC")
        self.assertEqual(bundle["events"][1]["race"]["circuit"], "Sample Circuit")


if __name__ == "__main__":
    unittest.main()
