from __future__ import annotations

import os
import json
import unittest
from datetime import date

from server.config import ProviderConfig
from server.sportsdataio_mlb import SportsDataIoMlbTrialProvider, is_sportsdataio


@unittest.skipUnless(
    os.environ.get("EDGEBOARD_RUN_LIVE_POC", "").casefold() == "true",
    "Credentialed SportsDataIO POC tests require explicit EDGEBOARD_RUN_LIVE_POC=true opt-in.",
)
class SportsDataIoLivePocTests(unittest.TestCase):
    """Narrow, read-only integration test excluded from ordinary CI and browser tests."""

    def test_current_mlb_schedule_entity_contract(self):
        settings = ProviderConfig.from_env()
        self.assertTrue(settings.sports_provider_poc_enabled)
        self.assertTrue(is_sportsdataio(settings))
        payload, endpoints, error = SportsDataIoMlbTrialProvider(settings).validate_access(
            start_date=date.today(), end_date=date.today(),
        )
        self.assertIsNone(error)
        self.assertIsNotNone(payload)
        self.assertTrue(any(item["domain"] == "teams" and item["status"].startswith("authenticated_") for item in endpoints))
        self.assertTrue(any(item["domain"] == "schedules" and item["status"].startswith("authenticated_") for item in endpoints))

    def test_current_mlb_standings_leader_entitlements(self):
        settings = ProviderConfig.from_env()
        self.assertTrue(settings.sports_provider_poc_enabled)
        self.assertTrue(is_sportsdataio(settings))
        payload, endpoints, error = SportsDataIoMlbTrialProvider(settings).validate_standings_leaders_access(
            season=date.today().year,
        )
        self.assertEqual(
            {item["operation"] for item in endpoints},
            {"Standings", "PlayerSeasonStats", "TeamSeasonStats"},
        )
        self.assertNotIn(settings.api_key, json.dumps(endpoints))
        if payload is not None:
            self.assertEqual(payload["sourceMode"], "sample")
            self.assertNotIn(settings.api_key, json.dumps(payload))
        else:
            self.assertIsNotNone(error)
        print("TICKET4_LIVE_REPORT=" + json.dumps({
            "endpoints": endpoints,
            "normalized": None if payload is None else {
                "standings": len(payload["standings"]),
                "playerStats": len(payload["playerSeasonStats"]),
                "teamStats": len(payload["teamSeasonStats"]),
                "warnings": len(payload.get("providerNormalizationWarnings", [])),
            },
            "errorCode": error.code if error else None,
            "exposedAsPrimary": False,
        }, sort_keys=True))

    def test_current_mlb_pregame_odds_entitlement(self):
        settings = ProviderConfig.from_env()
        self.assertTrue(settings.sports_provider_poc_enabled)
        self.assertTrue(is_sportsdataio(settings))
        payload, endpoints, error = SportsDataIoMlbTrialProvider(settings).validate_odds_access(
            selected_date=date.today().isoformat(),
        )
        self.assertEqual(
            {item["operation"] for item in endpoints},
            {"AllTeams", "GamesByDate", "GameOddsByDate"},
        )
        self.assertNotIn(settings.api_key, json.dumps(endpoints))
        if payload is not None:
            self.assertEqual(payload["sourceMode"], "sample")
            self.assertNotIn(settings.api_key, json.dumps(payload))
        else:
            self.assertIsNotNone(error)
        print("TICKET5_LIVE_REPORT=" + json.dumps({
            "endpoints": endpoints,
            "normalized": None if payload is None else {
                "sportsbooks": len(payload["sportsbooks"]),
                "prices": len(payload["prices"]),
                "families": sorted({item["family"] for item in payload["prices"]}),
                "suspended": sum(item["status"] == "suspended" for item in payload["prices"]),
                "warnings": len(payload.get("providerNormalizationWarnings", [])),
            },
            "errorCode": error.code if error else None,
            "exposedAsPrimary": False,
        }, sort_keys=True))

    def test_current_mlb_player_prop_entitlement(self):
        settings = ProviderConfig.from_env()
        self.assertTrue(settings.sports_provider_poc_enabled)
        self.assertTrue(is_sportsdataio(settings))
        payload, endpoints, error = SportsDataIoMlbTrialProvider(settings).validate_player_props_access(
            selected_date=date.today().isoformat(),
        )
        self.assertTrue({"AllTeams", "Players", "GamesByDate", "BettingPlayerPropsByGame"}.issubset({item["operation"] for item in endpoints}))
        self.assertNotIn(settings.api_key, json.dumps(endpoints))
        if payload is not None:
            self.assertEqual("sample", payload["sourceMode"])
            self.assertNotIn(settings.api_key, json.dumps(payload))
        else:
            self.assertIsNotNone(error)
        print("TICKET6_LIVE_REPORT=" + json.dumps({
            "endpoints": endpoints,
            "normalized": None if payload is None else {
                "sportsbooks": len(payload["sportsbooks"]), "props": len(payload["props"]),
                "families": sorted({item["family"] for item in payload["props"]}),
                "warnings": len(payload.get("providerNormalizationWarnings", [])),
            },
            "errorCode": error.code if error else None, "exposedAsPrimary": False,
        }, sort_keys=True))

    def test_current_mlb_context_entitlements(self):
        settings = ProviderConfig.from_env()
        self.assertTrue(settings.sports_provider_poc_enabled)
        self.assertTrue(is_sportsdataio(settings))
        payload, endpoints, error = SportsDataIoMlbTrialProvider(settings).validate_context_access(
            selected_date=date.today().isoformat(),
        )
        operations = {item["operation"] for item in endpoints}
        self.assertTrue({"Injuries", "StartingLineupsByDate", "Transactions", "GamesByDate"}.issubset(operations))
        self.assertNotIn(settings.api_key, json.dumps(endpoints))
        if payload is not None:
            self.assertEqual("sample", payload["sourceMode"])
            self.assertNotIn(settings.api_key, json.dumps(payload))
        else:
            self.assertIsNotNone(error)
        print("TICKET8_LIVE_REPORT=" + json.dumps({
            "endpoints": endpoints,
            "normalized": None if payload is None else {
                domain: len(payload[domain]) for domain in (
                    "availability", "rosters", "lineups", "starters", "weather", "transactions"
                )
            },
            "rejected": 0 if payload is None else len(payload.get("providerNormalizationWarnings", [])),
            "errorCode": error.code if error else None,
            "exposedAsPrimary": False,
        }, sort_keys=True))

    def test_current_mlb_live_state_entitlement_once(self):
        settings = ProviderConfig.from_env()
        self.assertTrue(settings.sports_provider_poc_enabled)
        self.assertTrue(is_sportsdataio(settings))
        payload, endpoints, error = SportsDataIoMlbTrialProvider(settings).validate_live_state_access(
            selected_date=date.today().isoformat(), event_ids=[],
        )
        self.assertIn("BoxScoresByDate", {item["operation"] for item in endpoints})
        self.assertNotIn(settings.api_key, json.dumps(endpoints))
        if payload is not None:
            self.assertEqual("sample", payload["sourceMode"])
            self.assertNotIn(settings.api_key, json.dumps(payload))
        else:
            self.assertIsNotNone(error)
        print("TICKET9_LIVE_REPORT=" + json.dumps({
            "endpoints": endpoints,
            "normalized": None if payload is None else {
                "states": len(payload["updates"]),
                "coverage": payload.get("capabilityCoverage", {}),
                "warnings": len(payload.get("providerNormalizationWarnings", [])),
            },
            "errorCode": error.code if error else None, "exposedAsPrimary": False,
            "boundedPollCycles": 1,
        }, sort_keys=True))


if __name__ == "__main__":
    unittest.main()
