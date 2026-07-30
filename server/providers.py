from __future__ import annotations

from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
from typing import Any
from urllib.parse import urljoin

from .config import ProviderConfig
from .errors import ProviderConfigurationError, ProviderValidationError
from .http_client import JsonHttpClient


DOMAIN_METHODS = {
    "league_availability": "get_league_availability",
    "schedules": "get_schedules",
    "live_status": "get_live_status",
    "odds": "get_odds",
    "player_props": "get_player_props",
    "team_statistics": "get_team_statistics",
    "player_statistics": "get_player_statistics",
    "injuries": "get_injuries",
    "lineups": "get_lineups",
    "weather": "get_weather",
    "line_movement": "get_line_movement",
    "combat_cards": "get_combat_cards",
    "motorsport_sessions": "get_motorsport_sessions",
}

EXTENDED_DOMAIN_METHODS = {
    **DOMAIN_METHODS,
    "sport_catalog": "get_sport_catalog",
    "league_catalog": "get_league_catalog",
    "event_details": "get_event_details",
    "entity_search": "search_entities",
    "athlete_profiles": "get_athlete_profiles",
    "teams": "get_teams",
    "rosters": "get_rosters",
    "standings": "get_standings",
    "historical_statistics": "get_historical_statistics",
    "game_logs": "get_game_logs",
    "play_by_play": "get_play_by_play",
    "depth_charts": "get_depth_charts",
    "futures": "get_futures",
    "archived_odds": "get_archived_odds",
    "fighter_statistics": "get_fighter_statistics",
    "lap_data": "get_lap_data",
    "telemetry": "get_telemetry",
    "golf_events": "get_golf_events",
    "tennis_matches": "get_tennis_matches",
    "media": "get_media",
}


class MockProvider:
    name = "edgeboard-mock"
    mode = "sample"

    def __init__(self, now: datetime | None = None):
        self.now = now or datetime.now(timezone.utc)

    def _timestamp(self) -> str:
        return self.now.isoformat().replace("+00:00", "Z")

    def get_league_availability(self) -> Any:
        return {"items": [{
            "league_id": "nba", "status": "active", "today_event_count": 1,
            "upcoming_event_count": 1, "available_market_count": 3, "player_prop_count": 1,
            "data_quality_status": "sample", "updated_at": self._timestamp(), "status_label": "Sample mode",
        }]}

    def get_schedules(self) -> Any:
        starts_at = (self.now + timedelta(hours=2)).isoformat().replace("+00:00", "Z")
        return {"items": [{
            "id": "SAMPLE-AWAY-HOME", "league_id": "nba", "event_type": "team", "status": "scheduled",
            "start_time": starts_at, "away_id": "AWAY", "away_name": "Sample Away", "away_short_name": "AWAY",
            "home_id": "HOME", "home_name": "Sample Home", "home_short_name": "HOME",
            "display": {"spread": "HOME -2.5", "total": "221.5", "edge": "Sample only", "featured": True},
        }]}

    def get_live_status(self) -> Any:
        return {"items": []}

    def get_odds(self) -> Any:
        return {"items": [{
            "id": "sample-moneyline", "league_id": "nba", "event_id": "SAMPLE-AWAY-HOME",
            "market_type": "moneyline", "ui_group": "moneylines", "status": "open", "source_name": "EdgeBoard Mock",
            "updated_at": self._timestamp(), "selections": [
                {"id": "sample-home", "name": "Sample Home", "line": "Moneyline", "odds": -120, "confirmed": True},
                {"id": "sample-away", "name": "Sample Away", "line": "Moneyline", "odds": 105, "confirmed": True},
            ],
        }]}

    def get_player_props(self) -> Any:
        return {"items": [{
            "id": "sample-prop", "league_id": "nba", "event_id": "SAMPLE-AWAY-HOME",
            "market_type": "player-prop", "ui_group": "props", "status": "open", "source_name": "EdgeBoard Mock",
            "updated_at": self._timestamp(), "selections": [{
                "id": "sample-player-points", "name": "Sample Player", "line": "Over 20.5 points",
                "odds": -110, "model_confidence": 58, "confirmed": True, "prop_type": "points",
                "data_quality_warning": "Sample mode — not a live market.",
            }],
        }]}

    def get_team_statistics(self) -> Any: return {"items": []}
    def get_player_statistics(self) -> Any: return {"items": []}
    def get_injuries(self) -> Any: return {"items": []}
    def get_lineups(self) -> Any: return {"items": []}
    def get_weather(self) -> Any: return {"items": []}
    def get_line_movement(self) -> Any: return {"items": []}
    def get_combat_cards(self) -> Any: return {"items": []}
    def get_motorsport_sessions(self) -> Any: return {"items": []}

    def fetch(self, domain: str, scope: dict[str, Any] | None = None) -> Any:
        method_name = EXTENDED_DOMAIN_METHODS.get(domain)
        return getattr(self, method_name)() if method_name and hasattr(self, method_name) else {"items": []}


class OfflineProvider(MockProvider):
    name = "edgeboard-offline"
    mode = "offline"

    def fetch(self, domain: str, scope: dict[str, Any] | None = None) -> Any:
        return {"items": []}

    def __getattribute__(self, name: str):
        if name.startswith("get_"):
            return lambda: {"items": []}
        return super().__getattribute__(name)


class FixtureProvider(MockProvider):
    """Recorded-fixture provider used for contract tests and deployment smoke checks."""

    mode = "sample"

    def __init__(self, fixture_path: str | Path | None = None):
        super().__init__()
        path = Path(fixture_path) if fixture_path else Path(__file__).parent / "fixtures" / "representative_provider.json"
        with path.open("r", encoding="utf-8") as handle:
            self.fixture = json.load(handle)
        self.name = str(self.fixture.get("provider") or "edgeboard-fixture")

    def fetch(self, domain: str, scope: dict[str, Any] | None = None) -> Any:
        payload = self.fixture.get(domain, {"items": []})
        if not scope or not isinstance(payload, dict) or not isinstance(payload.get("items"), list):
            return payload
        league_id = scope.get("leagueId")
        if not league_id:
            return payload
        return {**payload, "items": [
            item for item in payload["items"]
            if item.get("league_id") == league_id or item.get("league_key") == league_id
        ]}

    def __getattribute__(self, name: str):
        if name.startswith("get_"):
            domain = next((domain for domain, method in EXTENDED_DOMAIN_METHODS.items() if method == name), None)
            if domain:
                return lambda: object.__getattribute__(self, "fetch")(domain)
        return super().__getattribute__(name)


class TemplateHttpProvider:
    """Server-only integration template. Subclass or replace its endpoints and adapter for a selected vendor."""

    mode = "live"

    def __init__(self, config: ProviderConfig, client: JsonHttpClient | None = None):
        if not config.live_configured:
            raise ProviderConfigurationError("Live mode requires a provider base URL and API key.")
        self.name = config.name
        self.base_url = config.base_url.rstrip("/") + "/"
        self.headers = {
            config.api_key_header: config.api_key if config.api_key_header.lower() != "authorization" else f"Bearer {config.api_key}",
            "Accept": "application/json",
            "User-Agent": "EdgeBoard-Provider-Gateway/1.0",
        }
        self.client = client or JsonHttpClient(
            config.request_timeout_seconds,
            config.max_retries,
            config.retry_base_seconds,
        )

    def _get(self, domain: str) -> Any:
        endpoint = f"v1/{domain.replace('_', '-')}"
        return self.client.get_json(urljoin(self.base_url, endpoint), self.headers)

    def fetch(self, domain: str, scope: dict[str, Any] | None = None) -> Any:
        if domain not in EXTENDED_DOMAIN_METHODS:
            raise ProviderValidationError(f"Provider domain '{domain}' is unsupported.")
        return self._get(domain)

    def get_league_availability(self) -> Any: return self._get("league_availability")
    def get_schedules(self) -> Any: return self._get("schedules")
    def get_live_status(self) -> Any: return self._get("live_status")
    def get_odds(self) -> Any: return self._get("odds")
    def get_player_props(self) -> Any: return self._get("player_props")
    def get_team_statistics(self) -> Any: return self._get("team_statistics")
    def get_player_statistics(self) -> Any: return self._get("player_statistics")
    def get_injuries(self) -> Any: return self._get("injuries")
    def get_lineups(self) -> Any: return self._get("lineups")
    def get_weather(self) -> Any: return self._get("weather")
    def get_line_movement(self) -> Any: return self._get("line_movement")
    def get_combat_cards(self) -> Any: return self._get("combat_cards")
    def get_motorsport_sessions(self) -> Any: return self._get("motorsport_sessions")
