from __future__ import annotations

from dataclasses import dataclass, replace

from .auth import SessionManager
from .cache import MemoryCache
from .config import ProviderConfig
from .database import Database
from .gateway import ProviderGateway, build_gateway
from .ingestion import IngestionRunner
from .historical_ingestion import HistoricalStatsIngestor
from .live_updates import LiveUpdateCoordinator
from .observability import Metrics, StructuredLogger
from .odds_ingestion import OddsIngestor
from .provider_manager import ProviderManager
from .providers import FixtureProvider
from .providers import TemplateHttpProvider
from .reconciliation import EntityReconciler
from .research_api import DeterministicResearchService
from .resilience import FixedWindowRateLimiter, RequestCoordinator
from .server_alerts import ServerAlertService
from .workspace_sync import WorkspaceSyncService
from .certification import CertificationService
from .corrections import CorrectionService
from .rollout import RolloutService
from .shadow import ShadowService
from .usage import ProviderUsageMonitor
from .edge_trust import EdgeTrustService
from .provider_contracts import CapabilityRegistry, fixture_capability_registry
from .mlb_schedule_entities import MlbScheduleEntityService, mlb_ticket2_capabilities
from .mlb_standings_leaders import MlbStandingsLeadersService
from .mlb_game_markets import MlbGameMarketService
from .mlb_player_props import MlbPlayerPropService
from .market_movement import MarketMovementService
from .mlb_context import MlbContextService, mlb_ticket8_capabilities
from .mlb_live_state import LivePollingPolicy, MlbLiveStateService, mlb_ticket9_capabilities
from .mlb_certification import MlbCertificationService
from .mlb_shadow_window import MlbShadowWindowService
from .mlb_identity import MlbIdentityService
from .sportsdataio_mlb import (
    SPORTSDATAIO_PROVIDER_ID, SportsDataIoMlbTrialProvider, is_sportsdataio,
    sportsdataio_mlb_shadow_capabilities,
)


@dataclass
class Runtime:
    config: ProviderConfig
    database: Database
    gateway: ProviderGateway
    provider_manager: ProviderManager
    cache: MemoryCache
    ingestion: IngestionRunner
    reconciler: EntityReconciler
    sessions: SessionManager
    workspace_sync: WorkspaceSyncService
    alerts: ServerAlertService
    live_updates: LiveUpdateCoordinator
    research: DeterministicResearchService
    limiter: FixedWindowRateLimiter
    logger: StructuredLogger
    metrics: Metrics
    odds_ingestor: OddsIngestor
    historical_ingestor: HistoricalStatsIngestor
    rollout: RolloutService
    certification: CertificationService
    shadow: ShadowService
    corrections: CorrectionService
    usage: ProviderUsageMonitor
    edge_trust: EdgeTrustService
    capabilities: CapabilityRegistry
    mlb_schedule_entities: MlbScheduleEntityService
    mlb_standings_leaders: MlbStandingsLeadersService
    mlb_game_markets: MlbGameMarketService
    mlb_player_props: MlbPlayerPropService
    market_movement: MarketMovementService
    mlb_context: MlbContextService
    mlb_live_state: MlbLiveStateService
    mlb_certification: MlbCertificationService
    mlb_shadow_window: MlbShadowWindowService
    mlb_identity: MlbIdentityService

    @property
    def live_provider_verified(self) -> bool:
        if not self.config.live_configured:
            return False
        primary_health = self.provider_manager.health.get(self.provider_manager.primary.name)
        if not primary_health or primary_health.successes <= 0:
            return False
        # A successful transport call proves reachability, not production certification.
        return any(
            league["rolloutState"] == "production"
            and any(
                domain["sourceMode"] == "live_verified" and domain["readiness"] == "certified"
                for domain in league["domains"]
            )
            for league in self.rollout.list_coverage(public=True)
        )

    def close(self) -> None:
        self.database.close()


def build_runtime(config: ProviderConfig | None = None) -> Runtime:
    settings = config or ProviderConfig.from_env()
    errors, _warnings = settings.validate()
    if errors:
        from .errors import ConfigurationError
        raise ConfigurationError(" ".join(errors))
    database = Database(settings.database_url)
    database.migrate()
    cache = MemoryCache()
    gateway = build_gateway(settings)
    gateway.cache = cache
    fixture = FixtureProvider()
    secondary = None
    if settings.secondary_name and settings.secondary_base_url and settings.secondary_api_key:
        secondary = TemplateHttpProvider(replace(
            settings,
            name=settings.secondary_name,
            base_url=settings.secondary_base_url,
            api_key=settings.secondary_api_key,
        ))
    coordinator = RequestCoordinator(settings.provider_concurrency)
    rollout_states = dict(settings.league_rollout_states)
    sportsdataio_shadow_enabled = (
        settings.sports_provider_poc_enabled
        and not settings.sports_provider_kill_switch
        and not settings.mlb_kill_switch
        and rollout_states.get("mlb") in {"internal_testing", "shadow"}
        and is_sportsdataio(settings)
    )
    provider_manager = ProviderManager(
        gateway.provider,
        secondary=secondary,
        sample=fixture if settings.sample_fallback_enabled else None,
        coordinator=coordinator,
        failure_threshold=settings.circuit_failure_threshold,
        cooldown_seconds=settings.circuit_cooldown_seconds,
    )
    rollout = RolloutService(
        database, settings.name if sportsdataio_shadow_enabled else "", rollout_states,
    )
    certification = CertificationService(database)
    edge_trust = EdgeTrustService(database)
    shadow = ShadowService(database)
    corrections = CorrectionService(database, cache)
    ingestion = IngestionRunner(database, provider_manager, cache, corrections, rollout)
    mlb_certification = MlbCertificationService(
        database, settings, rollout, shadow, provider_manager,
    )
    mlb_shadow_window = MlbShadowWindowService(database, settings, mlb_certification)
    mlb_identity = MlbIdentityService(database)
    if sportsdataio_shadow_enabled:
        sportsdataio_trial = SportsDataIoMlbTrialProvider(
            settings, cache=cache, request_observer=mlb_shadow_window,
            identity_service=mlb_identity,
        )
        mlb_schedule_entities = MlbScheduleEntityService(
            cache,
            rollout,
            shadow,
            cache_provider_id=SPORTSDATAIO_PROVIDER_ID,
            shadow_validator=sportsdataio_trial.validate_access,
            identity_service=mlb_identity,
        )
        mlb_standings_leaders = MlbStandingsLeadersService(
            cache, database, rollout, shadow,
            shadow_validator=sportsdataio_trial.validate_standings_leaders_access,
        )
        mlb_game_markets = MlbGameMarketService(
            cache, rollout, shadow, mlb_schedule_entities,
            shadow_validator=sportsdataio_trial.validate_odds_access,
        )
        mlb_player_props = MlbPlayerPropService(
            cache, rollout, shadow, mlb_schedule_entities,
            shadow_validator=sportsdataio_trial.validate_player_props_access,
        )
        mlb_context = MlbContextService(
            cache, rollout, shadow, mlb_schedule_entities,
            shadow_validator=sportsdataio_trial.validate_context_access,
        )
        mlb_live_state = MlbLiveStateService(
            cache, rollout, shadow, mlb_schedule_entities,
            shadow_validator=sportsdataio_trial.validate_live_state_access,
            polling_policy=LivePollingPolicy(
                enabled=settings.mlb_live_polling_enabled and not settings.sports_provider_kill_switch and not settings.mlb_kill_switch and not settings.mlb_live_event_kill_switch,
                request_budget=settings.mlb_live_poll_request_budget,
                correction_window_seconds=settings.mlb_live_final_correction_seconds,
            ),
        )
    else:
        mlb_schedule_entities = MlbScheduleEntityService(cache, rollout, shadow, identity_service=mlb_identity)
        mlb_standings_leaders = MlbStandingsLeadersService(cache, database, rollout, shadow)
        mlb_game_markets = MlbGameMarketService(cache, rollout, shadow, mlb_schedule_entities)
        mlb_player_props = MlbPlayerPropService(cache, rollout, shadow, mlb_schedule_entities)
        mlb_context = MlbContextService(cache, rollout, shadow, mlb_schedule_entities)
        mlb_live_state = MlbLiveStateService(
            cache, rollout, shadow, mlb_schedule_entities,
            polling_policy=LivePollingPolicy(
                enabled=settings.mlb_live_polling_enabled and not settings.sports_provider_kill_switch and not settings.mlb_kill_switch and not settings.mlb_live_event_kill_switch,
                request_budget=settings.mlb_live_poll_request_budget,
                correction_window_seconds=settings.mlb_live_final_correction_seconds,
            ),
        )
    mlb_player_props.context_service = mlb_context
    mlb_context.invalidation_callbacks.append(mlb_player_props.invalidate_context_research)
    mlb_live_state.invalidation_callbacks.append(
        lambda event_id: cache.invalidate(tag=f"context:eventId:{event_id}")
    )
    market_movement = MarketMovementService(
        settings.terms, capacity=settings.market_movement_max_snapshots,
        line_threshold=settings.market_movement_line_threshold,
        implied_probability_threshold=settings.market_movement_implied_probability_threshold,
    )
    market_movement.capture_normalized(mlb_game_markets.read(), mlb_player_props.read())
    runtime = Runtime(
        config=settings,
        database=database,
        gateway=gateway,
        provider_manager=provider_manager,
        cache=cache,
        ingestion=ingestion,
        reconciler=EntityReconciler(),
        sessions=SessionManager(database, settings.auth_secret, settings.auth_issuer, settings.auth_audience),
        workspace_sync=WorkspaceSyncService(database),
        alerts=ServerAlertService(database),
        live_updates=LiveUpdateCoordinator(provider_manager, settings.cache_live_ttl_seconds),
        research=DeterministicResearchService(database, settings.flags, mlb_standings_leaders, mlb_game_markets, mlb_player_props, market_movement),
        limiter=FixedWindowRateLimiter(),
        logger=StructuredLogger(level=settings.log_level),
        metrics=Metrics(),
        odds_ingestor=OddsIngestor(database, settings.terms),
        historical_ingestor=HistoricalStatsIngestor(database, cache),
        rollout=rollout,
        certification=certification,
        shadow=shadow,
        corrections=corrections,
        usage=ProviderUsageMonitor(database, {
            "requestsPerHour": settings.provider_request_warning_per_hour,
            "retriesPerHour": settings.provider_retry_warning_per_hour,
            "expensiveRequestsPerHour": settings.provider_expensive_warning_per_hour,
        }),
        edge_trust=edge_trust,
        capabilities=fixture_capability_registry(),
        mlb_schedule_entities=mlb_schedule_entities,
        mlb_standings_leaders=mlb_standings_leaders,
        mlb_game_markets=mlb_game_markets,
        mlb_player_props=mlb_player_props,
        market_movement=market_movement,
        mlb_context=mlb_context,
        mlb_live_state=mlb_live_state,
        mlb_certification=mlb_certification,
        mlb_shadow_window=mlb_shadow_window,
        mlb_identity=mlb_identity,
    )
    for declaration in mlb_ticket2_capabilities():
        runtime.capabilities.register(declaration)
    for declaration in mlb_ticket8_capabilities():
        runtime.capabilities.register(declaration)
    for declaration in mlb_ticket9_capabilities():
        runtime.capabilities.register(declaration)
    if sportsdataio_shadow_enabled:
        for declaration in sportsdataio_mlb_shadow_capabilities():
            runtime.capabilities.register(declaration)
    for league in rollout.list_coverage(public=False):
        edge_trust.evaluate_league(league, trigger="runtime_initialized", record=True)
    return runtime
