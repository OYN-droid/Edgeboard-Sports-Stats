from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Any, Iterable


class ProviderDomain(str, Enum):
    SPORT_CATALOG = "sport_catalog"
    LEAGUE_CATALOG = "league_catalog"
    COMPETITION_CATALOG = "competition_catalog"
    SCHEDULES = "schedules"
    EVENT_STATUS = "event_status"
    LIVE_SCORES = "live_scores"
    INNING_STATE = "inning_state"
    LIVE_PARTICIPANTS = "live_participants"
    INNING_LINESCORE = "inning_linescore"
    EVENT_DETAILS = "event_details"
    ENTITIES = "entities"
    TEAMS = "teams"
    ROSTERS = "rosters"
    STANDINGS = "standings"
    INJURIES = "injuries"
    AVAILABILITY = "availability"
    PROJECTED_LINEUPS = "projected_lineups"
    CONFIRMED_LINEUPS = "confirmed_lineups"
    DEPTH_CHARTS = "depth_charts"
    HISTORICAL_STATISTICS = "historical_statistics"
    GAME_LOGS = "game_logs"
    PLAY_BY_PLAY = "play_by_play"
    SPATIAL_EVENTS = "spatial_events"
    MEDIA = "media"
    FIGHTER_PROFILES = "fighter_profiles"
    FIGHT_CARDS = "fight_cards"
    FIGHT_HISTORY = "fight_history"
    ROUND_STATISTICS = "round_statistics"
    DRIVER_PROFILES = "driver_profiles"
    RACE_RESULTS = "race_results"
    RACE_SESSIONS = "race_sessions"
    LAP_POSITIONS = "lap_positions"
    LAP_TIMES = "lap_times"
    TELEMETRY = "telemetry"
    GOLF_EVENTS = "golf_events"
    GOLF_STATISTICS = "golf_statistics"
    TENNIS_EVENTS = "tennis_events"
    TENNIS_STATISTICS = "tennis_statistics"
    SPORTSBOOKS = "sportsbooks"
    MARKETS = "markets"
    ODDS = "odds"
    PLAYER_PROPS = "player_props"
    ALTERNATE_LINES = "alternate_lines"
    FUTURES = "futures"
    LIVE_ODDS = "live_odds"
    ARCHIVED_ODDS = "archived_odds"
    LINE_MOVEMENT = "line_movement"
    MARKET_SUSPENSION = "market_suspension"
    SETTLEMENT_RULES = "settlement_rules"
    WEATHER = "weather"


PROVIDER_DOMAINS = tuple(domain.value for domain in ProviderDomain)

DOMAIN_DESCRIPTIONS = {
    domain.value: description for domain, description in {
        ProviderDomain.SPORT_CATALOG: "Sports offered by a provider.",
        ProviderDomain.LEAGUE_CATALOG: "Leagues offered by a provider.",
        ProviderDomain.COMPETITION_CATALOG: "Competitions and tournament structures.",
        ProviderDomain.SCHEDULES: "Scheduled and rescheduled events.",
        ProviderDomain.EVENT_STATUS: "Canonical lifecycle state for an event.",
        ProviderDomain.LIVE_SCORES: "Current verified scores for in-progress events.",
        ProviderDomain.INNING_STATE: "Current baseball inning, half-inning, outs, and supported count state.",
        ProviderDomain.LIVE_PARTICIPANTS: "Canonical current participants supplied for an in-progress event.",
        ProviderDomain.INNING_LINESCORE: "Provider-supplied inning-by-inning scoring totals.",
        ProviderDomain.EVENT_DETAILS: "Venue, stage, participants, and event metadata.",
        ProviderDomain.ENTITIES: "Canonical participant and organization identity records.",
        ProviderDomain.TEAMS: "Team records and provider identifiers.",
        ProviderDomain.ROSTERS: "Team membership over time.",
        ProviderDomain.STANDINGS: "Competition standings and qualification context.",
        ProviderDomain.INJURIES: "Attributed injury reports and statuses.",
        ProviderDomain.AVAILABILITY: "Participant availability independent of injury cause.",
        ProviderDomain.PROJECTED_LINEUPS: "Unconfirmed expected starters and participants.",
        ProviderDomain.CONFIRMED_LINEUPS: "Provider-confirmed starters and participants.",
        ProviderDomain.DEPTH_CHARTS: "Ordered team depth and role assignments.",
        ProviderDomain.HISTORICAL_STATISTICS: "Completed-event and aggregate statistics.",
        ProviderDomain.GAME_LOGS: "Entity statistics organized by completed event.",
        ProviderDomain.PLAY_BY_PLAY: "Timestamped event actions.",
        ProviderDomain.SPATIAL_EVENTS: "Provider-supplied spatial actions or coordinates.",
        ProviderDomain.MEDIA: "Licensed provider media references and rights metadata.",
        ProviderDomain.FIGHTER_PROFILES: "Combat participant identity and profile data.",
        ProviderDomain.FIGHT_CARDS: "Combat events, bouts, and card ordering.",
        ProviderDomain.FIGHT_HISTORY: "Completed-bout history.",
        ProviderDomain.ROUND_STATISTICS: "Combat statistics scoped to rounds.",
        ProviderDomain.DRIVER_PROFILES: "Driver and rider identity and profile data.",
        ProviderDomain.RACE_RESULTS: "Verified motorsport classifications.",
        ProviderDomain.RACE_SESSIONS: "Practice, qualifying, and race sessions.",
        ProviderDomain.LAP_POSITIONS: "Recorded running position by lap or segment.",
        ProviderDomain.LAP_TIMES: "Recorded lap and sector timing.",
        ProviderDomain.TELEMETRY: "Provider-supplied vehicle telemetry.",
        ProviderDomain.GOLF_EVENTS: "Golf tournaments, fields, rounds, and status.",
        ProviderDomain.GOLF_STATISTICS: "Golf performance statistics.",
        ProviderDomain.TENNIS_EVENTS: "Tennis matches and tournaments.",
        ProviderDomain.TENNIS_STATISTICS: "Tennis match and participant statistics.",
        ProviderDomain.SPORTSBOOKS: "Sportsbook identity and availability.",
        ProviderDomain.MARKETS: "Provider-confirmed market definitions.",
        ProviderDomain.ODDS: "Current prices and lines.",
        ProviderDomain.PLAYER_PROPS: "Participant proposition markets.",
        ProviderDomain.ALTERNATE_LINES: "Alternate thresholds and prices.",
        ProviderDomain.FUTURES: "Long-horizon competition markets.",
        ProviderDomain.LIVE_ODDS: "Prices for in-progress events.",
        ProviderDomain.ARCHIVED_ODDS: "Historical price snapshots.",
        ProviderDomain.LINE_MOVEMENT: "Ordered verified market changes.",
        ProviderDomain.MARKET_SUSPENSION: "Market suspension and reopening state.",
        ProviderDomain.SETTLEMENT_RULES: "Provider settlement scope and rules.",
        ProviderDomain.WEATHER: "Attributed event weather observations or forecasts.",
    }.items()
}

# Existing callers remain valid while new integrations use the canonical vocabulary.
LEGACY_DOMAIN_ALIASES = {
    "league_availability": "availability",
    "live_status": "event_status",
    "entity_search": "entities",
    "athlete_profiles": "entities",
    "team_statistics": "historical_statistics",
    "player_statistics": "historical_statistics",
    "lineups": "projected_lineups",
    "combat_cards": "fight_cards",
    "fighter_statistics": "round_statistics",
    "motorsport_sessions": "race_sessions",
    "lap_data": "lap_positions",
    "tennis_matches": "tennis_events",
    "historical_stats": "historical_statistics",
    "props": "player_props",
    "spatial_data": "spatial_events",
    "pregame_odds": "odds",
}

# Compatibility methods used by the existing provider-data bundle. New adapters may use fetch().
LEGACY_DOMAIN_METHODS = {
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
EXTENDED_LEGACY_DOMAIN_METHODS = {
    **LEGACY_DOMAIN_METHODS,
    "sport_catalog": "get_sport_catalog", "league_catalog": "get_league_catalog",
    "event_details": "get_event_details", "entity_search": "search_entities",
    "athlete_profiles": "get_athlete_profiles", "teams": "get_teams", "rosters": "get_rosters",
    "standings": "get_standings", "historical_statistics": "get_historical_statistics",
    "game_logs": "get_game_logs", "play_by_play": "get_play_by_play",
    "depth_charts": "get_depth_charts", "futures": "get_futures",
    "archived_odds": "get_archived_odds", "fighter_statistics": "get_fighter_statistics",
    "lap_data": "get_lap_data", "telemetry": "get_telemetry", "golf_events": "get_golf_events",
    "tennis_matches": "get_tennis_matches", "media": "get_media",
}

# Phase 10 database/public rollout identifiers are stable API fields. This map lets rollout
# consumers join them to the canonical provider vocabulary without rewriting persisted rows.
ROLLOUT_DOMAIN_COMPATIBILITY = {
    "entities": "entities", "schedules": "schedules", "live_status": "event_status",
    "historical_stats": "historical_statistics", "standings": "standings",
    "injuries": "injuries", "lineups": "projected_lineups", "markets": "markets",
    "props": "player_props", "line_movement": "line_movement",
    "spatial_data": "spatial_events", "media": "media",
}


def canonical_domain(value: str | ProviderDomain) -> str | None:
    candidate = value.value if isinstance(value, ProviderDomain) else str(value or "").strip().lower()
    candidate = LEGACY_DOMAIN_ALIASES.get(candidate, candidate)
    return candidate if candidate in DOMAIN_DESCRIPTIONS else None


SUPPORT_STATES = frozenset({
    "unsupported", "unknown", "documented", "contract_unconfirmed", "fixture_supported",
    "configured", "internal_testing", "shadow", "limited_live", "certified_live",
    "degraded", "suspended",
})
ROLLOUT_STATES = frozenset({
    "disabled", "fixture_only", "internal_testing", "shadow", "limited_live",
    "certified_live", "production", "degraded", "suspended",
})
SOURCE_MODES = frozenset({"sample", "fixture", "live", "cached", "degraded", "offline"})
COMPLETENESS_STATES = frozenset({"complete", "partial", "unknown", "unavailable"})

LIVE_CALL_STATES = frozenset({"internal_testing", "shadow", "limited_live", "certified_live", "degraded"})
LIVE_ROLLOUT_STATES = frozenset({"internal_testing", "shadow", "limited_live", "certified_live", "production", "degraded"})
PUBLIC_LIVE_STATES = frozenset({"limited_live", "certified_live"})


@dataclass(frozen=True)
class CapabilityDeclaration:
    provider_id: str
    sport_id: str
    league_id: str
    domain: str
    support_state: str = "unknown"
    rollout_state: str = "disabled"
    live_call_permission: bool = False
    required_configuration: tuple[str, ...] = ()
    historical_start_date: str | None = None
    freshness_policy: str | None = None
    cache_policy: str | None = None
    retention_policy: str | None = None
    attribution_required: bool = True
    limitations: tuple[str, ...] = ()
    fixture_available: bool = False
    contract_confirmed: bool = False

    def __post_init__(self) -> None:
        resolved = canonical_domain(self.domain)
        if not self.provider_id.strip() or not self.sport_id.strip() or not self.league_id.strip():
            raise ValueError("Capability provider, sport, and league identifiers are required.")
        if resolved is None:
            raise ValueError(f"Unknown provider domain: {self.domain}")
        if self.support_state not in SUPPORT_STATES:
            raise ValueError(f"Invalid provider support state: {self.support_state}")
        if self.rollout_state not in ROLLOUT_STATES:
            raise ValueError(f"Invalid capability rollout state: {self.rollout_state}")
        object.__setattr__(self, "domain", resolved)

    @property
    def live_call_allowed(self) -> bool:
        return (
            self.live_call_permission
            and self.support_state in LIVE_CALL_STATES
            and self.rollout_state in LIVE_ROLLOUT_STATES
            and self.support_state != "suspended"
        )

    @property
    def user_visible_live(self) -> bool:
        return (
            self.support_state in PUBLIC_LIVE_STATES
            and self.rollout_state in PUBLIC_LIVE_STATES | {"production"}
            and self.contract_confirmed
        )


class CapabilityRegistry:
    def __init__(self, declarations: Iterable[CapabilityDeclaration] = ()):
        self._items: dict[tuple[str, str, str], CapabilityDeclaration] = {}
        for declaration in declarations:
            self.register(declaration)

    def register(self, declaration: CapabilityDeclaration) -> None:
        key = (declaration.provider_id, declaration.league_id, declaration.domain)
        if key in self._items:
            raise ValueError(f"Duplicate capability declaration: {':'.join(key)}")
        self._items[key] = declaration

    def get(self, provider_id: str, league_id: str, domain: str) -> CapabilityDeclaration | None:
        resolved = canonical_domain(domain)
        return self._items.get((provider_id, league_id, resolved)) if resolved else None

    def supports(self, provider_id: str, league_id: str, domain: str) -> bool:
        declaration = self.get(provider_id, league_id, domain)
        return bool(declaration and declaration.support_state not in {"unsupported", "unknown", "suspended"})

    def permits_live_call(self, provider_id: str, league_id: str, domain: str) -> bool:
        declaration = self.get(provider_id, league_id, domain)
        return bool(declaration and declaration.live_call_allowed)

    def diagnostic(self, provider_id: str, league_id: str, domain: str) -> dict[str, Any]:
        declaration = self.get(provider_id, league_id, domain)
        if declaration is None:
            return {"declared": False, "liveCallAllowed": False, "userVisibleLive": False,
                    "reason": "Missing or invalid capability declaration; behavior fails closed."}
        return {"declared": True, "supportState": declaration.support_state,
                "rolloutState": declaration.rollout_state, "fixtureAvailable": declaration.fixture_available,
                "liveCallAllowed": declaration.live_call_allowed, "userVisibleLive": declaration.user_visible_live}

    def summary(self, expected: Iterable[tuple[str, str, str]] = ()) -> dict[str, Any]:
        missing = [
            {"providerId": provider_id, "leagueId": league_id, "domain": canonical_domain(domain) or domain}
            for provider_id, league_id, domain in expected
            if self.get(provider_id, league_id, domain) is None
        ]
        providers = sorted({key[0] for key in self._items})
        return {"declarationCount": len(self._items), "providerCount": len(providers),
                "providers": providers, "missingDeclarations": missing,
                "liveCallDeclarationCount": sum(item.live_call_allowed for item in self._items.values()),
                "fixtureDeclarationCount": sum(item.fixture_available for item in self._items.values())}

    def for_provider(self, provider_id: str) -> tuple[CapabilityDeclaration, ...]:
        return tuple(item for key, item in sorted(self._items.items()) if key[0] == provider_id)


@dataclass(frozen=True)
class ProvenanceEnvelope:
    provider_id: str
    source_mode: str
    provider_record_id: str | None = None
    fetched_at: str | None = None
    provider_updated_at: str | None = None
    normalized_at: str | None = None
    validated_at: str | None = None
    expires_at: str | None = None
    freshness_state: str | None = None
    completeness_state: str = "unknown"
    identity_confidence: float | None = None
    correction_status: str | None = None
    fallback_used: bool = False
    fallback_provider_id: str | None = None
    provider_agreement_state: str | None = None
    validation_warnings: tuple[str, ...] = ()
    source_version: str | None = None
    schema_version: str = "1"

    def __post_init__(self) -> None:
        if not self.provider_id.strip():
            raise ValueError("Provenance provider_id is required.")
        if self.source_mode not in SOURCE_MODES:
            raise ValueError(f"Invalid provenance source mode: {self.source_mode}")
        if self.completeness_state not in COMPLETENESS_STATES:
            raise ValueError(f"Invalid provenance completeness state: {self.completeness_state}")
        if self.identity_confidence is not None and not 0 <= self.identity_confidence <= 1:
            raise ValueError("Identity confidence must be between zero and one.")
        for name in ("fetched_at", "provider_updated_at", "normalized_at", "validated_at", "expires_at"):
            value = getattr(self, name)
            if value is not None:
                try:
                    datetime.fromisoformat(value.replace("Z", "+00:00"))
                except (TypeError, ValueError) as error:
                    raise ValueError(f"Invalid provenance timestamp: {name}") from error
        if self.fallback_used and not self.fallback_provider_id:
            raise ValueError("Fallback provenance requires fallback_provider_id.")

    def to_dict(self) -> dict[str, Any]:
        values = {
            "providerId": self.provider_id, "providerRecordId": self.provider_record_id,
            "sourceMode": self.source_mode, "fetchedAt": self.fetched_at,
            "providerUpdatedAt": self.provider_updated_at, "normalizedAt": self.normalized_at,
            "validatedAt": self.validated_at, "expiresAt": self.expires_at,
            "freshnessState": self.freshness_state, "completenessState": self.completeness_state,
            "identityConfidence": self.identity_confidence, "correctionStatus": self.correction_status,
            "fallbackUsed": self.fallback_used, "fallbackProviderId": self.fallback_provider_id,
            "providerAgreementState": self.provider_agreement_state,
            "validationWarnings": list(self.validation_warnings), "sourceVersion": self.source_version,
            "schemaVersion": self.schema_version,
        }
        return {key: value for key, value in values.items() if value is not None}


def provenance_trust_inputs(provenance: ProvenanceEnvelope) -> dict[str, Any]:
    source_state = {
        "sample": "sample", "fixture": "fixture", "live": "verified",
        "cached": "cached_stale" if provenance.freshness_state == "stale" else "cached_fresh",
        "degraded": "degraded", "offline": "unavailable",
    }[provenance.source_mode]
    return {
        "freshness": provenance.freshness_state or source_state,
        "provider_agreement": provenance.provider_agreement_state or "unavailable",
        "identity": {"score": provenance.identity_confidence, "state": "verified"}
        if provenance.identity_confidence is not None else "unavailable",
        "coverage": "partial" if provenance.completeness_state == "partial" else source_state,
    }


def fixture_capability_registry() -> CapabilityRegistry:
    declarations = []
    fixture_domains = (
        "sport_catalog", "league_catalog", "availability", "schedules", "event_status",
        "event_details", "entities", "teams", "rosters", "standings", "historical_statistics",
        "game_logs", "play_by_play", "injuries", "projected_lineups", "depth_charts", "odds",
        "player_props", "futures", "line_movement", "archived_odds", "fight_cards",
        "round_statistics", "race_sessions", "lap_positions", "telemetry", "golf_events",
        "tennis_events", "media", "weather", "live_scores", "inning_state",
        "live_participants", "inning_linescore",
    )
    for provider_id in ("edgeboard-mock", "edgeboard-fixture", "edgeboard-recorded-fixture"):
        for domain in fixture_domains:
            declarations.append(CapabilityDeclaration(
                provider_id, "multi-sport", "sample", domain,
                support_state="fixture_supported", rollout_state="fixture_only",
                fixture_available=True, contract_confirmed=False,
                freshness_policy=domain, cache_policy=domain,
                limitations=("Deterministic fixture data; never live.",),
            ))
    return CapabilityRegistry(declarations)
