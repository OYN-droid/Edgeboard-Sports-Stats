from __future__ import annotations

from datetime import datetime, timezone
from typing import Any


def _items(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if isinstance(payload, dict) and isinstance(payload.get("items"), list):
        return [item for item in payload["items"] if isinstance(item, dict)]
    return []


class LeagueAvailabilityAdapter:
    def adapt(self, payload: Any) -> list[dict[str, Any]]:
        return [{
            "league_key": item.get("league_key") or item.get("league_id"),
            "availability_status": item.get("availability_status") or item.get("status") or "unavailable",
            "live_event_count": item.get("live_event_count", 0),
            "today_event_count": item.get("today_event_count", 0),
            "upcoming_event_count": item.get("upcoming_event_count", 0),
            "available_market_count": item.get("available_market_count", 0),
            "player_prop_count": item.get("player_prop_count", 0),
            "data_quality_status": item.get("data_quality_status", "unknown"),
            "last_updated_at": item.get("last_updated_at") or item.get("updated_at"),
            "status_label": item.get("status_label", ""),
        } for item in _items(payload)]


class ScheduleAdapter:
    def adapt(self, payload: Any) -> list[dict[str, Any]]:
        events = []
        for item in _items(payload):
            participants = item.get("participants")
            if not isinstance(participants, list):
                participants = [
                    {"id": item.get("away_id"), "name": item.get("away_name"), "short_name": item.get("away_short_name"), "role": "away", "participant_type": "team"},
                    {"id": item.get("home_id"), "name": item.get("home_name"), "short_name": item.get("home_short_name"), "role": "home", "participant_type": "team"},
                ]
                participants = [participant for participant in participants if participant.get("id") or participant.get("name")]
            events.append({
                "event_id": item.get("event_id") or item.get("id"),
                "league_key": item.get("league_key") or item.get("league_id"),
                "event_type": item.get("event_type", "team"),
                "status": item.get("status", "scheduled"),
                "starts_at": item.get("starts_at") or item.get("start_time"),
                "participants": participants,
                "venue": item.get("venue"),
                "tournament": item.get("tournament"),
                "team_game": item.get("team_game"),
                "soccer": item.get("soccer"),
                "card": item.get("card"),
                "race": item.get("race"),
                "display": item.get("display", {}),
            })
        return events


class LiveStatusAdapter:
    def adapt(self, payload: Any) -> dict[str, dict[str, Any]]:
        return {
            str(item.get("event_id") or item.get("id")): {
                "status": item.get("status", "unknown"),
                "starts_at": item.get("starts_at") or item.get("start_time"),
                "live_state": item.get("live_state"),
            }
            for item in _items(payload)
            if item.get("event_id") or item.get("id")
        }


class OddsAdapter:
    def adapt(self, payload: Any, default_group: str = "moneylines") -> list[dict[str, Any]]:
        offers = []
        for item in _items(payload):
            selections = []
            for index, selection in enumerate(item.get("selections") if isinstance(item.get("selections"), list) else []):
                selections.append({
                    "selection_id": selection.get("selection_id") or selection.get("id") or f"{item.get('id', 'offer')}-{index}",
                    "participant": selection.get("participant"),
                    "label": selection.get("label") or selection.get("name"),
                    "line_display": selection.get("line_display") or selection.get("line"),
                    "american_odds": selection.get("american_odds") if "american_odds" in selection else selection.get("odds"),
                    "sportsbook": selection.get("sportsbook") or item.get("source_name"),
                    "last_updated_at": selection.get("last_updated_at") or item.get("updated_at"),
                    "projection_display": selection.get("projection_display"),
                    "model_confidence": selection.get("model_confidence"),
                    "trend_summary": selection.get("trend_summary"),
                    "matchup_summary": selection.get("matchup_summary"),
                    "edge_summary": selection.get("edge_summary"),
                    "analysis_note": selection.get("analysis_note"),
                    "data_quality_warning": selection.get("data_quality_warning", ""),
                    "team_id": selection.get("team_id", ""),
                    "opponent_id": selection.get("opponent_id", ""),
                    "prop_type": selection.get("prop_type") or item.get("market_type"),
                    "confirmed": selection.get("confirmed", False),
                    "available": selection.get("available", True),
                })
            offers.append({
                "offer_id": item.get("offer_id") or item.get("id"),
                "league_key": item.get("league_key") or item.get("league_id"),
                "event_id": item.get("event_id"),
                "market_type": item.get("market_type", "moneyline"),
                "ui_group": item.get("ui_group", default_group),
                "status": item.get("status", "open"),
                "selections": selections,
            })
        return offers


class CombatSportsAdapter:
    def adapt(self, payload: Any) -> list[dict[str, Any]]:
        return [{
            "event_id": item.get("event_id") or item.get("card_id") or item.get("id"),
            "league_key": item.get("league_key") or item.get("promotion_id"),
            "event_type": "combat-card",
            "status": item.get("status", "scheduled"),
            "starts_at": item.get("starts_at") or item.get("start_time"),
            "participants": item.get("participants") if isinstance(item.get("participants"), list) else [],
            "venue": item.get("venue"),
            "card": {
                "promotion": item.get("promotion"),
                "event_name": item.get("event_name") or item.get("name"),
                "main_event": item.get("main_event"),
                "co_main_event": item.get("co_main_event"),
                "undercard": item.get("undercard") if isinstance(item.get("undercard"), list) else [],
                "weigh_in_status": item.get("weigh_in_status"),
                "card_status": item.get("card_status"),
                "data_quality_warning": item.get("data_quality_warning", ""),
            },
            "display": item.get("display", {"title": item.get("event_name") or item.get("name"), "featured": True}),
        } for item in _items(payload)]


class MotorsportsAdapter:
    def adapt(self, payload: Any) -> list[dict[str, Any]]:
        return [{
            "event_id": item.get("event_id") or item.get("weekend_id") or item.get("id"),
            "league_key": item.get("league_key") or item.get("series_id"),
            "event_type": "motorsport",
            "status": item.get("status", "scheduled"),
            "starts_at": item.get("starts_at") or item.get("race_start_time"),
            "participants": item.get("competitors") if isinstance(item.get("competitors"), list) else [],
            "venue": item.get("venue"),
            "race": {
                "series": item.get("series"),
                "event_name": item.get("event_name") or item.get("name"),
                "circuit": item.get("circuit") or item.get("track"),
                "location": item.get("location"),
                "sessions": item.get("sessions") if isinstance(item.get("sessions"), dict) else {},
                "entrants": item.get("competitors") if isinstance(item.get("competitors"), list) else [],
                "weather": item.get("weather"),
            },
            "display": item.get("display", {"title": item.get("event_name") or item.get("name"), "featured": True}),
        } for item in _items(payload)]


class PassthroughAdapter:
    def adapt(self, payload: Any) -> list[dict[str, Any]]:
        return _items(payload)


class CompositeProviderAdapter:
    """Combines domain adapters into the vendor-neutral payload consumed by EdgeBoard."""

    def __init__(self):
        self.leagues = LeagueAvailabilityAdapter()
        self.schedules = ScheduleAdapter()
        self.live = LiveStatusAdapter()
        self.odds = OddsAdapter()
        self.combat = CombatSportsAdapter()
        self.motorsports = MotorsportsAdapter()
        self.passthrough = PassthroughAdapter()

    def adapt(self, raw: dict[str, Any], provider_name: str, generated_at: str | None = None) -> dict[str, Any]:
        combat_events = self.combat.adapt(raw.get("combat_cards"))
        motorsport_events = self.motorsports.adapt(raw.get("motorsport_sessions"))
        events = [
            *self.schedules.adapt(raw.get("schedules")),
            *combat_events,
            *motorsport_events,
        ]
        live = self.live.adapt(raw.get("live_status"))
        for event in events:
            update = live.get(str(event.get("event_id")))
            if update:
                event.update({key: value for key, value in update.items() if value is not None})
        timestamp = generated_at or datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        return {
            "provider": provider_name,
            "generated_at": timestamp,
            "league_statuses": self.leagues.adapt(raw.get("league_availability")),
            "events": events,
            "offers": [
                *self.odds.adapt(raw.get("odds"), "moneylines"),
                *self.odds.adapt(raw.get("player_props"), "props"),
            ],
            "team_statistics": self.passthrough.adapt(raw.get("team_statistics")),
            "player_statistics": self.passthrough.adapt(raw.get("player_statistics")),
            "injuries": self.passthrough.adapt(raw.get("injuries")),
            "lineups": self.passthrough.adapt(raw.get("lineups")),
            "weather": self.passthrough.adapt(raw.get("weather")),
            "line_movements": self.passthrough.adapt(raw.get("line_movement")),
            "combat_cards": combat_events,
            "motorsport_sessions": motorsport_events,
            "aliases": raw.get("aliases") if isinstance(raw.get("aliases"), dict) else {},
        }
