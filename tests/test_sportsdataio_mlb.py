from __future__ import annotations

import json
import unittest
from copy import deepcopy
from datetime import date

from server.cache import MemoryCache
from server.api import Api
from server.config import ProviderConfig
from server.database import Database
from server.errors import (
    ProviderAuthenticationError, ProviderEndpointError, ProviderEntitlementError,
    ProviderValidationError,
)
from server.mlb_schedule_entities import (
    MlbScheduleEntityAdapter, MlbScheduleEntityService, compare_mlb_shadow,
)
from server.rollout import RolloutService
from server.runtime import build_runtime
from server.shadow import ShadowService
from server.sportsdataio_mlb import (
    SPORTSDATAIO_KEY_HEADER,
    SPORTSDATAIO_PROVIDER_ID,
    SportsDataIoMlbTrialProvider,
    is_sportsdataio,
    sportsdataio_mlb_shadow_capabilities,
)


def config() -> ProviderConfig:
    return ProviderConfig.from_env({
        "EDGEBOARD_ENV": "test",
        "EDGEBOARD_DATA_MODE": "sample",
        "SAMPLE_MODE": "true",
        "SAMPLE_MODE_ENABLED": "true",
        "SPORTS_PROVIDER_ID": "SportsDataIO",
        "SPORTS_PROVIDER_API_KEY": "test-key-never-log",
        "SPORTS_PROVIDER_POC_ENABLED": "true",
        "DATABASE_URL": "sqlite:///:memory:",
    })


class FakeClient:
    def __init__(self, *, fail_teams: bool = False, team_error=None):
        self.calls = []
        self.fail_teams = fail_teams
        self.team_error = team_error

    def get_json(self, url, headers):
        self.calls.append((url, dict(headers)))
        if url.endswith("/AllTeams"):
            if self.team_error:
                raise self.team_error
            if self.fail_teams:
                raise ProviderAuthenticationError("Provider authentication failed.")
            return [
                {"TeamID": 1, "Key": "NYY", "City": "New York", "Name": "Yankees", "FullName": "New York Yankees", "StadiumID": 10, "Manager": "Sample Manager", "Active": True},
                {"TeamID": 2, "Key": "LAD", "City": "Los Angeles", "Name": "Dodgers", "FullName": "Los Angeles Dodgers", "StadiumID": 20, "Active": True},
            ]
        if url.endswith("/Stadiums"):
            return [{"StadiumID": 10, "Name": "Yankee Stadium", "City": "Bronx", "State": "NY", "Active": True}]
        if url.endswith("/Players"):
            return [{"PlayerID": 100, "Name": "Aaron Judge", "Team": "NYY", "Position": "RF", "Status": "Active"}]
        return [{
            "GameID": 500,
            "Day": "2026-08-04T00:00:00",
            "DateTime": "2026-08-04T19:05:00",
            "AwayTeam": "LAD",
            "HomeTeam": "NYY",
            "StadiumID": 10,
            "Status": "InProgress",
            "Updated": "2026-08-04T19:10:00",
        }]


class SportsDataIoTrialTests(unittest.TestCase):
    def test_credentials_alone_do_not_enable_or_call_provider(self):
        settings = ProviderConfig.from_env({
            "EDGEBOARD_ENV": "test", "EDGEBOARD_DATA_MODE": "sample", "SAMPLE_MODE": "true",
            "SAMPLE_MODE_ENABLED": "true", "SPORTS_PROVIDER_ID": "SportsDataIO",
            "SPORTS_PROVIDER_API_KEY": "test-key-never-log", "DATABASE_URL": "sqlite:///:memory:",
        })
        runtime = build_runtime(settings)
        try:
            self.assertIsNone(runtime.mlb_schedule_entities.shadow_validator)
            self.assertEqual(runtime.mlb_schedule_entities.read()["source"]["mode"], "fixture")
            self.assertFalse(runtime.capabilities.diagnostic("sportsdataio", "mlb", "schedules")["declared"])
        finally:
            runtime.close()

    def test_config_detection_requires_provider_and_key(self):
        self.assertTrue(is_sportsdataio(config()))
        self.assertTrue(config().provider_configured)
        shadow_config = ProviderConfig.from_env({
            "EDGEBOARD_DATA_MODE": "sample", "SAMPLE_MODE": "true", "SAMPLE_MODE_ENABLED": "true",
            "SPORTS_PROVIDER_ID": "SportsDataIO", "SPORTS_PROVIDER_API_KEY": "test-key-never-log",
            "MLB_ROLLOUT_STATE": "shadow", "SPORTS_PROVIDER_POC_ENABLED": "true",
        })
        self.assertEqual(shadow_config.validate()[0], ())
        self.assertFalse(is_sportsdataio(ProviderConfig.from_env({"SPORTS_PROVIDER_ID": "SportsDataIO"})))
        capabilities = sportsdataio_mlb_shadow_capabilities()
        self.assertTrue(all(item.live_call_allowed for item in capabilities))
        self.assertTrue(all(not item.user_visible_live for item in capabilities))
        self.assertEqual({item.domain for item in capabilities}, {
            "league_catalog", "teams", "entities", "schedules", "event_status",
            "event_details", "standings", "historical_statistics", "sportsbooks",
            "markets", "odds", "player_props", "injuries", "availability", "rosters",
            "projected_lineups", "confirmed_lineups", "weather", "live_scores",
            "inning_state", "live_participants", "inning_linescore",
        })

    def test_live_state_endpoint_normalizes_through_ticket9_contract(self):
        client = FakeClient()
        payload, endpoints, error = SportsDataIoMlbTrialProvider(
            config(), client, today=date(2026, 8, 4),
        ).validate_live_state_access(selected_date="2026-08-04")
        self.assertIsNone(error); self.assertIsNotNone(payload)
        self.assertIn("BoxScoresByDate", {item["operation"] for item in endpoints})
        self.assertEqual("sample", payload["sourceMode"])
        self.assertNotIn("test-key-never-log", json.dumps(payload))
        self.assertEqual("in_progress", payload["updates"][0]["status"])

    def test_provider_uses_server_header_and_builds_neutral_contract(self):
        client = FakeClient()
        payload = SportsDataIoMlbTrialProvider(config(), client, today=date(2026, 8, 4)).load()
        self.assertEqual(payload["provider"], SPORTSDATAIO_PROVIDER_ID)
        self.assertEqual(payload["sourceMode"], "sample")
        self.assertEqual({item["canonicalId"] for item in payload["entities"] if item["type"] == "team"}, {"NYY", "LAD"})
        self.assertEqual(next(item for item in payload["entities"] if item["type"] == "athlete")["canonicalId"], "mlb-aaron-judge")
        self.assertEqual(payload["games"][0]["status"], "in_progress")
        self.assertTrue(all(item["status"] == "authenticated_available" for item in payload["endpointResults"]))
        self.assertTrue(all(call[1][SPORTSDATAIO_KEY_HEADER] == "test-key-never-log" for call in client.calls))
        self.assertNotIn("test-key-never-log", json.dumps(payload))
        normalized = MlbScheduleEntityAdapter().normalize(payload)
        self.assertEqual(normalized["games"][0]["status"], "live")
        self.assertNotIn("sportsdataio:game:500", json.dumps(normalized["games"]))

    def test_provider_contract_rejects_unsupported_domains(self):
        provider = SportsDataIoMlbTrialProvider(config(), FakeClient(), today=date(2026, 8, 4))
        self.assertEqual(provider.provider_id, "sportsdataio")
        self.assertTrue(provider.supports_domain("schedules", "mlb"))
        self.assertTrue(provider.supports_domain("odds", "mlb"))
        self.assertTrue(provider.supports_domain("props", "mlb"))
        with self.assertRaises(ProviderValidationError):
            provider.fetch("odds")
        self.assertNotIn("test-key-never-log", json.dumps(provider.attribution_metadata()))

    def test_normalization_quarantines_duplicates_missing_and_unknown_records(self):
        diagnostics = {"rejected": [], "unresolved": [], "duplicateProviderRecords": 0}
        teams = SportsDataIoMlbTrialProvider._teams([
            {"TeamID": 1, "Key": "NYY", "FullName": "New York Yankees"},
            {"TeamID": 1, "Key": "NYY", "FullName": "Duplicate"},
            {"TeamID": 2, "Key": "LAD", "FullName": None},
            {"TeamID": 3, "Key": "XYZ", "FullName": "Unknown Club"},
        ], diagnostics)
        self.assertEqual(set(teams), {"NYY"})
        self.assertEqual(diagnostics["duplicateProviderRecords"], 1)
        self.assertEqual({item["code"] for item in diagnostics["rejected"]}, {
            "duplicate_provider_id", "missing_name", "unknown_team_mapping",
        })

    def test_provider_team_alias_maps_to_existing_canonical_identity(self):
        diagnostics = {"rejected": [], "unresolved": [], "duplicateProviderRecords": 0}
        teams = SportsDataIoMlbTrialProvider._teams([
            {"TeamID": 1, "Key": "CHW", "FullName": "Chicago White Sox"},
        ], diagnostics)
        self.assertEqual(set(teams), {"CWS"})
        self.assertEqual(teams["CWS"]["canonicalId"], "CWS")
        self.assertIn("CHW", teams["CWS"]["aliases"])

    def test_players_keep_duplicate_names_distinct_and_tolerate_membership_states(self):
        diagnostics = {"rejected": [], "unresolved": [], "duplicateProviderRecords": 0}
        teams = {"NYY": {"canonicalId": "NYY"}}
        players = SportsDataIoMlbTrialProvider._players([
            {"PlayerID": 1, "Name": "Same Name", "Team": "NYY", "Status": "Active"},
            {"PlayerID": 2, "Name": "Same Name", "Team": None, "Status": "Free Agent"},
            {"PlayerID": 3, "Name": "Inactive Player", "Team": "OLD", "Status": "Inactive"},
            {"PlayerID": None, "Name": "Missing ID"},
        ], teams, diagnostics)
        self.assertEqual(len(players), 3)
        self.assertEqual(len({item["canonicalId"] for item in players}), 3)
        self.assertEqual(players[1]["teamCanonicalId"], "")
        self.assertFalse(players[1]["active"])
        self.assertTrue(players[2]["validationWarnings"])
        self.assertIn("missing_provider_id", {item["code"] for item in diagnostics["rejected"]})

    def test_game_normalization_preserves_unknown_status_and_reschedule_identity(self):
        diagnostics = {"rejected": [], "unresolved": [], "duplicateProviderRecords": 0}
        teams = {
            "NYY": {"providerId": "sportsdataio:team:1"},
            "LAD": {"providerId": "sportsdataio:team:2"},
        }
        base = {
            "GameID": 10, "Day": "2026-08-04T00:00:00", "DateTime": "2026-08-04T19:05:00",
            "AwayTeam": "LAD", "HomeTeam": "NYY", "Status": "Postponed",
        }
        original_id = SportsDataIoMlbTrialProvider._games([base], teams, {}, {
            "rejected": [], "unresolved": [], "duplicateProviderRecords": 0,
        })[0]["canonicalId"]
        games = SportsDataIoMlbTrialProvider._games([
            {**base, "GameID": 9, "Status": "ProviderNewState"},
            base,
            {**base, "GameID": 11, "RescheduledFromGameID": 10, "DateTime": "2026-08-05T19:05:00", "Day": "2026-08-05T00:00:00", "Status": "Scheduled"},
            {**base, "GameID": 12, "DateTime": "invalid"},
        ], teams, {}, diagnostics)
        self.assertEqual(len(games), 2)
        self.assertEqual({item["status"] for item in games}, {"unknown", "scheduled"})
        rescheduled = next(item for item in games if item["status"] == "scheduled")
        self.assertEqual(rescheduled["canonicalId"], original_id)
        self.assertEqual(rescheduled["date"], "2026-08-05")
        self.assertIn("invalid_record", {item["code"] for item in diagnostics["rejected"]})

    def test_shadow_comparison_has_actionable_categories(self):
        fixture = {
            "entities": [{"id": "NYY", "type": "team", "name": "Yankees"}],
            "games": [{
                "id": "g1", "schedule_date": "2026-08-04", "status": "scheduled",
                "starts_at": "2026-08-04T23:00:00Z", "participants": [{"id": "NYY", "role": "home"}],
                "venue": {"id": "v1"}, "doubleheader": {"gameNumber": 1},
            }],
        }
        live = deepcopy(fixture)
        live["entities"][0]["name"] = "Changed Identity"
        live["games"][0].update({"starts_at": "2026-08-05T00:00:00Z", "status": "delayed", "venue": {"id": "v2"}})
        categories = {item["category"] for item in compare_mlb_shadow(fixture, live)}
        self.assertEqual(categories, {"identity_conflict", "time_conflict", "status_conflict", "venue_conflict"})

    def test_trial_is_shadow_only_and_fixture_remains_primary(self):
        provider = SportsDataIoMlbTrialProvider(config(), FakeClient(), today=date(2026, 8, 4))
        database = Database()
        database.migrate()
        try:
            rollout = RolloutService(database, "SportsDataIO", {"mlb": "shadow"})
            shadow = ShadowService(database)
            service = MlbScheduleEntityService(
                MemoryCache(), rollout, shadow,
                cache_provider_id=SPORTSDATAIO_PROVIDER_ID,
                shadow_validator=provider.validate_access,
            )
            source = service.read()["source"]
            self.assertFalse(source["sample"])
            self.assertTrue(source["fixture"])
            self.assertFalse(source["certifiedLive"])
            self.assertEqual(source["provider"], "edgeboard-mlb-contract-fixture")
            report = service.run_shadow_validation()
            self.assertFalse(report["exposedAsPrimary"])
            self.assertTrue(report["normalization"]["accepted"])
            self.assertTrue(report["canonicalIds"]["valid"])
            self.assertFalse(report["canonicalIds"]["providerIdsExposed"])
            self.assertGreater(report["discrepancies"]["recorded"], 0)
            self.assertEqual(report["discrepancies"]["recorded"], shadow.summary("mlb")["total"])
            self.assertNotIn("test-key-never-log", json.dumps(report))
        finally:
            database.close()

    def test_trial_plan_or_auth_failure_preserves_fixture(self):
        database = Database()
        database.migrate()
        try:
            provider = SportsDataIoMlbTrialProvider(config(), FakeClient(fail_teams=True), today=date(2026, 8, 4))
            rollout = RolloutService(database, "SportsDataIO", {"mlb": "shadow"})
            service = MlbScheduleEntityService(
                MemoryCache(), rollout, ShadowService(database),
                cache_provider_id=SPORTSDATAIO_PROVIDER_ID,
                shadow_validator=provider.validate_access,
            )
            primary = service.read()
            report = service.run_shadow_validation()
            self.assertEqual(primary["source"]["mode"], "fixture")
            self.assertFalse(report["normalization"]["accepted"])
            self.assertEqual(next(item for item in report["endpoints"] if item["domain"] == "teams")["status"], "unauthorized")
            self.assertIn("fixture remains primary", report["limitations"][0])
        finally:
            database.close()

    def test_entitlement_and_endpoint_failures_are_distinct_and_safe(self):
        for error, status, plan_limited in (
            (ProviderEntitlementError("not enabled"), "forbidden_by_entitlement", True),
            (ProviderEndpointError("not found"), "invalid_endpoint", False),
        ):
            provider = SportsDataIoMlbTrialProvider(config(), FakeClient(team_error=error), today=date(2026, 8, 4))
            payload, endpoints, returned_error = provider.validate_access()
            team_result = next(item for item in endpoints if item["domain"] == "teams")
            self.assertIsNone(payload)
            self.assertIs(returned_error, error)
            self.assertEqual(team_result["status"], status)
            self.assertEqual(team_result["planLimitationPossible"], plan_limited)
            self.assertNotIn("test-key-never-log", json.dumps(endpoints))

    def test_protected_api_returns_metadata_only_shadow_report(self):
        settings = ProviderConfig.from_env({
            "EDGEBOARD_ENV": "test", "EDGEBOARD_DATA_MODE": "sample", "SAMPLE_MODE": "true",
            "SAMPLE_MODE_ENABLED": "true", "SPORTS_PROVIDER_ID": "SportsDataIO",
            "SPORTS_PROVIDER_API_KEY": "test-key-never-log", "MLB_ROLLOUT_STATE": "shadow",
            "SPORTS_PROVIDER_POC_ENABLED": "true",
            "ADMIN_TOKEN": "admin-test", "DATABASE_URL": "sqlite:///:memory:",
        })
        runtime = build_runtime(settings)
        try:
            provider = SportsDataIoMlbTrialProvider(settings, FakeClient(), today=date(2026, 8, 4))
            runtime.mlb_schedule_entities.shadow_validator = provider.validate_access
            api = Api(runtime)
            denied = api.handle("POST", "/api/admin/mlb/shadow/validate", body=b"{}")[0]
            status, report, _ = api.handle(
                "POST", "/api/admin/mlb/shadow/validate",
                body=json.dumps({"confirmation": "VALIDATE MLB SHADOW"}).encode(),
                headers={"X-EdgeBoard-Admin": "admin-test"},
            )
            self.assertEqual(denied, 403)
            self.assertEqual(status, 200)
            self.assertFalse(report["exposedAsPrimary"])
            self.assertNotIn("entities", report)
            self.assertNotIn("games", report)
            self.assertNotIn("test-key-never-log", json.dumps(report))
            status_code, diagnostics, _ = api.handle(
                "GET", "/api/admin/mlb/shadow/status", headers={"X-EdgeBoard-Admin": "admin-test"},
            )
            self.assertEqual(status_code, 200)
            self.assertEqual(diagnostics["currentRolloutState"], "shadow")
            self.assertFalse(diagnostics["candidateExposedAsPrimary"])
            self.assertNotIn("test-key-never-log", json.dumps(diagnostics))
        finally:
            runtime.close()

    def test_shadow_cache_is_date_aware_and_manual_refresh_bypasses_it(self):
        client = FakeClient()
        shared_cache = MemoryCache()
        provider = SportsDataIoMlbTrialProvider(config(), client, cache=shared_cache, today=date(2026, 8, 4))
        database = Database()
        database.migrate()
        try:
            service = MlbScheduleEntityService(
                shared_cache, RolloutService(database, "SportsDataIO", {"mlb": "shadow"}),
                ShadowService(database), shadow_validator=provider.validate_access,
            )
            service.run_shadow_validation(start_date="2026-08-04", end_date="2026-08-04")
            service.run_shadow_validation(start_date="2026-08-04", end_date="2026-08-04")
            self.assertEqual(service.shadow_provider_requests, 1)
            service.run_shadow_validation(start_date="2026-08-05", end_date="2026-08-05")
            self.assertEqual(service.shadow_provider_requests, 2)
            self.assertEqual(sum(url.endswith("/AllTeams") for url, _headers in client.calls), 1)
            self.assertEqual(sum(url.endswith("/Players") for url, _headers in client.calls), 1)
            self.assertEqual(sum("/GamesByDate/" in url for url, _headers in client.calls), 2)
            service.run_shadow_validation(start_date="2026-08-05", end_date="2026-08-05", refresh=True)
            self.assertEqual(service.shadow_provider_requests, 3)
            self.assertEqual(sum(url.endswith("/AllTeams") for url, _headers in client.calls), 1)
            self.assertEqual(service.shadow_diagnostics()["cache"]["privateEntries"], 3)
        finally:
            database.close()


if __name__ == "__main__":
    unittest.main()
