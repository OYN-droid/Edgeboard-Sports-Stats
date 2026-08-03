from __future__ import annotations

import os
from dataclasses import asdict, dataclass, field
from typing import Mapping


TRUE_VALUES = {"1", "true", "yes", "on"}
APP_ENVS = {"development", "test", "staging", "production"}
DATA_MODES = {"sample", "live", "hybrid", "degraded", "offline"}
ROLLOUT_STATE_VALUES = {"disabled", "fixture_only", "internal_testing", "shadow", "limited_live", "production", "degraded", "suspended"}
ROLLOUT_LEAGUE_IDS = ("mlb", "wnba", "ufc", "mls")


def _bool(env: Mapping[str, str], name: str, default: bool = False) -> bool:
    value = env.get(name)
    return default if value is None else value.strip().lower() in TRUE_VALUES


def _float(env: Mapping[str, str], name: str, default: float) -> float:
    try:
        return float(env.get(name, default))
    except (TypeError, ValueError):
        return default


def _int(env: Mapping[str, str], name: str, default: int) -> int:
    try:
        return int(env.get(name, default))
    except (TypeError, ValueError):
        return default


def _csv(env: Mapping[str, str], name: str, default: str = "") -> tuple[str, ...]:
    return tuple(dict.fromkeys(part.strip() for part in env.get(name, default).split(",") if part.strip()))


@dataclass(frozen=True)
class FeatureFlags:
    live_data_enabled: bool = False
    live_odds_enabled: bool = False
    historical_stats_enabled: bool = False
    injuries_enabled: bool = False
    lineups_enabled: bool = False
    cloud_workspace_sync_enabled: bool = False
    server_alerts_enabled: bool = False
    ai_explanations_enabled: bool = False
    visual_telemetry_enabled: bool = False
    sample_mode_enabled: bool = True
    league_rollout_enabled: bool = True
    coverage_page_enabled: bool = True

    def public(self) -> dict[str, bool]:
        return asdict(self)


@dataclass(frozen=True)
class ProviderTerms:
    attribution_required: bool = True
    raw_payload_retention_allowed: bool = False
    normalized_retention_allowed: bool = True
    odds_history_storage_allowed: bool = False
    public_redistribution_allowed: bool = False
    logo_use_allowed: bool = False
    media_use_allowed: bool = False
    maximum_cache_duration: int = 3600


@dataclass(frozen=True)
class ProviderConfig:
    app_env: str
    app_base_url: str
    api_base_url: str
    log_level: str
    data_mode: str
    sample_mode: bool
    name: str
    base_url: str
    api_key: str
    api_key_header: str
    secondary_name: str
    secondary_base_url: str
    secondary_api_key: str
    odds_name: str
    odds_base_url: str
    odds_api_key: str
    secondary_odds_name: str
    secondary_odds_base_url: str
    secondary_odds_api_key: str
    request_timeout_seconds: float
    max_retries: int
    retry_base_seconds: float
    provider_concurrency: int
    circuit_failure_threshold: int
    circuit_cooldown_seconds: int
    cache_ttl_seconds: int
    cache_live_ttl_seconds: int
    cache_stale_seconds: int
    cache_url: str
    database_url: str
    auth_secret: str
    auth_issuer: str
    auth_audience: str
    error_reporting_dsn: str
    metrics_enabled: bool
    allowed_origins: tuple[str, ...]
    admin_token: str
    request_body_limit_bytes: int
    league_rollout_states: tuple[tuple[str, str], ...]
    provider_request_warning_per_hour: int
    provider_retry_warning_per_hour: int
    provider_expensive_warning_per_hour: int
    host: str
    port: int
    flags: FeatureFlags = field(default_factory=FeatureFlags)
    terms: ProviderTerms = field(default_factory=ProviderTerms)

    @classmethod
    def from_env(cls, source: Mapping[str, str] | None = None) -> "ProviderConfig":
        env = source if source is not None else os.environ
        app_env = env.get("APP_ENV", "development").strip().lower()
        data_mode = env.get("DATA_MODE", env.get("EDGEBOARD_PROVIDER_MODE", "sample")).strip().lower()
        sample_mode = _bool(env, "SAMPLE_MODE", data_mode == "sample")
        live_data = _bool(env, "LIVE_DATA_ENABLED", data_mode in {"live", "hybrid"})
        live_odds = _bool(env, "LIVE_ODDS_ENABLED", False)
        flags = FeatureFlags(
            live_data_enabled=live_data,
            live_odds_enabled=live_odds,
            historical_stats_enabled=_bool(env, "HISTORICAL_STATS_ENABLED"),
            injuries_enabled=_bool(env, "INJURIES_ENABLED"),
            lineups_enabled=_bool(env, "LINEUPS_ENABLED"),
            cloud_workspace_sync_enabled=_bool(env, "CLOUD_WORKSPACE_SYNC_ENABLED"),
            server_alerts_enabled=_bool(env, "SERVER_ALERTS_ENABLED"),
            ai_explanations_enabled=_bool(env, "AI_EXPLANATIONS_ENABLED"),
            visual_telemetry_enabled=_bool(env, "VISUAL_TELEMETRY_ENABLED"),
            sample_mode_enabled=_bool(env, "SAMPLE_MODE_ENABLED", True),
            league_rollout_enabled=_bool(env, "LEAGUE_ROLLOUT_ENABLED", True),
            coverage_page_enabled=_bool(env, "COVERAGE_PAGE_ENABLED", True),
        )
        terms = ProviderTerms(
            attribution_required=_bool(env, "PROVIDER_ATTRIBUTION_REQUIRED", True),
            raw_payload_retention_allowed=_bool(env, "PROVIDER_RAW_RETENTION_ALLOWED"),
            normalized_retention_allowed=_bool(env, "PROVIDER_NORMALIZED_RETENTION_ALLOWED", True),
            odds_history_storage_allowed=_bool(env, "PROVIDER_ODDS_HISTORY_ALLOWED"),
            public_redistribution_allowed=_bool(env, "PROVIDER_PUBLIC_REDISTRIBUTION_ALLOWED"),
            logo_use_allowed=_bool(env, "PROVIDER_LOGO_USE_ALLOWED"),
            media_use_allowed=_bool(env, "PROVIDER_MEDIA_USE_ALLOWED"),
            maximum_cache_duration=max(1, _int(env, "PROVIDER_MAX_CACHE_SECONDS", 3600)),
        )
        return cls(
            app_env=app_env if app_env in APP_ENVS else "development",
            app_base_url=env.get("APP_BASE_URL", "http://127.0.0.1:9010").strip(),
            api_base_url=env.get("API_BASE_URL", "/api").strip() or "/api",
            log_level=env.get("LOG_LEVEL", "INFO").strip().upper() or "INFO",
            data_mode=data_mode if data_mode in DATA_MODES else "sample",
            sample_mode=sample_mode,
            name=env.get("SPORTS_PROVIDER_NAME", env.get("EDGEBOARD_PROVIDER_NAME", "edgeboard-fixture")).strip() or "edgeboard-fixture",
            base_url=env.get("SPORTS_PROVIDER_BASE_URL", env.get("EDGEBOARD_PROVIDER_BASE_URL", "")).strip(),
            api_key=env.get("SPORTS_PROVIDER_API_KEY", env.get("EDGEBOARD_PROVIDER_API_KEY", "")).strip(),
            api_key_header=env.get("SPORTS_PROVIDER_API_KEY_HEADER", env.get("EDGEBOARD_PROVIDER_API_KEY_HEADER", "Authorization")).strip() or "Authorization",
            secondary_name=env.get("SECONDARY_SPORTS_PROVIDER_NAME", "").strip(),
            secondary_base_url=env.get("SECONDARY_SPORTS_PROVIDER_BASE_URL", "").strip(),
            secondary_api_key=env.get("SECONDARY_SPORTS_PROVIDER_API_KEY", "").strip(),
            odds_name=env.get("ODDS_PROVIDER_NAME", "").strip(),
            odds_base_url=env.get("ODDS_PROVIDER_BASE_URL", "").strip(),
            odds_api_key=env.get("ODDS_PROVIDER_API_KEY", "").strip(),
            secondary_odds_name=env.get("SECONDARY_ODDS_PROVIDER_NAME", "").strip(),
            secondary_odds_base_url=env.get("SECONDARY_ODDS_PROVIDER_BASE_URL", "").strip(),
            secondary_odds_api_key=env.get("SECONDARY_ODDS_PROVIDER_API_KEY", "").strip(),
            request_timeout_seconds=max(0.25, _float(env, "PROVIDER_REQUEST_TIMEOUT_SECONDS", _float(env, "EDGEBOARD_REQUEST_TIMEOUT_SECONDS", 5.0))),
            max_retries=max(0, _int(env, "PROVIDER_MAX_RETRIES", _int(env, "EDGEBOARD_MAX_RETRIES", 2))),
            retry_base_seconds=max(0.0, _float(env, "PROVIDER_RETRY_BASE_SECONDS", _float(env, "EDGEBOARD_RETRY_BASE_SECONDS", 0.25))),
            provider_concurrency=max(1, _int(env, "PROVIDER_CONCURRENCY", 4)),
            circuit_failure_threshold=max(1, _int(env, "PROVIDER_CIRCUIT_FAILURE_THRESHOLD", 3)),
            circuit_cooldown_seconds=max(1, _int(env, "PROVIDER_CIRCUIT_COOLDOWN_SECONDS", 30)),
            cache_ttl_seconds=max(1, _int(env, "CACHE_TTL_DEFAULT", _int(env, "EDGEBOARD_CACHE_TTL_SECONDS", 60))),
            cache_live_ttl_seconds=max(1, _int(env, "CACHE_TTL_LIVE", 8)),
            cache_stale_seconds=max(1, _int(env, "CACHE_STALE_SECONDS", _int(env, "EDGEBOARD_CACHE_STALE_SECONDS", 3600))),
            cache_url=env.get("CACHE_URL", "").strip(),
            database_url=env.get("DATABASE_URL", "sqlite:///:memory:").strip() or "sqlite:///:memory:",
            auth_secret=env.get("AUTH_SECRET", "").strip(),
            auth_issuer=env.get("AUTH_ISSUER", "edgeboard").strip() or "edgeboard",
            auth_audience=env.get("AUTH_AUDIENCE", "edgeboard-web").strip() or "edgeboard-web",
            error_reporting_dsn=env.get("ERROR_REPORTING_DSN", "").strip(),
            metrics_enabled=_bool(env, "METRICS_ENABLED", True),
            allowed_origins=_csv(env, "ALLOWED_ORIGINS", "http://127.0.0.1:9010,http://localhost:9010"),
            admin_token=env.get("ADMIN_TOKEN", "").strip(),
            request_body_limit_bytes=max(1024, _int(env, "REQUEST_BODY_LIMIT_BYTES", 262_144)),
            league_rollout_states=tuple(
                (league_id, env.get(f"{league_id.upper()}_ROLLOUT_STATE", "fixture_only").strip().lower())
                for league_id in ROLLOUT_LEAGUE_IDS
            ),
            provider_request_warning_per_hour=max(1, _int(env, "PROVIDER_REQUEST_WARNING_PER_HOUR", 5000)),
            provider_retry_warning_per_hour=max(1, _int(env, "PROVIDER_RETRY_WARNING_PER_HOUR", 250)),
            provider_expensive_warning_per_hour=max(1, _int(env, "PROVIDER_EXPENSIVE_WARNING_PER_HOUR", 100)),
            host=env.get("EDGEBOARD_SERVER_HOST", "127.0.0.1").strip() or "127.0.0.1",
            port=max(1, _int(env, "EDGEBOARD_SERVER_PORT", 9010)),
            flags=flags,
            terms=terms,
        )

    @property
    def mode(self) -> str:
        return self.data_mode

    @property
    def live_configured(self) -> bool:
        return self.flags.live_data_enabled and bool(self.base_url and self.api_key)

    @property
    def sample_fallback_enabled(self) -> bool:
        return self.flags.sample_mode_enabled and self.data_mode in {"sample", "hybrid", "degraded"}

    def validate(self) -> tuple[tuple[str, ...], tuple[str, ...]]:
        errors: list[str] = []
        warnings: list[str] = []
        if self.flags.live_data_enabled and not self.base_url:
            errors.append("SPORTS_PROVIDER_BASE_URL is required when live data is enabled.")
        if self.flags.live_data_enabled and not self.api_key:
            errors.append("SPORTS_PROVIDER_API_KEY is required when live data is enabled.")
        if self.flags.live_odds_enabled and not (self.odds_base_url and self.odds_api_key):
            errors.append("ODDS_PROVIDER_BASE_URL and ODDS_PROVIDER_API_KEY are required when live odds are enabled.")
        if any((self.secondary_name, self.secondary_base_url, self.secondary_api_key)) and not all(
            (self.secondary_name, self.secondary_base_url, self.secondary_api_key)
        ):
            errors.append("Secondary sports provider name, base URL, and API key must be configured together.")
        if any((self.secondary_odds_name, self.secondary_odds_base_url, self.secondary_odds_api_key)) and not all(
            (self.secondary_odds_name, self.secondary_odds_base_url, self.secondary_odds_api_key)
        ):
            errors.append("Secondary odds provider name, base URL, and API key must be configured together.")
        if self.flags.cloud_workspace_sync_enabled and not (self.database_url and self.auth_secret):
            errors.append("DATABASE_URL and AUTH_SECRET are required when cloud workspace sync is enabled.")
        if self.flags.server_alerts_enabled and not self.flags.cloud_workspace_sync_enabled:
            warnings.append("Server alerts are enabled without cloud workspace sync; no user rules can be scheduled.")
        if self.data_mode == "live" and self.sample_mode:
            errors.append("SAMPLE_MODE cannot be enabled while DATA_MODE is live.")
        if self.data_mode == "sample" and not self.sample_mode:
            errors.append("SAMPLE_MODE must be enabled while DATA_MODE is sample.")
        if self.data_mode == "sample" and not self.flags.sample_mode_enabled:
            errors.append("SAMPLE_MODE_ENABLED must be enabled while DATA_MODE is sample.")
        if self.app_env == "production" and not self.allowed_origins:
            errors.append("ALLOWED_ORIGINS is required in production.")
        invalid_rollouts = [f"{league_id}={state}" for league_id, state in self.league_rollout_states if state not in ROLLOUT_STATE_VALUES]
        if invalid_rollouts:
            errors.append(f"Invalid league rollout state(s): {', '.join(invalid_rollouts)}.")
        if any(state in {"internal_testing", "shadow", "limited_live", "production", "degraded"} for _, state in self.league_rollout_states) and not self.live_configured:
            errors.append("Live league rollout states require a configured server-side sports provider.")
        if not self.live_configured:
            if self.data_mode == "offline":
                warnings.append("Offline mode is active; no provider or sample fallback will be queried.")
            elif self.data_mode == "degraded":
                warnings.append(
                    "No verified live sports provider is configured; degraded mode may use an explicitly labeled sample fallback."
                    if self.sample_fallback_enabled
                    else "No verified live sports provider or sample fallback is configured; degraded mode is unavailable."
                )
            elif self.data_mode == "sample":
                warnings.append("No verified live sports provider is configured; fixture/sample mode remains active.")
            else:
                warnings.append("No verified live sports provider is configured.")
        return tuple(errors), tuple(warnings)

    def public_config(self) -> dict[str, object]:
        errors, warnings = self.validate()
        return {
            "environment": self.app_env,
            "apiBaseUrl": self.api_base_url,
            "dataMode": self.data_mode,
            "sampleMode": self.data_mode == "sample",
            "features": self.flags.public(),
            "providerConfigured": self.live_configured,
            "leagueRollouts": {league_id: state for league_id, state in self.league_rollout_states},
            "warnings": list(warnings),
            "configurationReady": not errors,
        }

    def redacted(self) -> dict[str, object]:
        values = asdict(self)
        for key in tuple(values):
            if any(part in key for part in ("api_key", "secret", "token", "dsn")):
                values[key] = "[configured]" if values[key] else "[not configured]"
        return values
