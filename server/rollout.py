from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from typing import Any

from .database import Database, utc_now
from .errors import ValidationError
from .provider_contracts import ROLLOUT_DOMAIN_COMPATIBILITY


ROLLOUT_STATES = (
    "disabled", "fixture_only", "internal_testing", "shadow", "limited_live",
    "production", "degraded", "suspended",
)
CERTIFICATION_STATUSES = ("not_started", "failing", "conditional", "passing", "certified", "suspended")
CERTIFICATION_CATEGORIES = ("identity", "schedule", "statistics", "markets", "freshness", "ui", "reliability")
SOURCE_MODES = ("live_verified", "live_partial", "cached_fresh", "cached_stale", "fixture", "sample", "unavailable")
DOMAINS = tuple(ROLLOUT_DOMAIN_COMPATIBILITY)

SAFE_TRANSITIONS = {
    "disabled": {"fixture_only"},
    "fixture_only": {"disabled", "internal_testing"},
    "internal_testing": {"fixture_only", "shadow", "suspended"},
    "shadow": {"fixture_only", "internal_testing", "limited_live", "suspended"},
    "limited_live": {"shadow", "production", "degraded", "suspended"},
    "production": {"limited_live", "degraded", "suspended"},
    "degraded": {"limited_live", "shadow", "production", "suspended"},
    "suspended": {"disabled", "fixture_only", "internal_testing", "shadow"},
}

ROLLOUT_LEAGUES = {
    "mlb": {"sportId": "baseball", "displayName": "MLB", "selectedCompetition": False},
    "wnba": {"sportId": "basketball", "displayName": "WNBA", "selectedCompetition": False},
    "ufc": {"sportId": "mma", "displayName": "UFC", "selectedCompetition": False},
    "mls": {"sportId": "soccer", "displayName": "MLS", "selectedCompetition": True},
}

DOMAIN_LABELS = {
    "entities": "Teams & participants", "schedules": "Schedules", "live_status": "Live status",
    "historical_stats": "Stats", "standings": "Standings", "injuries": "Injuries",
    "lineups": "Lineups", "markets": "Odds", "props": "Props",
    "line_movement": "Line movement", "spatial_data": "Visuals", "media": "Media",
}


@dataclass(frozen=True)
class TransitionResult:
    league_id: str
    previous_state: str
    rollout_state: str
    audited_at: str


class RolloutService:
    def __init__(self, database: Database, provider_name: str = "", configured_states: dict[str, str] | None = None):
        self.database = database
        self.provider_name = provider_name
        self.configured_states = configured_states or {}
        self.ensure_defaults()

    def ensure_defaults(self) -> None:
        now = utc_now()
        with self.database.transaction() as connection:
            for league_id, definition in ROLLOUT_LEAGUES.items():
                limitations = [
                    "No live provider credentials or certification evidence are configured.",
                    "Fixture evidence must not be presented as live data.",
                ]
                if league_id == "mls":
                    limitations.append("MLS is provisional until provider coverage and data-use terms are verified.")
                connection.execute(
                    """INSERT OR IGNORE INTO league_rollouts(
                      league_id,sport_id,display_name,provider,rollout_state,selected_competition,
                      known_limitations_json,health_score,health_state,state_reason,updated_at,updated_by
                    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
                    (
                        league_id, definition["sportId"], definition["displayName"],
                        self.provider_name or None, self.configured_states.get(league_id, "fixture_only"), int(definition["selectedCompetition"]),
                        json.dumps(limitations), 0, "failing",
                        "Recorded fixtures only; no live provider has been verified.", now, "system",
                    ),
                )
                for domain in DOMAINS:
                    available = domain in fixture_domains(league_id)
                    connection.execute(
                        """INSERT OR IGNORE INTO league_domain_readiness(
                          league_id,domain,readiness_state,source_mode,provider,last_updated_at,
                          evidence_json,limitations_json,updated_at
                        ) VALUES(?,?,?,?,?,?,?,?,?)""",
                        (
                            league_id, domain, "conditional" if available else "not_started",
                            "fixture" if available else "unavailable", "edgeboard-phase10-fixture" if available else None,
                            now if available else None,
                            json.dumps({"fixtureVersion": "phase10-v1"} if available else {}),
                            json.dumps([] if available else ["No permitted fixture coverage for this domain."]), now,
                        ),
                    )

    def list_coverage(self, *, public: bool = True) -> list[dict[str, Any]]:
        rollouts = self.database.execute("SELECT * FROM league_rollouts ORDER BY league_id")
        domains = self.database.execute("SELECT * FROM league_domain_readiness ORDER BY league_id,domain")
        states = {row["league_id"]: row["rollout_state"] for row in rollouts}
        by_league: dict[str, list[dict[str, Any]]] = {}
        for row in domains:
            configured_mode = row["source_mode"]
            source_mode = effective_domain_source_mode(states.get(row["league_id"], "disabled"), configured_mode, row["league_id"], row["domain"])
            by_league.setdefault(row["league_id"], []).append({
                "id": row["domain"],
                "label": DOMAIN_LABELS.get(row["domain"], row["domain"].replace("_", " ").title()),
                "readiness": row["readiness_state"],
                "sourceMode": source_mode,
                "publicStatus": public_status(source_mode, row["readiness_state"]),
                "lastUpdatedAt": row["last_updated_at"],
                "provider": row["provider"] or "Not configured",
                "limitations": json.loads(row["limitations_json"]),
                **({"canonicalDomain": ROLLOUT_DOMAIN_COMPATIBILITY[row["domain"]],
                    "evidence": json.loads(row["evidence_json"]), "configuredSourceMode": configured_mode} if not public else {}),
            })
        coverage = []
        for row in rollouts:
            league_domains = by_league.get(row["league_id"], [])
            domain_by_id = {item["id"]: item for item in league_domains}
            certification_categories = []
            for category, domain in (
                ("Schedules", "schedules"), ("Entities", "entities"),
                ("Historical Statistics", "historical_stats"), ("Standings", "standings"),
                ("Markets", "markets"), ("Props", "props"), ("Visualizations", "spatial_data"),
            ):
                item = domain_by_id.get(domain, {})
                certification_categories.append({"category": category, "state": public_certification_state(item.get("readiness", "not_started"), item.get("sourceMode", "unavailable"))})
            historical_state = domain_by_id.get("historical_stats", {}).get("readiness", "not_started")
            certification_categories.extend([
                {"category": "Insights", "state": public_certification_state(historical_state, domain_by_id.get("historical_stats", {}).get("sourceMode", "unavailable"))},
                {"category": "Research", "state": public_certification_state(historical_state, domain_by_id.get("historical_stats", {}).get("sourceMode", "unavailable"))},
                {"category": "Overall", "state": rollout_public_state(row["rollout_state"])},
            ])
            coverage.append({
                "leagueId": row["league_id"], "sportId": row["sport_id"], "displayName": row["display_name"],
                "rolloutState": row["rollout_state"], "dataMode": aggregate_data_mode(row["rollout_state"], league_domains),
                "provider": row["provider"] or "Not configured", "selectedCompetition": bool(row["selected_competition"]),
                "lastUpdatedAt": row["updated_at"], "knownLimitations": json.loads(row["known_limitations_json"]),
                "certificationCategories": certification_categories,
                "domains": league_domains,
                **({"healthScore": row["health_score"], "healthState": row["health_state"], "stateReason": row["state_reason"]} if not public else {}),
            })
        return coverage

    def get(self, league_id: str) -> dict[str, Any]:
        matches = [item for item in self.list_coverage(public=False) if item["leagueId"] == league_id]
        if not matches:
            raise ValidationError("Unknown rollout league.")
        return matches[0]

    def transition(
        self, league_id: str, target_state: str, *, actor: str, reason: str,
        confirmation: str = "", certification_service: Any | None = None,
    ) -> TransitionResult:
        if target_state not in ROLLOUT_STATES:
            raise ValidationError("Unknown rollout state.")
        current = self.get(league_id)
        previous = current["rolloutState"]
        if target_state == previous:
            raise ValidationError("League is already in the requested rollout state.")
        if target_state not in SAFE_TRANSITIONS[previous]:
            raise ValidationError(f"Unsafe rollout transition from {previous} to {target_state}.")
        if target_state == "production":
            if confirmation != f"ACTIVATE {league_id.upper()} PRODUCTION":
                raise ValidationError("Production activation requires the league-specific confirmation phrase.")
            if certification_service is None or not certification_service.production_ready(league_id):
                raise ValidationError("Production activation requires explicit, current league certification.")
            configured_domains = current["domains"]
            live_domains = [item for item in configured_domains if item.get("configuredSourceMode") == "live_verified"]
            mixed_primary = [
                item for item in configured_domains
                if item.get("configuredSourceMode") in {"fixture", "sample", "live_partial", "cached_fresh", "cached_stale"}
            ]
            if not live_domains or any(item["readiness"] != "certified" for item in live_domains) or mixed_primary:
                raise ValidationError("Production activation requires certified live domains without fixture, sample, partial, or cached primary coverage.")
        if not reason.strip():
            raise ValidationError("A rollout state-change reason is required.")
        now = utc_now()
        with self.database.transaction() as connection:
            connection.execute(
                "UPDATE league_rollouts SET rollout_state=?,state_reason=?,updated_at=?,updated_by=? WHERE league_id=?",
                (target_state, reason.strip()[:500], now, actor[:120], league_id),
            )
            connection.execute(
                "INSERT INTO audit_log(id,actor_id,action,target_type,target_id,metadata_json,created_at) VALUES(?,?,?,?,?,?,?)",
                (uuid.uuid4().hex, actor[:120], "rollout_state_changed", "league", league_id,
                 json.dumps({"from": previous, "to": target_state, "reason": reason.strip()[:500]}), now),
            )
        return TransitionResult(league_id, previous, target_state, now)

    def set_domain(
        self, league_id: str, domain: str, readiness: str, source_mode: str,
        *, actor: str, evidence: dict[str, Any] | None = None, limitations: list[str] | None = None,
        provider: str = "",
    ) -> None:
        current = self.get(league_id)
        if domain not in DOMAINS or readiness not in CERTIFICATION_STATUSES or source_mode not in SOURCE_MODES:
            raise ValidationError("Invalid domain-readiness update.")
        if source_mode == "live_verified" and readiness != "certified":
            raise ValidationError("Only a certified domain may be labeled live verified.")
        selected_provider = provider.strip() or (current["provider"] if current["provider"] != "Not configured" else "")
        if source_mode in {"live_verified", "live_partial", "cached_fresh", "cached_stale"}:
            if not selected_provider:
                raise ValidationError("Provider-backed domain coverage requires explicit source attribution.")
            if not evidence:
                raise ValidationError("Provider-backed domain coverage requires structured evidence.")
        now = utc_now()
        with self.database.transaction() as connection:
            connection.execute(
                """UPDATE league_domain_readiness SET readiness_state=?,source_mode=?,provider=?,last_updated_at=?,
                   evidence_json=?,limitations_json=?,updated_at=? WHERE league_id=? AND domain=?""",
                (readiness, source_mode, selected_provider or None, now, json.dumps(evidence or {}), json.dumps(limitations or []), now, league_id, domain),
            )
            connection.execute(
                "INSERT INTO audit_log(id,actor_id,action,target_type,target_id,metadata_json,created_at) VALUES(?,?,?,?,?,?,?)",
                (uuid.uuid4().hex, actor[:120], "rollout_domain_changed", "league_domain", f"{league_id}:{domain}",
                 json.dumps({"readiness": readiness, "sourceMode": source_mode, "provider": selected_provider or None}), now),
            )

    def apply_health(self, league_id: str, score: float, health_state: str, *, actor: str = "health-monitor") -> str:
        current = self.get(league_id)
        target = current["rolloutState"]
        if health_state == "suspended" and target in {"production", "degraded", "limited_live"}:
            target = "suspended"
        elif health_state == "failing" and target == "limited_live":
            target = "shadow"
        elif health_state in {"degraded", "failing"} and target == "production":
            target = "degraded"
        now = utc_now()
        with self.database.transaction() as connection:
            connection.execute(
                "UPDATE league_rollouts SET health_score=?,health_state=?,rollout_state=?,updated_at=?,updated_by=? WHERE league_id=?",
                (max(0, min(100, float(score))), health_state, target, now, actor, league_id),
            )
            if target != current["rolloutState"]:
                connection.execute(
                    "INSERT INTO audit_log(id,actor_id,action,target_type,target_id,metadata_json,created_at) VALUES(?,?,?,?,?,?,?)",
                    (uuid.uuid4().hex, actor, "rollout_health_demotion", "league", league_id,
                     json.dumps({"from": current["rolloutState"], "to": target, "healthState": health_state, "score": score}), now),
                )
        return target

    def switch_provider(self, league_id: str, provider: str, *, actor: str, reason: str) -> None:
        current = self.get(league_id)
        if not provider.strip() or not reason.strip():
            raise ValidationError("Provider switch requires a provider and reason.")
        if current["rolloutState"] not in {"disabled", "fixture_only", "internal_testing", "shadow", "suspended"}:
            raise ValidationError("Provider switches require a safe non-user-primary rollout state.")
        now = utc_now()
        with self.database.transaction() as connection:
            connection.execute("UPDATE league_rollouts SET provider=?,updated_at=?,updated_by=?,state_reason=? WHERE league_id=?", (provider.strip(), now, actor, reason[:500], league_id))
            connection.execute(
                "INSERT INTO audit_log(id,actor_id,action,target_type,target_id,metadata_json,created_at) VALUES(?,?,?,?,?,?,?)",
                (uuid.uuid4().hex, actor, "rollout_provider_switched", "league", league_id, json.dumps({"provider": provider.strip(), "reason": reason[:500]}), now),
            )


def fixture_domains(league_id: str) -> set[str]:
    common = {"entities", "schedules", "historical_stats", "markets", "props"}
    if league_id == "mlb": return common | {"lineups"}
    if league_id == "wnba": return common | {"injuries", "lineups"}
    if league_id == "ufc": return common
    if league_id == "mls": return common | {"standings", "lineups"}
    return set()


def effective_domain_source_mode(state: str, configured_mode: str, league_id: str, domain: str) -> str:
    """Return the user-facing primary source; shadow inputs never become primary implicitly."""
    if state in {"disabled", "suspended"}:
        return "unavailable"
    if state in {"fixture_only", "internal_testing", "shadow"}:
        return "fixture" if configured_mode != "unavailable" and domain in fixture_domains(league_id) else "unavailable"
    if state == "degraded" and configured_mode in {"live_verified", "live_partial"}:
        return "cached_stale"
    return configured_mode

def aggregate_data_mode(state: str, domains: list[dict[str, Any]]) -> str:
    if state in {"disabled", "suspended"}:
        return "unavailable"
    modes = {item.get("sourceMode") for item in domains}
    active = modes - {"unavailable", None}
    if not active:
        return "unavailable"
    if active <= {"fixture", "sample"}:
        return "fixture" if "fixture" in active else "sample"
    if state == "degraded" or "cached_stale" in active:
        return "cached_stale"
    # A league-level card is only fully live when every declared domain is verified live.
    if modes == {"live_verified"}:
        return "live_verified"
    return "live_partial"


def public_status(source_mode: str, readiness: str) -> str:
    if source_mode == "live_verified" and readiness == "certified": return "Live"
    if source_mode in {"live_partial", "cached_fresh"}: return "Partial" if source_mode == "live_partial" else "Delayed"
    if source_mode == "cached_stale": return "Delayed"
    if source_mode in {"fixture", "sample"}: return "Sample"
    if readiness == "not_started": return "Planned"
    return "Unavailable"


def rollout_public_state(state: str) -> str:
    return {
        "disabled": "Disabled", "fixture_only": "Fixture", "internal_testing": "Fixture",
        "shadow": "Shadow", "limited_live": "Limited Live", "production": "Certified Live",
        "degraded": "Degraded", "suspended": "Suspended",
    }.get(state, "Disabled")


def public_certification_state(readiness: str, source_mode: str) -> str:
    if source_mode == "live_verified" and readiness == "certified": return "Certified Live"
    if source_mode == "live_partial": return "Limited Live"
    if source_mode in {"cached_fresh", "cached_stale"}: return "Degraded"
    if source_mode in {"fixture", "sample"}: return "Fixture"
    if readiness == "suspended": return "Suspended"
    return "Disabled"
