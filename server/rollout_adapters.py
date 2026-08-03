from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .league_validation import innings_to_outs, validate_league_market


LEAGUE_SPORTS = {"mlb": "baseball", "wnba": "basketball", "ufc": "mma", "mls": "soccer"}


class RolloutFixtureAdapter:
    def __init__(self, path: str | Path | None = None):
        fixture_path = Path(path) if path else Path(__file__).parent / "fixtures" / "phase10_rollout.json"
        with fixture_path.open("r", encoding="utf-8") as handle:
            self.fixture = json.load(handle)
        license_data = self.fixture.get("license", {})
        if not license_data.get("recordingAllowed") or license_data.get("containsSecrets") or license_data.get("containsPersonalData"):
            raise ValueError("Rollout fixture does not satisfy safe-recording policy.")

    @property
    def metadata(self) -> dict[str, Any]:
        return {key: self.fixture.get(key) for key in ("fixtureVersion", "providerSchemaVersion", "provider", "recordedAt", "license")}

    def normalize(self, league_id: str) -> dict[str, Any]:
        if league_id not in LEAGUE_SPORTS:
            raise ValueError("Unsupported rollout league.")
        raw = self.fixture.get("leagues", {}).get(league_id, {})
        prefix = f"{league_id}:"
        entities = [{
            "entity_id": prefix + item["providerId"], "provider_entity_id": item["providerId"],
            "display_name": item["name"], "entity_type": item["type"], "sport_id": LEAGUE_SPORTS[league_id],
            "league_id": league_id, "source_mode": "fixture", "source": self.fixture["provider"],
            **{key: value for key, value in item.items() if key not in {"providerId", "name", "type"}},
        } for item in raw.get("entities", [])]
        entity_ids = {item["provider_entity_id"]: item["entity_id"] for item in entities}
        events = []
        for item in raw.get("events", []):
            event = {
                "event_id": prefix + item["providerId"], "provider_event_id": item["providerId"],
                "league_key": league_id, "event_type": "combat-card" if league_id == "ufc" else "team",
                "status": item["status"], "starts_at": item["startsAt"], "source_mode": "fixture",
                "provider_updated_at": self.fixture["recordedAt"],
                **{_snake(key): value for key, value in item.items() if key not in {"providerId", "startsAt", "status"}},
            }
            for key in ("home_id", "away_id", "probable_pitcher_id"):
                if key in event: event[key] = entity_ids.get(event[key], prefix + str(event[key]))
            if "fighter_ids" in event: event["fighter_ids"] = [entity_ids.get(value, prefix + value) for value in event["fighter_ids"]]
            events.append(event)
        event_ids = {item["provider_event_id"]: item["event_id"] for item in events}
        statistics = []
        for item in raw.get("statistics", []):
            value = item["value"]
            extras = {}
            if item["statId"] == "innings_pitched":
                extras = {"outs_recorded": innings_to_outs(value), "display_value": str(value)}
                value = innings_to_outs(value)
            statistics.append({
                "stat_row_id": prefix + item["providerId"], "league_id": league_id,
                "event_id": event_ids.get(item["eventId"], prefix + item["eventId"]),
                "entity_id": entity_ids.get(item["entityId"], prefix + item["entityId"]),
                "stat_id": item["statId"], "value": value, "unit": "outs" if item["statId"] == "innings_pitched" else item["unit"],
                "event_status": item["status"], "source": self.fixture["provider"], "source_mode": "fixture",
                "provider_updated_at": self.fixture["recordedAt"],
                **({"overtime": bool(item["overtime"])} if "overtime" in item else {}),
                **extras,
            })
        market_items = []
        rejected_markets = []
        for item in raw.get("markets", []):
            market = {
                "offer_id": prefix + item["providerMarketId"], "provider_market_id": item["providerMarketId"],
                "canonical_market_id": item["canonicalMarketId"], "league_id": league_id,
                "event_id": event_ids.get(item["eventId"], prefix + item["eventId"]), "period": item["period"],
                "settlement_scope": item["settlementScope"], "sportsbook_id": item["sportsbookId"],
                "status": item["status"], "source": self.fixture["provider"], "source_mode": "fixture",
                "provider_updated_at": self.fixture["recordedAt"],
                "selections": [{
                    "selection_id": selection["id"], "entity_id": entity_ids.get(selection.get("entityId"), prefix + selection["entityId"]) if selection.get("entityId") else None,
                    "participant_role": selection["participantRole"], "side": selection["side"],
                    "line": selection.get("line"), "american_odds": selection["americanOdds"],
                } for selection in item.get("selections", [])],
                **{_snake(key): value for key, value in item.items() if key in {"scheduledRounds", "fighterIds"}},
            }
            if "fighter_ids" in market: market["fighter_ids"] = [entity_ids.get(value, prefix + value) for value in market["fighter_ids"]]
            event = next((candidate for candidate in events if candidate["event_id"] == market["event_id"]), None)
            valid, errors = validate_league_market(league_id, market, active_event=event)
            if valid: market_items.append(market)
            else: rejected_markets.append({"providerMarketId": item["providerMarketId"], "errors": errors})
        return {
            "league_id": league_id, "sport_id": LEAGUE_SPORTS[league_id], "provider": self.fixture["provider"],
            "fixture_version": self.fixture["fixtureVersion"], "source_mode": "fixture",
            "entities": entities, "events": events, "statistics": statistics, "markets": market_items,
            "rejected_markets": rejected_markets,
            "domain_records": {key: raw.get(key, []) for key in ("injuries", "lineups", "standings")},
        }


def _snake(value: str) -> str:
    output = ""
    for character in value:
        output += ("_" + character.lower()) if character.isupper() else character
    return output
