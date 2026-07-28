from __future__ import annotations

from typing import Any, Protocol


class LeagueAvailabilityProvider(Protocol):
    def get_league_availability(self) -> Any: ...


class ScheduleProvider(Protocol):
    def get_schedules(self) -> Any: ...


class LiveStatusProvider(Protocol):
    def get_live_status(self) -> Any: ...


class OddsProvider(Protocol):
    def get_odds(self) -> Any: ...


class PlayerPropsProvider(Protocol):
    def get_player_props(self) -> Any: ...


class TeamStatisticsProvider(Protocol):
    def get_team_statistics(self) -> Any: ...


class PlayerStatisticsProvider(Protocol):
    def get_player_statistics(self) -> Any: ...


class InjuryProvider(Protocol):
    def get_injuries(self) -> Any: ...


class LineupProvider(Protocol):
    def get_lineups(self) -> Any: ...


class WeatherProvider(Protocol):
    def get_weather(self) -> Any: ...


class LineMovementProvider(Protocol):
    def get_line_movement(self) -> Any: ...


class CombatSportsProvider(Protocol):
    def get_combat_cards(self) -> Any: ...


class MotorsportsProvider(Protocol):
    def get_motorsport_sessions(self) -> Any: ...
