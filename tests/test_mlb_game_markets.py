from __future__ import annotations

import json
import unittest
from copy import deepcopy
from datetime import date, datetime, timezone

from server.api import Api
from server.config import ProviderConfig
from server.errors import ProviderEntitlementError, ProviderValidationError
from server.mlb_game_markets import (
    MlbGameMarketAdapter, american_to_decimal, compare_mlb_market_shadow,
    decimal_to_american, odds_freshness, reconcile_sportsbook,
)
from server.mlb_schedule_entities import MlbScheduleEntityAdapter
from server.runtime import build_runtime
from server.sportsdataio_mlb import SportsDataIoMlbTrialProvider


def sample_config(**extra: str) -> ProviderConfig:
    values = {
        "EDGEBOARD_ENV": "test", "EDGEBOARD_DATA_MODE": "sample",
        "SAMPLE_MODE": "true", "SAMPLE_MODE_ENABLED": "true",
        "DATABASE_URL": "sqlite:///:memory:",
    }
    values.update(extra)
    return ProviderConfig.from_env(values)


class Ticket5FixtureContractTests(unittest.TestCase):
    def setUp(self):
        self.runtime = build_runtime(sample_config())
        self.service = self.runtime.mlb_game_markets
        self.schedule = self.runtime.mlb_schedule_entities.read()
        self.payload = self.service._fixture()

    def tearDown(self):
        self.runtime.close()

    def normalize(self, payload=None, now=None):
        return MlbGameMarketAdapter().normalize(
            payload or self.payload, self.schedule, source_mode="fixture",
            now=now or datetime(2026, 8, 7, 15, tzinfo=timezone.utc),
        )

    def test_odds_conversion_is_stable_and_rejects_malformed_values(self):
        cases = {-150: 1.666667, -110: 1.909091, 100: 2.0, 125: 2.25, 150: 2.5}
        for american, decimal in cases.items():
            with self.subTest(american=american):
                self.assertEqual(american_to_decimal(american), decimal)
                self.assertEqual(decimal_to_american(decimal), american)
        for invalid in (None, True, 0, 99, -99, "bad"):
            self.assertIsNone(american_to_decimal(invalid))
        for invalid in (None, True, 1, 0, float("inf")):
            self.assertIsNone(decimal_to_american(invalid))

    def test_fixture_normalizes_supported_families_and_preserves_doubleheader_identity(self):
        data = self.normalize()
        self.assertEqual((len(data["events"]), len(data["sportsbooks"]), len(data["prices"])), (2, 3, 18))
        self.assertEqual({item["family"] for item in data["prices"]}, {"moneyline", "run_line", "total"})
        self.assertEqual({item["eventId"] for item in data["prices"]}, {
            "mlb-2026-08-04-nyy-lad-1", "mlb-2026-08-05-bos-nyy-2",
        })
        self.assertTrue(all(item["period"] == "full_game" for item in data["prices"]))
        self.assertTrue(all(item["settlementScope"] == "including_extra_innings" for item in data["prices"]))
        self.assertTrue(all(item["isLive"] is False for item in data["prices"]))
        self.assertTrue(all(item["status"] == "available" for item in data["prices"] if item["family"] == "run_line"))

    def test_provider_ids_never_reach_public_market_routes(self):
        api = Api(self.runtime)
        for path, query in (("/api/markets", "leagueId=mlb"), ("/api/sportsbooks", ""), ("/api/best-prices", "leagueId=mlb")):
            status, body, _ = api.handle("GET", path, query=query)
            self.assertEqual(status, 200)
            serialized = json.dumps(body)
            self.assertNotIn("fixture-book-", serialized)
            self.assertNotIn("providerEventId", serialized)

    def test_strict_event_reconciliation_quarantines_wrong_participants_time_and_unknown_event(self):
        payload = deepcopy(self.payload)
        payload["events"][0]["homeTeamId"] = "BOS"
        payload["events"][1]["startsAt"] = "2026-08-06T03:05:00Z"
        payload["events"].append({
            "providerEventId":"unknown", "canonicalEventId":"mlb-unknown", "date":"2026-08-05",
            "startsAt":"2026-08-05T23:05:00Z", "awayTeamId":"BOS", "homeTeamId":"NYY",
        })
        data = self.normalize(payload)
        self.assertEqual(data["events"], [])
        self.assertEqual(sum(item["domain"] == "events" for item in data["rejected"]), 3)
        self.assertEqual(data["prices"], [])

    def test_duplicate_market_and_sportsbook_are_quarantined_without_losing_siblings(self):
        payload = deepcopy(self.payload)
        payload["sportsbooks"].append(deepcopy(payload["sportsbooks"][0]))
        payload["prices"].append(deepcopy(payload["prices"][0]))
        data = self.normalize(payload)
        self.assertEqual(len(data["sportsbooks"]), 3)
        self.assertEqual(len(data["prices"]), 18)
        self.assertEqual({item["code"] for item in data["rejected"]}, {"invalid_sportsbook", "invalid_market"})

    def test_unresolved_sportsbook_and_invalid_odds_fail_closed(self):
        payload = deepcopy(self.payload)
        payload["sportsbooks"][0].update({"canonicalId": None, "reconciliationState": "unresolved", "active": False})
        payload["prices"][6]["americanOdds"] = 0
        data = self.normalize(payload)
        self.assertFalse(data["sportsbooks"][0]["active"])
        self.assertTrue(all(item["sportsbookId"] != "sportsbook-draftkings" for item in data["prices"]))
        self.assertGreater(sum(item["domain"] == "markets" for item in data["rejected"]), 1)

    def test_conflicting_odds_formats_and_invalid_opening_price_are_rejected(self):
        payload = deepcopy(self.payload)
        payload["prices"][0]["decimalOdds"] = 2.5
        payload["prices"][2]["providerOpeningDecimalOdds"] = 1
        data = self.normalize(payload)
        rejected_indexes = {item["index"] for item in data["rejected"] if item["domain"] == "markets"}
        self.assertTrue({0, 2}.issubset(rejected_indexes))

    def test_missing_opposite_side_marks_survivor_unavailable(self):
        payload = deepcopy(self.payload)
        payload["prices"] = [item for item in payload["prices"] if item["providerPriceId"] != "dk-g2-ml-a"]
        data = self.normalize(payload)
        row = next(item for item in data["prices"] if item["eventId"].endswith("bos-nyy-2"))
        self.assertEqual(row["status"], "unavailable")
        self.assertIn("opposite market side", row["validationWarnings"][-1])

    def test_opening_values_are_only_present_when_provider_supplies_them(self):
        data = self.normalize()
        opened = next(item for item in data["prices"] if item["providerOpenedAt"])
        not_opened = next(item for item in data["prices"] if item["sportsbookId"] == "sportsbook-fanduel")
        self.assertEqual(opened["providerOpeningAmericanOdds"], -140)
        self.assertIsNone(opened["earliestObservedAt"])
        self.assertIsNone(not_opened["providerOpeningDecimalOdds"])
        opening_total = next(item for item in data["prices"] if item["providerOpeningLine"] is not None)
        self.assertEqual((opening_total["providerOpeningLine"], opening_total["line"]), (8.0, 8.5))

    def test_alternate_total_is_separate_from_primary_total(self):
        data = self.normalize()
        totals = [item for item in data["prices"] if item["family"] == "total"]
        self.assertEqual({(item["line"], item["isAlternate"]) for item in totals}, {(8.5, False), (9.0, True)})

    def test_freshness_rules_cover_fresh_delayed_stale_expired_and_missing(self):
        start = "2026-08-08T18:00:00Z"
        now = datetime(2026, 8, 8, 17, 30, tzinfo=timezone.utc)
        self.assertEqual(odds_freshness("2026-08-08T17:29:00Z", start, now=now)["state"], "fresh")
        self.assertEqual(odds_freshness("2026-08-08T17:24:00Z", start, now=now)["state"], "delayed")
        self.assertEqual(odds_freshness("2026-08-08T17:10:00Z", start, now=now)["state"], "stale")
        self.assertEqual(odds_freshness("2026-08-08T14:00:00Z", start, now=now)["state"], "expired")
        self.assertEqual(odds_freshness(None, start, now=now)["state"], "unavailable")
        self.assertEqual(odds_freshness("2026-08-08T17:59:00Z", start, now=datetime(2026, 8, 8, 18, tzinfo=timezone.utc))["state"], "expired")

    def test_best_price_compares_exact_markets_and_excludes_suspended(self):
        self.service.read(refresh=True, now=datetime(2026, 8, 4, 14, tzinfo=timezone.utc))
        result = self.service.best_prices(event_id="mlb-2026-08-04-nyy-lad-1")
        home = next(item for item in result["items"] if item["family"] == "moneyline" and item["side"] == "home")
        self.assertEqual(home["best"]["sportsbookId"], "sportsbook-fanduel")
        self.assertEqual(home["sportsbookCount"], 2)
        moneylines = [item for item in result["items"] if item["family"] == "moneyline"]
        self.assertNotIn("sportsbook-betmgm", json.dumps(moneylines))
        home_run_line = next(item for item in result["items"] if item["family"] == "run_line" and item["side"] == "home")
        self.assertEqual(home_run_line["best"]["sportsbookId"], "sportsbook-fanduel")
        self.assertEqual({(item["line"], item["isAlternate"]) for item in result["items"] if item["family"] == "total"}, {(8.5, False), (9.0, True)})

    def test_expired_prices_are_not_actionable_offers_or_best_prices(self):
        offers = self.service.offers()
        self.assertTrue(all(item["status"] != "open" for item in offers))
        self.assertTrue(all(not selection["available"] for item in offers for selection in item["selections"]))
        self.assertEqual(self.service.best_prices()["items"], [])

    def test_bundle_reuses_existing_offer_contract_without_props_or_sgp(self):
        bundle = self.service.provider_bundle({"offers": [], "provider_status": {}})
        self.assertTrue(bundle["offers"])
        self.assertEqual({item["market_type"] for item in bundle["offers"]}, {"moneyline", "run_line", "total"})
        self.assertTrue(all(item["sgp_eligible"] is False for item in bundle["offers"]))

    def test_market_research_is_structured_and_does_not_invent_movement(self):
        body = json.dumps({"structuredQuery": {
            "intent":"market_context", "leagueId":"mlb", "marketFamily":"moneyline",
            "eventId":"mlb-2026-08-04-nyy-lad-1", "action":"explain_move",
        }}).encode()
        status, result, _ = Api(self.runtime).handle("POST", "/api/research", body=body)
        self.assertEqual(status, 200)
        self.assertTrue(result["evidence"])
        self.assertIn("No verified cause", result["message"])
        self.assertFalse(result["llmSourceOfTruth"])

    def test_shadow_comparison_distinguishes_price_status_and_fixture_coverage(self):
        fixture = self.normalize()
        candidate = deepcopy(fixture)
        candidate["prices"][0]["decimalOdds"] += .1
        candidate["prices"][1]["status"] = "suspended"
        candidate["prices"].append({**candidate["prices"][0], "sportsbookId":"sportsbook-caesars", "id":"new"})
        categories = {item["category"] for item in compare_mlb_market_shadow(fixture, candidate)}
        self.assertEqual(categories, {"price_conflict", "status_conflict", "outside_fixture_coverage"})

    def test_cache_avoids_duplicate_fixture_requests(self):
        self.service.read()
        self.service.read()
        self.assertEqual(self.service.provider_requests, 1)


class Ticket5SportsDataIoAdapterTests(unittest.TestCase):
    class Client:
        def __init__(self, *, odds_error=None, include_bad_sibling=False):
            self.calls = []
            self.odds_error = odds_error
            self.include_bad_sibling = include_bad_sibling

        def get_json(self, url, headers):
            self.calls.append((url, dict(headers)))
            if url.endswith("/AllTeams"):
                return [
                    {"TeamID":1,"Key":"NYY","City":"New York","Name":"Yankees","FullName":"New York Yankees","Active":True},
                    {"TeamID":2,"Key":"LAD","City":"Los Angeles","Name":"Dodgers","FullName":"Los Angeles Dodgers","Active":True},
                ]
            if "/GamesByDate/" in url:
                return [{"GameID":500,"Day":"2026-08-07T00:00:00","DateTime":"2026-08-07T19:05:00","AwayTeam":"LAD","HomeTeam":"NYY","Status":"Scheduled","Updated":"2026-08-07T12:00:00"}]
            if "/GameOddsByDate/" in url:
                if self.odds_error:
                    raise self.odds_error
                rows = [{"GameOddId":90,"GameId":500,"SportsbookId":7,"Sportsbook":"DraftKings","Updated":"2026-08-07T12:01:00","HomeMoneyLine":-140,"AwayMoneyLine":125,"HomePointSpread":-1.5,"HomePointSpreadPayout":145,"AwayPointSpread":1.5,"AwayPointSpreadPayout":-165,"OverUnder":8.5,"OverPayout":-105,"UnderPayout":-115,"OddType":"Pregame","Unlisted":False}]
                if self.include_bad_sibling:
                    rows.append({"GameOddId":91,"GameId":500,"Sportsbook":None,"HomeMoneyLine":-110})
                return rows
            return []

    def provider(self, client):
        return SportsDataIoMlbTrialProvider(sample_config(
            SPORTS_PROVIDER_ID="SportsDataIO", SPORTS_PROVIDER_API_KEY="test-key-never-log",
            SPORTS_PROVIDER_POC_ENABLED="true",
        ), client, today=date(2026, 8, 7))

    def test_live_candidate_normalizes_six_prices_without_exposing_secret(self):
        client = self.Client()
        payload, report, error = self.provider(client).validate_odds_access(selected_date="2026-08-07")
        self.assertIsNone(error)
        self.assertEqual((len(payload["sportsbooks"]), len(payload["prices"])), (1, 6))
        self.assertEqual({item["family"] for item in payload["prices"]}, {"moneyline", "run_line", "total"})
        self.assertNotIn("test-key-never-log", json.dumps(payload))
        self.assertEqual({item["status"] for item in report}, {"authenticated_available"})
        self.assertTrue(all(call[1]["Ocp-Apim-Subscription-Key"] == "test-key-never-log" for call in client.calls))
        schedule = MlbScheduleEntityAdapter().normalize(payload["scheduleContract"], source_mode="sample")
        normalized = MlbGameMarketAdapter().normalize(
            payload, schedule, source_mode="sample",
            now=datetime(2026, 8, 7, 16, tzinfo=timezone.utc),
        )
        self.assertEqual(len(normalized["prices"]), 6)
        self.assertEqual(normalized["rejected"], [])

    def test_malformed_odds_sibling_is_quarantined(self):
        payload, _, error = self.provider(self.Client(include_bad_sibling=True)).validate_odds_access(selected_date="2026-08-07")
        self.assertIsNone(error)
        self.assertEqual(len(payload["prices"]), 6)
        self.assertIn("missing_sportsbook_identity", {item["code"] for item in payload["providerNormalizationWarnings"]})

    def test_plan_limitation_preserves_fixture_fallback(self):
        client = self.Client(odds_error=ProviderEntitlementError("Plan does not include odds."))
        payload, report, error = self.provider(client).validate_odds_access(selected_date="2026-08-07")
        self.assertIsNone(payload)
        self.assertIsInstance(error, ProviderEntitlementError)
        odds = next(item for item in report if item["domain"] == "odds")
        self.assertEqual(odds["status"], "forbidden_by_entitlement")
        self.assertTrue(odds["planLimitationPossible"])

    def test_generic_provider_fetch_requires_explicit_date_and_uses_odds_boundary(self):
        provider = self.provider(self.Client())
        with self.assertRaises(ProviderValidationError):
            provider.fetch("odds", {})
        self.assertEqual(len(provider.fetch("odds", {"date":"2026-08-07"})["items"]), 6)

    def test_sportsbook_mapping_is_explicit_and_unknown_books_are_unresolved(self):
        self.assertEqual(reconcile_sportsbook("7", "DraftKings")["canonicalId"], "sportsbook-draftkings")
        unknown = reconcile_sportsbook("99", "Unknown Book")
        self.assertIsNone(unknown["canonicalId"])
        self.assertFalse(unknown["active"])


if __name__ == "__main__":
    unittest.main()
