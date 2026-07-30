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

    @property
    def live_provider_verified(self) -> bool:
        if not self.config.live_configured:
            return False
        primary_health = self.provider_manager.health.get(self.provider_manager.primary.name)
        return bool(primary_health and primary_health.successes > 0)

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
    provider_manager = ProviderManager(
        gateway.provider,
        secondary=secondary,
        sample=fixture if settings.sample_fallback_enabled else None,
        coordinator=coordinator,
        failure_threshold=settings.circuit_failure_threshold,
        cooldown_seconds=settings.circuit_cooldown_seconds,
    )
    return Runtime(
        config=settings,
        database=database,
        gateway=gateway,
        provider_manager=provider_manager,
        cache=cache,
        ingestion=IngestionRunner(database, provider_manager, cache),
        reconciler=EntityReconciler(),
        sessions=SessionManager(database, settings.auth_secret, settings.auth_issuer, settings.auth_audience),
        workspace_sync=WorkspaceSyncService(database),
        alerts=ServerAlertService(database),
        live_updates=LiveUpdateCoordinator(provider_manager, settings.cache_live_ttl_seconds),
        research=DeterministicResearchService(database, settings.flags),
        limiter=FixedWindowRateLimiter(),
        logger=StructuredLogger(level=settings.log_level),
        metrics=Metrics(),
        odds_ingestor=OddsIngestor(database, settings.terms),
        historical_ingestor=HistoricalStatsIngestor(database, cache),
    )
