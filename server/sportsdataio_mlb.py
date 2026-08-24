from __future__ import annotations

import copy
import hashlib
import math
import re
import threading
import uuid
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timedelta, timezone
from typing import Any
from urllib.parse import quote
from zoneinfo import ZoneInfo

from .config import ProviderConfig
from .cache import CachePolicy, MemoryCache
from .errors import (
    ProviderAuthenticationError, ProviderEndpointError, ProviderEntitlementError,
    ProviderError, ProviderRateLimitError, ProviderTimeoutError,
    ProviderUnavailableError, ProviderValidationError,
)
from .http_client import JsonHttpClient
from .mlb_schedule_entities import MLB_CONTRACT_VERSION
from .mlb_identity import (
    KNOWN_ATHLETES as _KNOWN_CANONICAL_ATHLETES,
    KNOWN_VENUES as _KNOWN_CANONICAL_VENUES,
    MLB_TEAMS,
    PROVIDER_TEAM_ALIASES as _PROVIDER_TEAM_ALIASES,
    MlbIdentityService,
)
from .mlb_game_markets import MLB_MARKET_CONTRACT_VERSION, reconcile_sportsbook
from .mlb_player_props import MLB_PROP_CONTRACT_VERSION, PROP_STAT_REGISTRY
from .provider_adapter import ProviderAdapterBase
from .provider_contracts import CapabilityDeclaration, CapabilityRegistry, canonical_domain


SPORTSDATAIO_PROVIDER_ID = "sportsdataio"
SPORTSDATAIO_DEFAULT_BASE_URL = "https://api.sportsdata.io/v3/mlb/scores/json"
SPORTSDATAIO_DEFAULT_STATS_BASE_URL = "https://api.sportsdata.io/v3/mlb/stats/json"
SPORTSDATAIO_DEFAULT_ODDS_BASE_URL = "https://api.sportsdata.io/v3/mlb/odds/json"
SPORTSDATAIO_KEY_HEADER = "Ocp-Apim-Subscription-Key"
_EASTERN = ZoneInfo("America/New_York")
_MLB_TEAM_KEYS = frozenset(MLB_TEAMS)
_STATUS_MAP = {
    "scheduled": "scheduled",
    "pregame": "pregame",
    "inprogress": "in_progress",
    "in_progress": "in_progress",
    "final": "final",
    "completed": "completed",
    "unknown": "unknown",
    "suspended": "suspended",
    "delayed": "delayed",
    "postponed": "postponed",
    "canceled": "cancelled",
    "cancelled": "cancelled",
    "forfeit": "cancelled",
    "notnecessary": "cancelled",
    "not necessary": "cancelled",
}


def is_sportsdataio(config: ProviderConfig) -> bool:
    provider = re.sub(r"[^a-z0-9]+", "", config.name.casefold())
    return provider in {"sportsdataio", "sportsdata"} and bool(config.api_key)


def sportsdataio_mlb_shadow_capabilities() -> tuple[CapabilityDeclaration, ...]:
    limitations = (
        "Discovery Lab values may be scrambled and are shadow-only.",
        "Only season aggregate standings/statistics are eligible for Ticket 4 shadow validation.",
        "Only full-game pregame MLB moneyline, run-line, and total candidates are eligible for Ticket 5 shadow validation.",
        "Player props are eligible only for Ticket 6 shadow validation; no projection, live wagering, play-by-play, parlay execution, settlement, or historical odds archive is enabled.",
        "MLB live-event fields are eligible only for explicit bounded Ticket 9 shadow validation; no background polling starts automatically.",
    )
    return tuple(CapabilityDeclaration(
        SPORTSDATAIO_PROVIDER_ID, "baseball", "mlb", domain,
        support_state="shadow", rollout_state="shadow", live_call_permission=True,
        required_configuration=("SPORTS_PROVIDER_ID", "SPORTS_PROVIDER_API_KEY"),
        freshness_policy=domain, cache_policy=domain, retention_policy="normalized-only",
        limitations=limitations, fixture_available=True, contract_confirmed=True,
    ) for domain in ("league_catalog", "teams", "entities", "schedules", "event_status", "event_details", "standings", "historical_statistics", "sportsbooks", "markets", "odds", "player_props", "injuries", "availability", "rosters", "projected_lineups", "confirmed_lineups", "weather", "live_scores", "inning_state", "live_participants", "inning_linescore"))


def _slug(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", "-", str(value or "").casefold()).strip("-")


def _canonical_team_key(value: Any) -> str:
    provider_key = str(value or "").strip().upper()
    return _PROVIDER_TEAM_ALIASES.get(provider_key, provider_key)


def _optional_date(value: Any) -> date | None:
    if value in (None, ""):
        return None
    try:
        return date.fromisoformat(str(value))
    except ValueError as error:
        raise ProviderValidationError("SportsDataIO POC dates must use YYYY-MM-DD.") from error


def _entitlement_status(error: ProviderError) -> str:
    if isinstance(error, ProviderAuthenticationError):
        return "unauthorized"
    if isinstance(error, ProviderEntitlementError):
        return "forbidden_by_entitlement"
    if isinstance(error, ProviderEndpointError):
        return "invalid_endpoint"
    if isinstance(error, ProviderRateLimitError):
        return "rate_limited"
    if isinstance(error, ProviderTimeoutError):
        return "timeout"
    if isinstance(error, ProviderValidationError):
        return "malformed_response"
    return "provider_error"


def _provider_id(prefix: str, value: Any) -> str:
    text = str(value or "").strip()
    if not text:
        raise ProviderValidationError(f"SportsDataIO {prefix} record is missing its provider ID.")
    return f"sportsdataio:{prefix}:{text}"


def _canonical_game_id(provider_game_id: Any) -> str:
    # The provider ID stays private while this stable opaque key survives schedule corrections.
    digest = hashlib.sha256(f"sportsdataio:mlb:game:{provider_game_id}".encode("utf-8")).hexdigest()[:16]
    return f"mlb-game-{digest}"


def _disambiguated_id(prefix: str, name: str, provider_id: str) -> str:
    digest = hashlib.sha256(provider_id.encode("utf-8")).hexdigest()[:8]
    return f"{prefix}-{_slug(name)}-{digest}"


def _eastern_iso(value: Any, *, fallback: datetime | None = None) -> str:
    if value in (None, ""):
        if fallback is None:
            raise ProviderValidationError("SportsDataIO record is missing a required date/time.")
        parsed = fallback
    else:
        try:
            parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        except (TypeError, ValueError) as error:
            raise ProviderValidationError("SportsDataIO returned an invalid date/time.") from error
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=_EASTERN)
    return parsed.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _record_date(value: Any, start_time: str) -> str:
    if value:
        try:
            return date.fromisoformat(str(value)[:10]).isoformat()
        except ValueError:
            pass
    return datetime.fromisoformat(start_time.replace("Z", "+00:00")).astimezone(_EASTERN).date().isoformat()


class SportsDataIoMlbTrialProvider(ProviderAdapterBase):
    """Server-only SportsDataIO MLB trial adapter.

    The free trial may return scrambled values. Its output therefore enters EdgeBoard's
    normalized contract as sample data and can never promote a league rollout.
    """

    name = SPORTSDATAIO_PROVIDER_ID
    mode = "shadow"

    def __init__(
        self,
        config: ProviderConfig,
        client: JsonHttpClient | None = None,
        cache: MemoryCache | None = None,
        *,
        today: date | None = None,
        request_observer: Any | None = None,
        identity_service: MlbIdentityService | None = None,
    ):
        super().__init__(CapabilityRegistry(sportsdataio_mlb_shadow_capabilities()))
        if not is_sportsdataio(config):
            raise ProviderValidationError("SportsDataIO MLB trial requires SPORTS_PROVIDER_ID and SPORTS_PROVIDER_API_KEY.")
        self.config = config
        self.base_url = (config.base_url or SPORTSDATAIO_DEFAULT_BASE_URL).rstrip("/")
        self.stats_base_url = (
            self.base_url.replace("/scores/json", "/stats/json")
            if "/scores/json" in self.base_url else SPORTSDATAIO_DEFAULT_STATS_BASE_URL
        )
        self.odds_base_url = (
            self.base_url.replace("/scores/json", "/odds/json")
            if "/scores/json" in self.base_url else SPORTSDATAIO_DEFAULT_ODDS_BASE_URL
        )
        self.headers = {
            SPORTSDATAIO_KEY_HEADER: config.api_key,
            "Accept": "application/json",
            "User-Agent": "EdgeBoard-SportsDataIO-MLB-Trial/1.0",
        }
        self.client = client or JsonHttpClient(
            config.request_timeout_seconds,
            config.max_retries,
            config.retry_base_seconds,
            maximum_response_bytes=20_000_000,
        )
        self.cache = cache
        self.today = today or datetime.now(_EASTERN).date()
        self.request_observer = request_observer
        self.identity_service = identity_service
        self._health_lock = threading.Lock()
        self._last_successful_request: str | None = None
        self._last_safe_error_code: str | None = None
        self._last_endpoint_results: list[dict[str, Any]] = []

    def validate_configuration(self) -> tuple[tuple[str, ...], tuple[str, ...]]:
        errors = []
        if not is_sportsdataio(self.config):
            errors.append("SportsDataIO provider ID and server API key are required.")
        if not self.config.sports_provider_poc_enabled:
            errors.append("SPORTS_PROVIDER_POC_ENABLED must be true for credentialed POC calls.")
        return tuple(errors), ("Discovery Lab data is shadow-only and may be scrambled.",)

    def health_status(self) -> dict[str, Any]:
        with self._health_lock:
            return {
                "providerId": self.provider_id,
                "displayName": "SportsDataIO",
                "state": "available" if self._last_successful_request else "error" if self._last_safe_error_code else "not_checked",
                "liveVerified": False,
                "lastSuccessfulRequest": self._last_successful_request,
                "lastSafeErrorCode": self._last_safe_error_code,
                "implementedDomains": [item.domain for item in self.get_capabilities()],
                "entitlements": [dict(item) for item in self._last_endpoint_results],
            }

    def attribution_metadata(self) -> dict[str, Any]:
        return {
            "providerId": self.provider_id,
            "displayName": "SportsDataIO",
            "required": True,
            "mode": "discovery_lab_shadow",
            "liveVerified": False,
        }

    def fetch(self, domain: str, scope: dict[str, Any] | None = None) -> Any:
        resolved = canonical_domain(domain)
        if resolved is None or not self.supports_domain(resolved, "mlb"):
            return super().fetch(domain, scope)
        selected = scope or {}
        if resolved in {"standings", "historical_statistics"}:
            try:
                season = int(selected.get("season") or self.today.year)
            except (TypeError, ValueError) as error:
                raise ProviderValidationError("SportsDataIO MLB season must be an integer.") from error
            payload, _report, error = self.validate_standings_leaders_access(season=season)
            if payload is None:
                raise error or ProviderUnavailableError("SportsDataIO MLB aggregate data is unavailable.")
            if resolved == "standings":
                return {"items": payload["standings"]}
            return {"items": [*payload["playerSeasonStats"], *payload["teamSeasonStats"]]}
        if resolved in {"sportsbooks", "markets", "odds"}:
            selected_date = str(selected.get("date") or "")
            if not selected_date:
                raise ProviderValidationError("SportsDataIO MLB odds fetch requires an explicit date.")
            payload, _report, error = self.validate_odds_access(selected_date=selected_date)
            if payload is None:
                raise error or ProviderUnavailableError("SportsDataIO MLB odds are unavailable.")
            return {"items": payload["sportsbooks"] if resolved == "sportsbooks" else payload["prices"]}
        start = _optional_date(selected.get("startDate") or selected.get("date"))
        end = _optional_date(selected.get("endDate")) or start
        payload, _report, error = self.validate_access(start_date=start, end_date=end)
        if payload is None:
            raise error or ProviderUnavailableError("SportsDataIO MLB POC data is unavailable.")
        from .mlb_schedule_entities import MlbScheduleEntityAdapter
        normalized = MlbScheduleEntityAdapter().normalize(payload, source_mode="sample")
        if resolved == "league_catalog":
            return {"items": [normalized["league"]]}
        if resolved == "teams":
            return {"items": [item for item in normalized["entities"] if item["type"] == "team"]}
        if resolved == "entities":
            return {"items": normalized["entities"]}
        return {"items": normalized["games"]}

    def _get(self, endpoint: str) -> tuple[list[dict[str, Any]], int]:
        return self._get_from(self.base_url, endpoint)

    def _get_from(self, base_url: str, endpoint: str) -> tuple[list[dict[str, Any]], int]:
        headers = {**self.headers, "X-Request-ID": uuid.uuid4().hex}
        observer = self.request_observer
        url = f"{base_url}/{quote(endpoint, safe='/')}"
        if observer:
            payload = self.client.get_json(
                url, headers,
                before_attempt=lambda attempt: observer.before_request(endpoint, attempt),
                after_attempt=lambda token, attempt, outcome, error_code, latency_ms: observer.after_request(
                    token, attempt, outcome, error_code, latency_ms,
                ),
            )
        else:
            # Preserve compatibility with provider-client test doubles and other
            # provider-neutral clients that implement the original interface.
            payload = self.client.get_json(url, headers)
        if not isinstance(payload, list):
            raise ProviderValidationError(f"SportsDataIO endpoint {endpoint} did not return an array.")
        records = [item for item in payload if isinstance(item, dict)]
        return records, len(payload) - len(records)

    def validate_standings_leaders_access(
        self, *, season: int,
    ) -> tuple[dict[str, Any] | None, list[dict[str, Any]], ProviderError | None]:
        """Narrow credentialed Ticket 4 check; normalized aggregates remain shadow-only."""
        errors, _warnings = self.validate_configuration()
        if errors:
            return None, [], ProviderValidationError("SportsDataIO POC configuration is invalid.")
        if season < 1876 or season > datetime.now(timezone.utc).year + 1:
            return None, [], ProviderValidationError("SportsDataIO MLB season is invalid.")
        operations = {
            "standings": (self.base_url, f"Standings/{season}"),
            "playerSeasonStats": (self.stats_base_url, f"PlayerSeasonStats/{season}"),
            "teamSeasonStats": (self.stats_base_url, f"TeamSeasonStats/{season}"),
        }
        results: dict[str, list[dict[str, Any]]] = {}
        rejected_siblings: dict[str, int] = {}
        failures: dict[str, ProviderError] = {}
        with ThreadPoolExecutor(max_workers=3) as executor:
            futures = {
                executor.submit(self._get_from, base, endpoint): name
                for name, (base, endpoint) in operations.items()
            }
            for future in as_completed(futures):
                name = futures[future]
                try:
                    results[name], rejected_siblings[name] = future.result()
                except ProviderError as error:
                    failures[name] = error
        report = [{
            "domain": "historical_statistics" if name != "standings" else "standings",
            "operation": endpoint.split("/", 1)[0], "scope": str(season),
            "status": "authenticated_empty" if name in results and not results[name] else "authenticated_available" if name in results else _entitlement_status(failures[name]),
            "recordCount": len(results.get(name, [])),
            "rejectedSiblingCount": rejected_siblings.get(name, 0),
            "reasonCode": failures[name].code if name in failures else None,
            "planLimitationPossible": isinstance(failures.get(name), ProviderEntitlementError),
        } for name, (_base, endpoint) in operations.items()]
        with self._health_lock:
            self._last_endpoint_results = [dict(item) for item in report]
            if any(item["status"].startswith("authenticated_") for item in report):
                self._last_successful_request = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
            self._last_safe_error_code = next((item["reasonCode"] for item in report if item["reasonCode"]), None)
        if not results:
            return None, report, next(iter(failures.values()), ProviderUnavailableError("SportsDataIO aggregate endpoints are unavailable."))
        diagnostics: list[dict[str, Any]] = []
        payload = {
            "contractVersion": "edgeboard-mlb-standings-leaders-v1",
            "provider": SPORTSDATAIO_PROVIDER_ID, "sourceMode": "sample", "season": season,
            "recordedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "attribution": "SportsDataIO MLB Discovery Lab data (scrambled/sample; shadow only)",
            "coverage": {
                "standings": "candidate" if "standings" in results else "unavailable",
                "playerSeasonStats": "candidate" if "playerSeasonStats" in results else "unavailable",
                "teamSeasonStats": "candidate" if "teamSeasonStats" in results else "unavailable",
            },
            "standings": self._ticket4_standings(results.get("standings", []), diagnostics),
            "playerSeasonStats": self._ticket4_player_stats(results.get("playerSeasonStats", []), diagnostics),
            "teamSeasonStats": self._ticket4_team_stats(results.get("teamSeasonStats", []), diagnostics),
            "providerNormalizationWarnings": diagnostics,
        }
        return payload, report, None

    def validate_odds_access(
        self, *, selected_date: str,
    ) -> tuple[dict[str, Any] | None, list[dict[str, Any]], ProviderError | None]:
        """Fetch one date of pregame MLB game odds and its schedule identity evidence."""
        errors, _warnings = self.validate_configuration()
        if errors:
            return None, [], ProviderValidationError("SportsDataIO POC configuration is invalid.")
        try:
            day = date.fromisoformat(selected_date)
        except ValueError:
            return None, [], ProviderValidationError("SportsDataIO MLB odds date must use YYYY-MM-DD.")
        if abs((day - self.today).days) > 7:
            return None, [], ProviderValidationError("SportsDataIO MLB odds validation is limited to a seven-day window.")
        formatted = day.strftime("%Y-%b-%d").upper()
        operations = {
            "teams": (self.base_url, "AllTeams"),
            "schedule": (self.base_url, f"GamesByDate/{formatted}"),
            "odds": (self.odds_base_url, f"GameOddsByDate/{formatted}"),
        }
        results, sibling_rejections, failures = {}, {}, {}
        with ThreadPoolExecutor(max_workers=3) as executor:
            futures = {executor.submit(self._get_from, base, endpoint): name for name, (base, endpoint) in operations.items()}
            for future in as_completed(futures):
                name = futures[future]
                try:
                    results[name], sibling_rejections[name] = future.result()
                except ProviderError as error:
                    failures[name] = error
        report = [{
            "domain": "odds" if name == "odds" else "schedules" if name == "schedule" else "teams",
            "operation": endpoint.split("/", 1)[0], "scope": selected_date,
            "status": "authenticated_empty" if name in results and not results[name] else "authenticated_available" if name in results else _entitlement_status(failures[name]),
            "recordCount": len(results.get(name, [])), "rejectedSiblingCount": sibling_rejections.get(name, 0),
            "reasonCode": failures[name].code if name in failures else None,
            "planLimitationPossible": isinstance(failures.get(name), ProviderEntitlementError),
        } for name, (_base, endpoint) in operations.items()]
        with self._health_lock:
            self._last_endpoint_results = [dict(item) for item in report]
            if any(item["status"].startswith("authenticated_") for item in report):
                self._last_successful_request = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
            self._last_safe_error_code = next((item["reasonCode"] for item in report if item["reasonCode"]), None)
        if "odds" not in results:
            return None, report, failures.get("odds") or ProviderUnavailableError("SportsDataIO MLB odds are unavailable.")
        if "teams" not in results or "schedule" not in results:
            return None, report, failures.get("schedule") or failures.get("teams") or ProviderValidationError("Schedule identity evidence is unavailable.")
        diagnostics = {"rejected": [], "unresolved": [], "duplicateProviderRecords": 0, "timezoneAssumptions": []}
        teams = self._teams(results["teams"], diagnostics)
        games = self._games(results["schedule"], teams, {}, diagnostics)
        game_by_provider = {str(item["providerId"]).rsplit(":", 1)[-1]: item for item in games}
        books_by_provider: dict[str, dict[str, Any]] = {}
        prices: list[dict[str, Any]] = []
        normalization_warnings: list[dict[str, Any]] = []
        for index, row in enumerate(results["odds"]):
            provider_game_id = str(row.get("GameId") or row.get("GameID") or "")
            game = game_by_provider.get(provider_game_id)
            if game is None:
                normalization_warnings.append({"domain":"odds","index":index,"code":"unresolved_event"})
                continue
            odd_type = str(row.get("OddType") or "pregame").casefold()
            if any(token in odd_type for token in ("live", "inning", "period")):
                normalization_warnings.append({"domain":"odds","index":index,"code":"unsupported_scope"})
                continue
            raw_book_identity = row.get("SportsbookId") or row.get("Sportsbook")
            if raw_book_identity in (None, ""):
                normalization_warnings.append({"domain":"odds","index":index,"code":"missing_sportsbook_identity"})
                continue
            provider_book_id = _provider_id("sportsbook", raw_book_identity)
            book = reconcile_sportsbook(provider_book_id, row.get("Sportsbook"))
            books_by_provider.setdefault(provider_book_id, book)
            canonical_book = book.get("canonicalId")
            status = "suspended" if row.get("Unlisted") else "available"
            updated_at = _eastern_iso(row.get("Updated"), fallback=datetime.now(_EASTERN))
            fields = (
                ("moneyline", "home", None, "HomeMoneyLine"), ("moneyline", "away", None, "AwayMoneyLine"),
                ("run_line", "home", row.get("HomePointSpread"), "HomePointSpreadPayout"),
                ("run_line", "away", row.get("AwayPointSpread"), "AwayPointSpreadPayout"),
                ("total", "over", row.get("OverUnder"), "OverPayout"),
                ("total", "under", row.get("OverUnder"), "UnderPayout"),
            )
            for family, side, line, price_field in fields:
                if row.get(price_field) is None:
                    continue
                prices.append({
                    "providerPriceId": f'{row.get("GameOddId")}:{family}:{side}',
                    "eventId": game["canonicalId"], "sportsbookId": canonical_book,
                    "family": family, "side": side, "line": line,
                    "americanOdds": row.get(price_field), "status": status,
                    "isAlternate": False, "isLive": False, "period": "full_game",
                    "settlementScope": "including_extra_innings", "updatedAt": updated_at,
                })
        now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        schedule_contract = {
            "contractVersion": MLB_CONTRACT_VERSION, "provider": SPORTSDATAIO_PROVIDER_ID,
            "sourceMode": "sample", "recordedAt": now,
            "attribution": "SportsDataIO MLB Discovery Lab data (scrambled/sample; shadow only)",
            "league": {"providerId":"sportsdataio:league:mlb","canonicalId":"mlb","sportId":"baseball","name":"Major League Baseball","abbreviation":"MLB"},
            "entities": [*teams.values()], "games": games,
        }
        return {
            "contractVersion": MLB_MARKET_CONTRACT_VERSION, "provider": SPORTSDATAIO_PROVIDER_ID,
            "sourceMode": "sample", "recordedAt": now,
            "attribution": "SportsDataIO MLB Discovery Lab odds (scrambled/sample; shadow only)",
            "coverage": {"sportsbooks":"candidate","events":"candidate","markets":"candidate"},
            "sportsbooks": list(books_by_provider.values()),
            "events": [{"providerEventId":item["providerId"],"canonicalEventId":item["canonicalId"],"date":item["date"],"startsAt":item["startTime"],"awayTeamId":_canonical_team_key(next((row.get("AwayTeam") for row in results["schedule"] if str(row.get("GameID")) == str(item["providerId"]).rsplit(":",1)[-1]), "")),"homeTeamId":_canonical_team_key(next((row.get("HomeTeam") for row in results["schedule"] if str(row.get("GameID")) == str(item["providerId"]).rsplit(":",1)[-1]), ""))} for item in games],
            "prices": prices, "scheduleContract": schedule_contract,
            "providerNormalizationWarnings": [*normalization_warnings, *diagnostics["rejected"]],
        }, report, None

    def validate_player_props_access(
        self, *, selected_date: str,
    ) -> tuple[dict[str, Any] | None, list[dict[str, Any]], ProviderError | None]:
        """Fetch prop candidates by game; all values remain scrambled/sample and shadow-only."""
        errors, _warnings = self.validate_configuration()
        if errors:
            return None, [], ProviderValidationError("SportsDataIO POC configuration is invalid.")
        try:
            day = date.fromisoformat(selected_date)
        except ValueError:
            return None, [], ProviderValidationError("SportsDataIO MLB player-prop date must use YYYY-MM-DD.")
        if abs((day - self.today).days) > 7:
            return None, [], ProviderValidationError("SportsDataIO MLB player-prop validation is limited to a seven-day window.")
        formatted = day.strftime("%Y-%b-%d").upper()
        operations = {
            "teams": (self.base_url, "AllTeams"), "players": (self.base_url, "Players"),
            "schedule": (self.base_url, f"GamesByDate/{formatted}"),
        }
        results, sibling_rejections, failures = {}, {}, {}
        with ThreadPoolExecutor(max_workers=3) as executor:
            futures = {executor.submit(self._get_from, base, endpoint): name for name, (base, endpoint) in operations.items()}
            for future in as_completed(futures):
                name = futures[future]
                try: results[name], sibling_rejections[name] = future.result()
                except ProviderError as error: failures[name] = error
        report = [{
            "domain": name, "operation": endpoint.split("/", 1)[0], "scope": selected_date if name == "schedule" else "mlb",
            "status": "authenticated_empty" if name in results and not results[name] else "authenticated_available" if name in results else _entitlement_status(failures[name]),
            "recordCount": len(results.get(name, [])), "rejectedSiblingCount": sibling_rejections.get(name, 0),
            "reasonCode": failures[name].code if name in failures else None,
            "planLimitationPossible": isinstance(failures.get(name), ProviderEntitlementError),
        } for name, (_base, endpoint) in operations.items()]
        if any(name not in results for name in operations):
            return None, report, failures.get("schedule") or failures.get("players") or failures.get("teams") or ProviderUnavailableError("SportsDataIO player-prop identity evidence is unavailable.")
        prop_results: list[dict[str, Any]] = []
        prop_failures: list[ProviderError] = []
        prop_rejected = 0
        games_for_props = [row for row in results["schedule"] if row.get("GameID") not in (None, "")]
        with ThreadPoolExecutor(max_workers=min(4, max(1, len(games_for_props)))) as executor:
            futures = {executor.submit(self._get_from, self.odds_base_url, f'BettingPlayerPropsByGame/{row["GameID"]}'): row for row in games_for_props}
            for future in as_completed(futures):
                game_row = futures[future]
                try:
                    records, rejected = future.result(); prop_rejected += rejected
                    prop_results.extend({**record, "_EdgeBoardGameID": game_row["GameID"]} for record in records)
                except ProviderError as error: prop_failures.append(error)
        if games_for_props:
            if prop_results:
                prop_status, prop_error = "authenticated_available", None
            elif prop_failures and len(prop_failures) == len(games_for_props):
                prop_status, prop_error = _entitlement_status(prop_failures[0]), prop_failures[0]
            else:
                prop_status, prop_error = "authenticated_empty", None
        else:
            prop_status, prop_error = "authenticated_empty", None
        report.append({"domain":"player_props","operation":"BettingPlayerPropsByGame","scope":selected_date,"status":prop_status,"recordCount":len(prop_results),"rejectedSiblingCount":prop_rejected,"reasonCode":prop_error.code if prop_error else None,"planLimitationPossible":isinstance(prop_error, ProviderEntitlementError)})
        with self._health_lock:
            self._last_endpoint_results = [dict(item) for item in report]
            if any(item["status"].startswith("authenticated_") for item in report): self._last_successful_request = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
            self._last_safe_error_code = next((item["reasonCode"] for item in report if item["reasonCode"]), None)
        if prop_error or not prop_results:
            return None, report, prop_error or ProviderEntitlementError("SportsDataIO returned no MLB player-prop records for this date; the plan or date may not include props.")
        diagnostics = {"rejected": [], "unresolved": [], "duplicateProviderRecords": 0, "timezoneAssumptions": []}
        teams = self._teams(results["teams"], diagnostics)
        players = self._players(results["players"], teams, diagnostics)
        games = self._games(results["schedule"], teams, {}, diagnostics)
        game_by_provider = {str(item["providerId"]).rsplit(":", 1)[-1]: item for item in games}
        player_by_provider = {str(item["providerId"]).rsplit(":", 1)[-1]: item for item in players}
        player_rows = []
        for item in players:
            canonical = item["canonicalId"]
            position = str(item.get("position") or "").upper()
            player_rows.append({"providerPlayerId":item["providerId"],"canonicalPlayerId":canonical,"displayName":item["name"],"teamId":item.get("teamCanonicalId"),"role":"pitcher" if position in {"P","SP","RP"} else "batter","active":item.get("active") is True,"reconciliationState":"confirmed"})
        family_aliases = {
            "pitcher strikeouts":"pitcher_strikeouts", "pitching strikeouts":"pitcher_strikeouts", "pitcher outs":"pitcher_outs_recorded", "outs recorded":"pitcher_outs_recorded",
            "pitcher hits allowed":"pitcher_hits_allowed", "pitching hits":"pitcher_hits_allowed", "pitcher walks allowed":"pitcher_walks_allowed", "pitching walks":"pitcher_walks_allowed",
            "pitcher earned runs":"pitcher_earned_runs_allowed", "earned runs allowed":"pitcher_earned_runs_allowed", "hits":"batter_hits", "player hits":"batter_hits",
            "total bases":"batter_total_bases", "home runs":"batter_home_runs", "runs batted in":"batter_rbi", "rbi":"batter_rbi", "runs":"batter_runs",
            "stolen bases":"batter_stolen_bases", "walks":"batter_walks", "batter walks":"batter_walks", "strikeouts":"batter_strikeouts", "batter strikeouts":"batter_strikeouts",
        }
        books_by_provider: dict[str, dict[str, Any]] = {}
        props, warnings = [], []
        for market_index, market in enumerate(prop_results):
            provider_game = str(market.get("_EdgeBoardGameID") or market.get("GameID") or "")
            game = game_by_provider.get(provider_game)
            family_name = str(market.get("BettingBetType") or market.get("Name") or "").casefold().strip()
            family = family_aliases.get(family_name)
            provider_player = str(market.get("PlayerID") or "")
            player = player_by_provider.get(provider_player)
            if not game or not family or not player or family not in PROP_STAT_REGISTRY:
                warnings.append({"domain":"player_props","index":market_index,"code":"unresolved_event_player_or_family"}); continue
            outcomes = market.get("BettingOutcomes") or market.get("Outcomes") or []
            if not isinstance(outcomes, list):
                warnings.append({"domain":"player_props","index":market_index,"code":"malformed_outcomes"}); continue
            for outcome_index, outcome in enumerate(outcomes):
                side = str(outcome.get("BettingOutcomeType") or outcome.get("OutcomeType") or "").casefold()
                if side not in {"over","under"}: continue
                sportsbook = outcome.get("SportsBook") if isinstance(outcome.get("SportsBook"), dict) else {}
                book_name = sportsbook.get("Name") or outcome.get("Sportsbook")
                book_raw_id = sportsbook.get("SportsbookID") or sportsbook.get("SportsBookID") or outcome.get("SportsbookID")
                if book_raw_id in (None, ""):
                    warnings.append({"domain":"player_props","index":market_index,"outcomeIndex":outcome_index,"code":"missing_sportsbook"}); continue
                provider_book_id = _provider_id("sportsbook", book_raw_id); book = reconcile_sportsbook(provider_book_id, book_name); books_by_provider.setdefault(provider_book_id, book)
                canonical_book = book.get("canonicalId")
                if not canonical_book:
                    warnings.append({"domain":"player_props","index":market_index,"outcomeIndex":outcome_index,"code":"unresolved_sportsbook"}); continue
                updated = outcome.get("Updated") or market.get("Updated")
                props.append({"providerPropId":f'{market.get("BettingMarketID")}:{outcome.get("BettingOutcomeID")}',"eventId":game["canonicalId"],"playerId":player["canonicalId"],"teamId":player.get("teamCanonicalId"),"sportsbookId":canonical_book,"family":family,"side":side,"line":outcome.get("BetValue"),"americanOdds":outcome.get("PayoutAmerican") or outcome.get("AmericanOdds"),"status":"suspended" if outcome.get("IsAvailable") is False else "available","isAlternate":outcome.get("IsAlternate") is True,"isLive":False,"updatedAt":_eastern_iso(updated, fallback=datetime.now(_EASTERN))})
        now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        schedule_contract = {"contractVersion":MLB_CONTRACT_VERSION,"provider":SPORTSDATAIO_PROVIDER_ID,"sourceMode":"sample","recordedAt":now,"attribution":"SportsDataIO MLB Discovery Lab data (scrambled/sample; shadow only)","league":{"providerId":"sportsdataio:league:mlb","canonicalId":"mlb","sportId":"baseball","name":"Major League Baseball","abbreviation":"MLB"},"entities":[*teams.values(),*players],"games":games}
        return {"contractVersion":MLB_PROP_CONTRACT_VERSION,"provider":SPORTSDATAIO_PROVIDER_ID,"sourceMode":"sample","recordedAt":now,"attribution":"SportsDataIO MLB Discovery Lab player props (scrambled/sample; shadow only)","coverage":{"props":"candidate","history":"unavailable"},"sportsbooks":list(books_by_provider.values()),"events":[{"providerEventId":item["providerId"],"canonicalEventId":item["canonicalId"],"date":item["date"],"startsAt":item["startTime"],"awayTeamId":_canonical_team_key(next((row.get("AwayTeam") for row in results["schedule"] if str(row.get("GameID"))==str(item["providerId"]).rsplit(":",1)[-1]),"")),"homeTeamId":_canonical_team_key(next((row.get("HomeTeam") for row in results["schedule"] if str(row.get("GameID"))==str(item["providerId"]).rsplit(":",1)[-1]),""))} for item in games],"players":player_rows,"props":props,"historicalGameLogs":[],"scheduleContract":schedule_contract,"providerNormalizationWarnings":[*warnings,*diagnostics["rejected"]]}, report, None

    @staticmethod
    def _ticket4_standings(rows: list[dict[str, Any]], diagnostics: list[dict[str, Any]]) -> list[dict[str, Any]]:
        normalized = []
        for index, row in enumerate(rows):
            try:
                team = _canonical_team_key(row.get("Key") or row.get("Team"))
                if team not in _MLB_TEAM_KEYS:
                    raise ProviderValidationError("Unknown standing team mapping.")
                normalized.append({
                    "teamId": team,
                    "teamName": str(row.get("Name") or row.get("TeamName") or team),
                    "league": str(row.get("League") or row.get("LeagueName") or "Unknown"),
                    "division": str(row.get("Division") or row.get("DivisionName") or "Unknown"),
                    "wins": row.get("Wins"), "losses": row.get("Losses"),
                    "homeWins": row.get("HomeWins"), "homeLosses": row.get("HomeLosses"),
                    "awayWins": row.get("AwayWins"), "awayLosses": row.get("AwayLosses"),
                    "runsFor": row.get("RunsScored", row.get("RunsFor")), "runsAgainst": row.get("RunsAgainst"),
                    "streak": row.get("Streak"), "lastTenWins": row.get("LastTenWins"), "lastTenLosses": row.get("LastTenLosses"),
                    "gamesBack": row.get("GamesBack"), "divisionRank": row.get("DivisionRank"), "wildCardRank": row.get("WildCardRank"),
                    "clinchedDivision": row.get("ClinchedDivision") is True,
                    "clinchedPlayoff": row.get("ClinchedPlayoffs") is True or row.get("ClinchedPlayoff") is True,
                })
            except ProviderValidationError:
                diagnostics.append({"domain": "standings", "index": index, "code": "unresolved_team"})
        return normalized

    @staticmethod
    def _ticket4_player_stats(rows: list[dict[str, Any]], diagnostics: list[dict[str, Any]]) -> list[dict[str, Any]]:
        aliases = {
            "games": "Games", "plateAppearances": "PlateAppearances", "atBats": "AtBats", "hits": "Hits",
            "doubles": "Doubles", "triples": "Triples", "homeRuns": "HomeRuns", "runs": "Runs",
            "runsBattedIn": "RunsBattedIn", "walks": "Walks", "stolenBases": "StolenBases", "totalBases": "TotalBases",
            "battingAverage": "BattingAverage", "onBasePercentage": "OnBasePercentage", "sluggingPercentage": "SluggingPercentage",
            "ops": "OnBasePlusSlugging", "wins": "Wins", "pitcherStrikeouts": "PitchingStrikeouts", "saves": "Saves",
            "earnedRunAverage": "EarnedRunAverage", "whip": "WalksHitsPerInningsPitched", "walksAllowed": "PitchingWalks",
            "hitsAllowed": "PitchingHits",
        }
        normalized = []
        for index, row in enumerate(rows):
            try:
                provider_id = _provider_id("player", row.get("PlayerID"))
                name = str(row.get("Name") or " ".join(filter(None, [row.get("FirstName"), row.get("LastName")]))).strip()
                if not name:
                    raise ProviderValidationError("Missing player name.")
                team = _canonical_team_key(row.get("Team"))
                if team not in _MLB_TEAM_KEYS:
                    raise ProviderValidationError("Unknown player team mapping.")
                item = {
                    "playerId": _KNOWN_CANONICAL_ATHLETES.get(name.casefold()) or _disambiguated_id("mlb-player", name, provider_id),
                    "playerName": name, "teamId": team,
                }
                item.update({target: row[source] for target, source in aliases.items() if row.get(source) is not None})
                outs = SportsDataIoMlbTrialProvider._innings_outs(row)
                if outs is not None:
                    item["inningsPitchedOuts"] = outs
                normalized.append(item)
            except ProviderValidationError:
                diagnostics.append({"domain": "playerSeasonStats", "index": index, "code": "invalid_or_unresolved_player"})
        return normalized

    @staticmethod
    def _ticket4_team_stats(rows: list[dict[str, Any]], diagnostics: list[dict[str, Any]]) -> list[dict[str, Any]]:
        aliases = {
            "games": "Games", "runs": "Runs", "hits": "Hits", "homeRuns": "HomeRuns",
            "earnedRunAverage": "EarnedRunAverage", "whip": "WalksHitsPerInningsPitched",
        }
        normalized = []
        for index, row in enumerate(rows):
            team = _canonical_team_key(row.get("Team") or row.get("Key"))
            if team not in _MLB_TEAM_KEYS:
                diagnostics.append({"domain": "teamSeasonStats", "index": index, "code": "unresolved_team"})
                continue
            item = {"teamId": team}
            item.update({target: row[source] for target, source in aliases.items() if row.get(source) is not None})
            if row.get("RunsAllowed") is not None:
                item["runsAllowed"] = row["RunsAllowed"]
            normalized.append(item)
        return normalized

    @staticmethod
    def _innings_outs(row: dict[str, Any]) -> int | None:
        if row.get("Outs") is not None:
            try:
                value = int(row["Outs"])
                return value if value >= 0 else None
            except (TypeError, ValueError):
                return None
        full = row.get("InningsPitchedFull")
        if full not in (None, ""):
            try:
                whole, fraction = (str(full).split(".", 1) + ["0"])[:2]
                if fraction not in {"0", "1", "2"}:
                    return None
                return int(whole) * 3 + int(fraction)
            except (TypeError, ValueError):
                return None
        decimal = row.get("InningsPitchedDecimal")
        if decimal not in (None, ""):
            try:
                value = float(decimal)
                return round(value * 3) if math.isfinite(value) and value >= 0 else None
            except (TypeError, ValueError):
                return None
        return None

    def validate_context_access(
        self, *, selected_date: str,
    ) -> tuple[dict[str, Any] | None, list[dict[str, Any]], ProviderError | None]:
        """Validate entitled MLB context feeds independently; output remains shadow-only."""
        errors, _warnings = self.validate_configuration()
        if errors:
            return None, [], ProviderValidationError("SportsDataIO POC configuration is invalid.")
        try:
            day = date.fromisoformat(selected_date)
        except ValueError:
            return None, [], ProviderValidationError("SportsDataIO MLB context date must use YYYY-MM-DD.")
        if abs((day - self.today).days) > 7:
            return None, [], ProviderValidationError("SportsDataIO MLB context validation is limited to seven days from today.")
        formatted = day.strftime("%Y-%b-%d").upper()
        schedule_contract, schedule_report, schedule_error = self.validate_access(start_date=day, end_date=day)
        operations = {
            "injuries": (self.stats_base_url, "Injuries"),
            "lineups": (self.stats_base_url, f"StartingLineupsByDate/{formatted}"),
            "transactions": (self.stats_base_url, "Transactions"),
            "games": (self.base_url, f"GamesByDate/{formatted}"),
        }
        results: dict[str, list[dict[str, Any]]] = {}
        rejected_siblings: dict[str, int] = {}
        failures: dict[str, ProviderError] = {}
        with ThreadPoolExecutor(max_workers=4) as executor:
            futures = {executor.submit(self._get_from, base, endpoint): name for name, (base, endpoint) in operations.items()}
            for future in as_completed(futures):
                name = futures[future]
                try:
                    results[name], rejected_siblings[name] = future.result()
                except ProviderError as error:
                    failures[name] = error
        domain_map = {"injuries": "injuries", "lineups": "projected_lineups", "transactions": "rosters", "games": "weather"}
        report = [*schedule_report, *[{
            "domain": domain_map[name], "operation": endpoint.split("/", 1)[0], "scope": selected_date,
            "status": "authenticated_empty" if name in results and not results[name] else "authenticated_available" if name in results else _entitlement_status(failures[name]),
            "recordCount": len(results.get(name, [])), "rejectedSiblingCount": rejected_siblings.get(name, 0),
            "reasonCode": failures[name].code if name in failures else None,
            "planLimitationPossible": isinstance(failures.get(name), ProviderEntitlementError),
        } for name, (_base, endpoint) in operations.items()]]
        with self._health_lock:
            self._last_endpoint_results = [dict(item) for item in report]
            if any(item["status"].startswith("authenticated_") for item in report):
                self._last_successful_request = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
            self._last_safe_error_code = next((item["reasonCode"] for item in report if item.get("reasonCode")), None)
        if schedule_contract is None:
            return None, report, schedule_error or ProviderValidationError("Canonical schedule evidence is unavailable.")

        entities = schedule_contract.get("entities", [])
        provider_players = {str(item.get("providerId", "")).rsplit(":", 1)[-1]: item.get("canonicalId") for item in entities if item.get("type") == "athlete" and item.get("providerId")}
        provider_teams = {str(item.get("providerId", "")).rsplit(":", 1)[-1]: item.get("canonicalId") for item in entities if item.get("type") == "team" and item.get("providerId")}
        provider_games = {str(item.get("providerId", "")).rsplit(":", 1)[-1]: item.get("canonicalId") for item in schedule_contract.get("games", []) if item.get("providerId")}
        recorded_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        diagnostics: list[dict[str, Any]] = []

        def mapped(mapping: dict[str, Any], value: Any) -> str | None:
            return mapping.get(str(value)) if value not in (None, "") else None

        def timestamp(value: Any, fallback: str = recorded_at) -> str:
            try:
                return _eastern_iso(value, fallback=datetime.fromisoformat(fallback.replace("Z", "+00:00")))
            except ProviderValidationError:
                return fallback

        availability = []
        for index, row in enumerate(results.get("injuries", [])):
            player_id, team_id = mapped(provider_players, row.get("PlayerID")), mapped(provider_teams, row.get("TeamID"))
            if not player_id or not team_id:
                diagnostics.append({"domain": "injuries", "index": index, "code": "unresolved_identity"}); continue
            state = str(row.get("InjuryStatus") or "unknown").strip().casefold().replace(" ", "_")
            if state not in {"probable", "questionable", "doubtful", "out"}: state = "unknown"
            updated = timestamp(row.get("Updated") or row.get("UpdatedDate") or row.get("InjuryStartDate"))
            availability.append({"providerRecordId": f"sportsdataio:injury:{row.get('InjuryID') or row.get('PlayerID')}", "playerId": player_id,
                "teamId": team_id, "status": state, "reportedReason": str(row.get("InjuryNotes") or row.get("InjuryNote") or row.get("InjuryBodyPart") or "Provider injury designation"),
                "effectiveAt": timestamp(row.get("InjuryStartDate"), updated), "updatedAt": updated})

        rosters = []
        for item in entities:
            if item.get("type") != "athlete" or not item.get("teamCanonicalId"): continue
            raw = str(item.get("status") or "unknown").casefold()
            state = "active" if raw in {"active", "40 man active"} else "injured_list" if "injury" in raw else "minor_league" if "minor" in raw else "inactive" if raw in {"inactive", "restricted list"} else "unknown"
            rosters.append({"providerRecordId": f"{item.get('providerId')}:roster", "playerId": item["canonicalId"], "teamId": item["teamCanonicalId"],
                "status": state, "effectiveAt": recorded_at, "updatedAt": recorded_at})

        lineups, starters = [], []
        for index, row in enumerate(results.get("lineups", [])):
            event_id = mapped(provider_games, row.get("GameID"))
            if not event_id:
                diagnostics.append({"domain": "lineups", "index": index, "code": "unresolved_event"}); continue
            for side in ("Away", "Home"):
                team_id = mapped(provider_teams, row.get(f"{side}TeamID"))
                if not team_id: continue
                entries = []
                for entry in row.get(f"{side}BattingLineup") or []:
                    if not isinstance(entry, dict): continue
                    player_id = mapped(provider_players, entry.get("PlayerID")); order = entry.get("BattingOrder") or entry.get("BattingOrderPosition")
                    if player_id and isinstance(order, int) and 1 <= order <= 9:
                        entries.append({"playerId": player_id, "battingOrder": order, "position": str(entry.get("Position") or "")})
                confirmed = bool(row.get(f"{side}BattingLineupConfirmed") or row.get("LineupsConfirmed"))
                lineups.append({"providerRecordId": f"sportsdataio:lineup:{row.get('GameID')}:{side.casefold()}", "eventId": event_id, "teamId": team_id,
                    "state": "confirmed" if confirmed else "projected" if entries else "unavailable", "updatedAt": timestamp(row.get("Updated") or row.get("DateTime")), "entries": entries})
                pitcher = row.get(f"{side}StartingPitcher") or {}
                if isinstance(pitcher, dict) and (pitcher_id := mapped(provider_players, pitcher.get("PlayerID"))):
                    starters.append({"providerRecordId": f"sportsdataio:starter:{row.get('GameID')}:{side.casefold()}", "eventId": event_id,
                        "teamId": team_id, "playerId": pitcher_id, "state": "confirmed" if pitcher.get("Confirmed") is True else "probable",
                        "updatedAt": timestamp(pitcher.get("Updated") or row.get("Updated") or row.get("DateTime"))})

        weather = []
        for index, row in enumerate(results.get("games", [])):
            event_id = mapped(provider_games, row.get("GameID"))
            if not event_id:
                diagnostics.append({"domain": "weather", "index": index, "code": "unresolved_event"}); continue
            summary = str(row.get("ForecastDescription") or "").strip()
            if summary or row.get("ForecastWindSpeed") is not None or row.get("ForecastTempHigh") is not None:
                weather.append({"providerRecordId": f"sportsdataio:weather:{row.get('GameID')}", "eventId": event_id, "state": "forecast",
                    "summary": summary or "Provider weather fields are partial.", "temperatureF": row.get("ForecastTempHigh"),
                    "windMph": row.get("ForecastWindSpeed"), "updatedAt": timestamp(row.get("Updated") or row.get("DateTime"))})
            for side in ("Away", "Home"):
                team_id = mapped(provider_teams, row.get(f"{side}TeamID")); pitcher_id = mapped(provider_players, row.get(f"{side}TeamProbablePitcherID"))
                if team_id and pitcher_id and not any(item["eventId"] == event_id and item["teamId"] == team_id for item in starters):
                    starters.append({"providerRecordId": f"sportsdataio:probable:{row.get('GameID')}:{side.casefold()}", "eventId": event_id,
                        "teamId": team_id, "playerId": pitcher_id, "state": "probable", "updatedAt": timestamp(row.get("Updated") or row.get("DateTime"))})

        transactions = []
        for index, row in enumerate(results.get("transactions", [])):
            player_id, team_id = mapped(provider_players, row.get("PlayerID")), mapped(provider_teams, row.get("TeamID"))
            if not player_id or not team_id:
                diagnostics.append({"domain": "transactions", "index": index, "code": "unresolved_identity"}); continue
            occurred = timestamp(row.get("Date") or row.get("Updated"))
            transactions.append({"providerRecordId": f"sportsdataio:transaction:{row.get('TransactionID') or index}", "playerId": player_id,
                "teamId": team_id, "type": str(row.get("Type") or "provider_reported"), "description": str(row.get("Description") or "Provider-reported roster transaction."),
                "occurredAt": occurred, "updatedAt": occurred})

        context_events = [
            *[{"providerRecordId": f"{item['providerRecordId']}:event", "type": "injury_report", "playerId": item["playerId"], "teamId": item["teamId"],
               "occurredAt": item["updatedAt"], "summary": "SportsDataIO supplied an attributed player availability designation; no diagnosis or effect is inferred.",
               "previousState": None, "currentState": {"status": item["status"]}} for item in availability],
            *[{"providerRecordId": f"{item['providerRecordId']}:event", "type": "lineup_confirmed" if item["state"] == "confirmed" else "lineup_posted",
               "teamId": item["teamId"], "eventId": item["eventId"], "occurredAt": item["updatedAt"],
               "summary": f"SportsDataIO supplied a {item['state']} batting lineup; missing slots remain unavailable.",
               "previousState": None, "currentState": {"state": item["state"]}} for item in lineups if item["state"] != "unavailable"],
            *[{"providerRecordId": f"{item['providerRecordId']}:event", "type": "starter_confirmed" if item["state"] == "confirmed" else "starter_announced",
               "playerId": item["playerId"], "teamId": item["teamId"], "eventId": item["eventId"], "occurredAt": item["updatedAt"],
               "summary": f"SportsDataIO supplied a {item['state']} starting pitcher; no market effect is inferred.",
               "previousState": None, "currentState": {"state": item["state"], "playerId": item["playerId"]}} for item in starters],
            *[{"providerRecordId": f"{item['providerRecordId']}:event", "type": "weather_forecast", "eventId": item["eventId"],
               "occurredAt": item["updatedAt"], "summary": "SportsDataIO supplied event weather fields; no delay or market effect is inferred.",
               "previousState": None, "currentState": {"state": item["state"]}} for item in weather],
            *[{"providerRecordId": f"{item['providerRecordId']}:event", "type": "transaction", "playerId": item["playerId"], "teamId": item["teamId"],
               "occurredAt": item["updatedAt"], "summary": "SportsDataIO supplied an attributed roster transaction.",
               "previousState": None, "currentState": {"type": item["type"]}} for item in transactions],
        ]
        payload = {"contractVersion": "edgeboard-mlb-context-v1", "provider": SPORTSDATAIO_PROVIDER_ID, "sourceMode": "sample",
            "recordedAt": recorded_at, "attribution": "SportsDataIO MLB Discovery Lab context (scrambled/sample; shadow only)",
            "availability": availability, "rosters": rosters, "lineups": lineups, "starters": starters, "weather": weather,
            "transactions": transactions, "contextualEvents": context_events, "scheduleContract": schedule_contract,
            "providerNormalizationWarnings": diagnostics}
        return payload, report, None

    def validate_live_state_access(
        self, *, selected_date: str, event_ids: list[str] | None = None,
    ) -> tuple[dict[str, Any] | None, list[dict[str, Any]], ProviderError | None]:
        """Perform one bounded BoxScoresByDate read and emit only the Ticket 9 contract."""
        errors, _warnings = self.validate_configuration()
        if errors:
            return None, [], ProviderValidationError("SportsDataIO POC configuration is invalid.")
        try:
            day = date.fromisoformat(selected_date)
        except ValueError:
            return None, [], ProviderValidationError("SportsDataIO MLB live-state date must use YYYY-MM-DD.")
        if abs((day - self.today).days) > 2:
            return None, [], ProviderValidationError("SportsDataIO MLB live-state validation is limited to two days from today.")
        requested_ids = {str(value) for value in (event_ids or []) if str(value).strip()}
        if len(requested_ids) > 3:
            return None, [], ProviderValidationError("SportsDataIO MLB live-state validation is limited to three events.")
        schedule_contract, schedule_report, schedule_error = self.validate_access(start_date=day, end_date=day)
        endpoint = f"BoxScoresByDate/{day.strftime('%Y-%b-%d').upper()}"
        try:
            rows, rejected_siblings = self._get(endpoint)
            endpoint_error = None
        except ProviderError as error:
            rows, rejected_siblings, endpoint_error = [], 0, error
        report = [*schedule_report, {
            "domain": "event_status", "operation": "BoxScoresByDate", "scope": selected_date,
            "status": "authenticated_empty" if endpoint_error is None and not rows else "authenticated_available" if endpoint_error is None else _entitlement_status(endpoint_error),
            "recordCount": len(rows), "rejectedSiblingCount": rejected_siblings,
            "reasonCode": endpoint_error.code if endpoint_error else None,
            "planLimitationPossible": isinstance(endpoint_error, ProviderEntitlementError),
        }]
        with self._health_lock:
            self._last_endpoint_results = [dict(item) for item in report]
            if endpoint_error is None:
                self._last_successful_request = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
            self._last_safe_error_code = endpoint_error.code if endpoint_error else None
        if schedule_contract is None:
            return None, report, schedule_error or ProviderValidationError("Canonical schedule evidence is unavailable.")
        if endpoint_error is not None:
            return None, report, endpoint_error

        games = schedule_contract.get("games", [])
        game_by_provider = {
            str(item.get("providerId") or "").rsplit(":", 1)[-1]: item.get("canonicalId")
            for item in games if item.get("providerId") and item.get("canonicalId")
        }
        entities = schedule_contract.get("entities", [])
        player_by_provider = {
            str(item.get("providerId") or "").rsplit(":", 1)[-1]: item.get("canonicalId")
            for item in entities if item.get("type") == "athlete" and item.get("providerId") and item.get("canonicalId")
        }
        recorded_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        updates: list[dict[str, Any]] = []
        diagnostics: list[dict[str, Any]] = []
        coverage = Counter()
        for index, box in enumerate(rows):
            game = box.get("Game") if isinstance(box.get("Game"), dict) else box
            provider_game_id = game.get("GameID") or box.get("GameID")
            event_id = game_by_provider.get(str(provider_game_id))
            if not event_id or requested_ids and event_id not in requested_ids:
                if provider_game_id:
                    diagnostics.append({"domain": "event_status", "index": index, "code": "unresolved_or_unrequested_event"})
                continue
            raw_status = str(game.get("Status") or "unknown")
            status = _STATUS_MAP.get(raw_status.casefold().replace(" ", ""), _STATUS_MAP.get(raw_status.casefold(), "unknown"))
            status = "in_progress" if status == "live" else "final" if status == "completed" else status
            updated_at = _eastern_iso(game.get("Updated") or game.get("DateTimeUTC") or game.get("DateTime"), fallback=datetime.now(timezone.utc))
            update: dict[str, Any] = {
                "eventId": event_id, "status": status, "providerStatus": raw_status,
                "providerUpdatedAt": updated_at, "fetchedAt": recorded_at,
            }
            away, home = game.get("AwayTeamRuns"), game.get("HomeTeamRuns")
            if away is not None and home is not None:
                update["score"] = {"away": away, "home": home}; coverage["live_scores"] += 1
            inning = game.get("CurrentInning")
            half = game.get("CurrentInningHalf") or game.get("InningHalf")
            if inning not in (None, "") and half not in (None, ""):
                normalized_half = str(half).casefold()
                normalized_half = "top" if normalized_half.startswith("t") else "bottom" if normalized_half.startswith("b") else "middle" if normalized_half.startswith("m") else "end" if normalized_half.startswith("e") else normalized_half
                update["period"] = {"inning": inning, "half": normalized_half}; coverage["inning_state"] += 1
            if game.get("Outs") not in (None, ""):
                update["outs"] = game["Outs"]; coverage["inning_state"] += 1
            balls, strikes = game.get("Balls"), game.get("Strikes")
            if balls not in (None, "") or strikes not in (None, ""):
                update["count"] = {key: value for key, value in (("balls", balls), ("strikes", strikes)) if value not in (None, "")}
            bases: dict[str, Any] = {}
            for base, keys in {
                "first": ("RunnerOnFirstID", "RunnerOnFirst"),
                "second": ("RunnerOnSecondID", "RunnerOnSecond"),
                "third": ("RunnerOnThirdID", "RunnerOnThird"),
            }.items():
                runner_id, occupied = game.get(keys[0]), game.get(keys[1])
                if runner_id not in (None, ""):
                    bases[base] = player_by_provider.get(str(runner_id), f"unresolved:{runner_id}")
                elif isinstance(occupied, bool):
                    bases[base] = occupied
            if bases and not any(str(value).startswith("unresolved:") for value in bases.values()):
                update["bases"] = bases
            elif bases:
                diagnostics.append({"domain": "live_participants", "index": index, "code": "unresolved_base_runner"})
            for provider_field, target in (("CurrentBatterID", "currentBatterId"), ("CurrentPitcherID", "currentPitcherId")):
                provider_player = game.get(provider_field) or box.get(provider_field)
                if provider_player not in (None, ""):
                    canonical = player_by_provider.get(str(provider_player))
                    if canonical:
                        update[target] = canonical; coverage["live_participants"] += 1
                    else:
                        update[target] = f"unresolved:{provider_player}"
            raw_innings = box.get("Innings") or game.get("Innings") or []
            inning_scores = []
            for inning_row in raw_innings if isinstance(raw_innings, list) else []:
                if not isinstance(inning_row, dict):
                    continue
                number = inning_row.get("InningNumber") or inning_row.get("Number")
                inning_away = inning_row.get("AwayTeamRuns")
                inning_home = inning_row.get("HomeTeamRuns")
                if number not in (None, "") and inning_away is not None and inning_home is not None:
                    inning_scores.append({"inning": number, "away": inning_away, "home": inning_home})
            if inning_scores:
                update["inningScores"] = inning_scores
                update["inningScoresComplete"] = status == "final"
                coverage["inning_linescore"] += 1
            updates.append(update)
        payload = {
            "contractVersion": "edgeboard-mlb-live-state-v1", "provider": SPORTSDATAIO_PROVIDER_ID,
            "sourceMode": "sample", "recordedAt": recorded_at,
            "attribution": "SportsDataIO MLB Discovery Lab live state (scrambled/sample; shadow only)",
            "updates": updates, "scheduleContract": schedule_contract,
            "providerNormalizationWarnings": diagnostics,
            "capabilityCoverage": {domain: int(coverage[domain]) for domain in ("live_scores", "inning_state", "live_participants", "inning_linescore")},
        }
        return payload, report, None

    def load(self) -> dict[str, Any]:
        payload, report, required_error = self.validate_access()
        if payload is None:
            raise required_error or ProviderValidationError("SportsDataIO MLB schedule/entity endpoints are unavailable.")
        payload["endpointResults"] = report
        return payload

    def validate_access(
        self, *, start_date: date | None = None, end_date: date | None = None,
    ) -> tuple[dict[str, Any] | None, list[dict[str, Any]], ProviderError | None]:
        """Fetch and normalize accessible domains without exposing raw records or credentials."""
        errors, _warnings = self.validate_configuration()
        if errors:
            error = ProviderValidationError("SportsDataIO POC configuration is invalid.")
            return None, [], error
        first = start_date or self.today - timedelta(days=1)
        last = end_date or (start_date if start_date else self.today + timedelta(days=1))
        if last < first or (last - first).days > 6:
            error = ProviderValidationError("SportsDataIO POC date range must be ordered and no longer than seven days.")
            return None, [], error
        dates = [first + timedelta(days=offset) for offset in range((last - first).days + 1)]
        entity_cache_key = CachePolicy.key(MLB_CONTRACT_VERSION, self.provider_id, "entities", "mlb")
        cached_entities, _ = self.cache.get(entity_cache_key) if self.cache else (None, "miss")
        endpoints = {f"games:{day.isoformat()}": f"GamesByDate/{day.strftime('%Y-%b-%d').upper()}" for day in dates}
        if not isinstance(cached_entities, dict):
            endpoints = {"teams": "AllTeams", "venues": "Stadiums", "players": "Players", **endpoints}
        results: dict[str, list[dict[str, Any]]] = {}
        transport_rejected: dict[str, int] = {}
        failures: dict[str, ProviderError] = {}
        with ThreadPoolExecutor(max_workers=min(4, len(endpoints))) as executor:
            futures = {executor.submit(self._get, endpoint): name for name, endpoint in endpoints.items()}
            for future in as_completed(futures):
                name = futures[future]
                try:
                    results[name], transport_rejected[name] = future.result()
                except ProviderError as error:
                    failures[name] = error

        endpoint_report = [{
            "domain": "schedules" if name.startswith("games:") else name,
            "operation": endpoints[name].split("/", 1)[0],
            "scope": name.split(":", 1)[1] if ":" in name else "mlb",
            "status": "authenticated_empty" if name in results and not results[name] else "authenticated_available" if name in results else _entitlement_status(failures[name]),
            "recordCount": len(results.get(name, [])),
            "rejectedSiblingCount": transport_rejected.get(name, 0),
            "reasonCode": failures[name].code if name in failures else None,
            "planLimitationPossible": isinstance(failures.get(name), ProviderEntitlementError),
        } for name in sorted(endpoints)]
        if isinstance(cached_entities, dict):
            cached_counts = cached_entities.get("endpointCounts") if isinstance(cached_entities.get("endpointCounts"), dict) else {}
            endpoint_report = [{
                "domain": domain, "operation": operation, "scope": "mlb", "status": "cached_fresh",
                "recordCount": int(cached_counts.get(domain) or 0), "rejectedSiblingCount": 0,
                "reasonCode": None, "planLimitationPossible": False,
            } for domain, operation in (("players", "Players"), ("teams", "AllTeams"), ("venues", "Stadiums"))] + endpoint_report
        with self._health_lock:
            self._last_endpoint_results = [dict(item) for item in endpoint_report]
            successful = any(item["status"].startswith("authenticated_") for item in endpoint_report)
            self._last_successful_request = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z") if successful else self._last_successful_request
            self._last_safe_error_code = next((item["reasonCode"] for item in endpoint_report if item["reasonCode"]), None)
        if not isinstance(cached_entities, dict) and ("teams" not in results or not results["teams"]):
            return None, endpoint_report, failures.get("teams") or ProviderValidationError("SportsDataIO teams are unavailable.")
        game_sets = [items for name, items in results.items() if name.startswith("games:")]
        if not game_sets:
            return None, endpoint_report, next(iter(failures.values()), ProviderValidationError("SportsDataIO schedules are unavailable."))

        diagnostics: dict[str, Any] = copy.deepcopy(cached_entities.get("diagnostics")) if isinstance(cached_entities, dict) else {
            "rejected": [], "unresolved": [], "duplicateProviderRecords": 0,
            "timezoneAssumptions": ["SportsDataIO MLB DateTime fields are interpreted as America/New_York per provider documentation."],
        }
        diagnostics["rejected"].extend(
            {"domain": "schedules" if name.startswith("games:") else name, "code": "malformed_sibling", "count": count}
            for name, count in transport_rejected.items() if count
        )
        if isinstance(cached_entities, dict):
            teams = copy.deepcopy(cached_entities["teams"])
            venues = copy.deepcopy(cached_entities["venues"])
            players = copy.deepcopy(cached_entities["players"])
            managers = copy.deepcopy(cached_entities["managers"])
        else:
            teams = self._teams(results["teams"], diagnostics)
            venues = self._venues(results.get("venues", []), diagnostics)
            if self.identity_service:
                team_rows = {str(row.get("TeamID")): row for row in results["teams"]}
                reconciled_teams: dict[str, dict[str, Any]] = {}
                for key, team in teams.items():
                    raw = team_rows.get(str(team["providerId"]).rsplit(":", 1)[-1], {})
                    mapping = self.identity_service.reconcile_team(raw)
                    if mapping["canonicalId"]:
                        team["canonicalId"] = mapping["canonicalId"]
                        team["identityConfidence"] = mapping["confidence"]
                        team["mappingState"] = mapping["mappingState"]
                        reconciled_teams[mapping["canonicalId"]] = team
                teams = reconciled_teams

                venue_rows = {str(row.get("StadiumID")): row for row in results.get("venues", [])}
                reconciled_venues: dict[str, dict[str, Any]] = {}
                for provider_key, venue in venues.items():
                    mapping = self.identity_service.reconcile_venue(venue_rows.get(provider_key, {}))
                    if mapping["canonicalId"]:
                        venue["canonicalId"] = mapping["canonicalId"]
                        venue["identityConfidence"] = mapping["confidence"]
                        venue["mappingState"] = mapping["mappingState"]
                        reconciled_venues[provider_key] = venue
                venues = reconciled_venues
            for team in teams.values():
                venue = venues.get(str(team.pop("_stadiumId", "") or ""))
                if venue:
                    team["venueCanonicalId"] = venue["canonicalId"]
                    venue.setdefault("homeTeamCanonicalIds", []).append(team["canonicalId"])
                elif team.get("active"):
                    team.setdefault("validationWarnings", []).append("Team venue relationship is unavailable or malformed.")
            players = self._players(
                results.get("players", []), teams, diagnostics,
                allow_provider_derived_ids=self.identity_service is None,
            )
            if self.identity_service:
                player_rows = {str(row.get("PlayerID")): row for row in results.get("players", [])}
                reconciled_players = []
                for player in players:
                    raw = player_rows.get(str(player["providerId"]).rsplit(":", 1)[-1], {})
                    mapping = self.identity_service.reconcile_player(raw, player.get("teamCanonicalId") or "")
                    if mapping["canonicalId"]:
                        player["canonicalId"] = mapping["canonicalId"]
                        player["identityConfidence"] = mapping["confidence"]
                        player["mappingState"] = mapping["mappingState"]
                        player["activityClass"] = mapping["activityClass"]
                        player["relevanceTier"] = mapping["relevanceTier"]
                        reconciled_players.append(player)
                players = reconciled_players
            # Manager identities are intentionally suppressed until a dedicated,
            # evidence-backed manager policy exists.
            managers = [] if self.identity_service else self._managers(results["teams"], teams)
            if self.cache:
                # Schedule normalization continues appending to diagnostics below,
                # so store an explicit entity snapshot rather than a live alias.
                self.cache.set(entity_cache_key, copy.deepcopy({
                    "teams": teams, "venues": venues, "players": players, "managers": managers,
                    "diagnostics": diagnostics,
                    "endpointCounts": {domain: len(results.get(domain, [])) for domain in ("teams", "venues", "players")},
                }), 3600, 3600, private=True, tags=("provider:sportsdataio", "league:mlb", "domain:entities"))
        games = self._games(
            [item for group in game_sets for item in group], teams, venues, diagnostics,
            allow_provider_derived_ids=self.identity_service is None,
        )
        if self.identity_service:
            game_rows = {str(row.get("GameID")): row for group in game_sets for row in group}
            reconciled_games = []
            provider_team_to_canonical = {team["providerId"]: team["canonicalId"] for team in teams.values()}
            for game in games:
                raw = game_rows.get(str(game["providerId"]).rsplit(":", 1)[-1], {})
                away_id = provider_team_to_canonical.get(game["awayTeamProviderId"], "")
                home_id = provider_team_to_canonical.get(game["homeTeamProviderId"], "")
                mapping = self.identity_service.reconcile_event(
                    raw, away_id, home_id, game["date"], game.get("doubleheaderGame"),
                )
                if mapping["canonicalId"]:
                    game["canonicalId"] = mapping["canonicalId"]
                    game["identityConfidence"] = mapping["confidence"]
                    game["mappingState"] = mapping["mappingState"]
                    reconciled_games.append(game)
            games = reconciled_games
        now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        identity_metrics = self.identity_service.metrics() if self.identity_service else None
        identity_unresolved = 0
        if identity_metrics:
            identity_unresolved = sum(
                int(item.get("unresolved") or 0) + int(item.get("ambiguous") or 0)
                for item in identity_metrics.get("domains", {}).values()
            )
        return {
            "contractVersion": MLB_CONTRACT_VERSION,
            "provider": SPORTSDATAIO_PROVIDER_ID,
            "sourceMode": "sample",
            "recordedAt": now,
            "attribution": "SportsDataIO MLB free-trial data (scrambled/sample)",
            "league": {
                "providerId": "sportsdataio:league:mlb",
                "canonicalId": "mlb",
                "sportId": "baseball",
                "name": "Major League Baseball",
                "abbreviation": "MLB",
            },
            "entities": [*teams.values(), *venues.values(), *players, *managers],
            "games": games,
            "adapterWarnings": [
                f"{name} unavailable: {error.code}" for name, error in sorted(failures.items())
            ],
            "validationReport": {
                "rejected": diagnostics["rejected"],
                "rejectedCount": len(diagnostics["rejected"]),
                "duplicateProviderRecords": diagnostics["duplicateProviderRecords"],
                "unresolvedMappingCount": identity_unresolved if identity_metrics else len(diagnostics["unresolved"]),
                "unresolvedMappings": diagnostics["unresolved"][:50],
                "unresolvedMappingsTruncated": len(diagnostics["unresolved"]) > 50,
                "timezoneAssumptions": diagnostics["timezoneAssumptions"],
                "identityMetrics": identity_metrics,
            },
        }, endpoint_report, None

    @staticmethod
    def _teams(rows: list[dict[str, Any]], diagnostics: dict[str, Any] | None = None) -> dict[str, dict[str, Any]]:
        diagnostics = diagnostics if diagnostics is not None else {"rejected": [], "unresolved": [], "duplicateProviderRecords": 0}
        teams: dict[str, dict[str, Any]] = {}
        provider_ids: set[str] = set()
        for row in rows:
            try:
                provider_key = str(row.get("Key") or "").strip().upper()
                key = _canonical_team_key(provider_key)
                provider_id = _provider_id("team", row.get("TeamID"))
                name = str(row.get("FullName") or " ".join(filter(None, [row.get("City"), row.get("Name")]))).strip()
                if provider_id in provider_ids:
                    diagnostics["duplicateProviderRecords"] += 1
                    diagnostics["rejected"].append({"domain": "teams", "code": "duplicate_provider_id"})
                    continue
                provider_ids.add(provider_id)
                if not key:
                    diagnostics["rejected"].append({"domain": "teams", "code": "missing_abbreviation"})
                    continue
                if not name:
                    diagnostics["rejected"].append({"domain": "teams", "code": "missing_name"})
                    continue
                if key not in _MLB_TEAM_KEYS:
                    diagnostics["unresolved"].append({"type": "team", "candidate": key or "unknown", "reason": "unknown_team_mapping"})
                    diagnostics["rejected"].append({"domain": "teams", "code": "unknown_team_mapping"})
                    continue
                if key in teams:
                    diagnostics["rejected"].append({"domain": "teams", "code": "duplicate_canonical_mapping"})
                    continue
                teams[key] = {
                    "providerId": provider_id,
                    "canonicalId": key,
                    "type": "team",
                    "name": name,
                    "aliases": [value for value in (key, provider_key if provider_key != key else None, row.get("City"), row.get("Name")) if value],
                    "abbreviation": key,
                    "city": str(row.get("City") or ""),
                    "nickname": str(row.get("Name") or ""),
                    "division": str(row.get("Division") or row.get("DivisionID") or ""),
                    "active": row.get("Active") is not False,
                    "identityConfidence": 1.0,
                    "_stadiumId": row.get("StadiumID"),
                }
            except ProviderValidationError:
                diagnostics["rejected"].append({"domain": "teams", "code": "missing_provider_id"})
        alias_owners: dict[str, set[str]] = {}
        for key, team in teams.items():
            for alias in team.get("aliases", []):
                normalized_alias = _slug(alias)
                if normalized_alias:
                    alias_owners.setdefault(normalized_alias, set()).add(key)
        for alias, owners in alias_owners.items():
            if len(owners) > 1:
                diagnostics["unresolved"].append({
                    "type": "team_alias", "candidate": alias,
                    "reason": "conflicting_alias", "canonicalCandidates": sorted(owners),
                })
        return teams

    @staticmethod
    def _venues(rows: list[dict[str, Any]], diagnostics: dict[str, Any] | None = None) -> dict[str, dict[str, Any]]:
        diagnostics = diagnostics if diagnostics is not None else {"rejected": [], "unresolved": [], "duplicateProviderRecords": 0}
        venues: dict[str, dict[str, Any]] = {}
        provider_ids: set[str] = set()
        canonical_ids: set[str] = set()
        for row in rows:
            try:
                provider_id = _provider_id("venue", row.get("StadiumID"))
                name = str(row.get("Name") or "").strip()
                if not name:
                    diagnostics["rejected"].append({"domain": "venues", "code": "missing_name"})
                    continue
                if provider_id in provider_ids:
                    diagnostics["duplicateProviderRecords"] += 1
                    diagnostics["rejected"].append({"domain": "venues", "code": "duplicate_provider_id"})
                    continue
                provider_ids.add(provider_id)
                canonical_id = _KNOWN_CANONICAL_VENUES.get(name.casefold(), f"venue-{_slug(name)}")
                if canonical_id in canonical_ids:
                    diagnostics["rejected"].append({"domain": "venues", "code": "conflicting_canonical_name"})
                    continue
                canonical_ids.add(canonical_id)
                venues[str(row["StadiumID"])] = {
                    "providerId": provider_id,
                    "canonicalId": canonical_id,
                    "type": "venue",
                    "name": name,
                    "aliases": [],
                    "location": ", ".join(filter(None, [str(row.get("City") or ""), str(row.get("State") or "")])),
                    "city": str(row.get("City") or ""),
                    "region": str(row.get("State") or ""),
                    "country": str(row.get("Country") or ""),
                    "surface": str(row.get("PlayingSurface") or ""),
                    "active": row.get("Active") is not False,
                    "identityConfidence": 1.0 if name.casefold() in _KNOWN_CANONICAL_VENUES else 0.85,
                }
            except ProviderValidationError:
                diagnostics["rejected"].append({"domain": "venues", "code": "missing_provider_id"})
        return venues

    @staticmethod
    def _players(rows: list[dict[str, Any]], teams: dict[str, dict[str, Any]], diagnostics: dict[str, Any] | None = None,
                 *, allow_provider_derived_ids: bool = True) -> list[dict[str, Any]]:
        diagnostics = diagnostics if diagnostics is not None else {"rejected": [], "unresolved": [], "duplicateProviderRecords": 0}
        players: list[dict[str, Any]] = []
        used: set[str] = set()
        provider_ids: set[str] = set()
        for row in rows:
            try:
                provider_id = _provider_id("player", row.get("PlayerID"))
                if provider_id in provider_ids:
                    diagnostics["duplicateProviderRecords"] += 1
                    diagnostics["rejected"].append({"domain": "players", "code": "duplicate_provider_id"})
                    continue
                provider_ids.add(provider_id)
                name = str(row.get("Name") or " ".join(filter(None, [row.get("FirstName"), row.get("LastName")]))).strip()
                if not name:
                    diagnostics["rejected"].append({"domain": "players", "code": "missing_name"})
                    continue
                team_key = _canonical_team_key(row.get("Team"))
                status = str(row.get("Status") or "").strip().casefold()
                known_id = _KNOWN_CANONICAL_ATHLETES.get(name.casefold())
                canonical_id = known_id or (_disambiguated_id("mlb-player", name, provider_id) if allow_provider_derived_ids else "")
                if canonical_id and canonical_id in used:
                    diagnostics["rejected"].append({"domain": "players", "code": "duplicate_canonical_mapping"})
                    continue
                if canonical_id:
                    used.add(canonical_id)
                warnings = []
                if team_key and team_key not in teams:
                    warnings.append("Player team membership could not be reconciled.")
                if not known_id and allow_provider_derived_ids:
                    diagnostics["unresolved"].append({
                        "type": "athlete", "providerId": provider_id,
                        "candidate": canonical_id, "reason": "provider_mapping_requires_review",
                    })
                players.append({
                    "providerId": provider_id,
                    "canonicalId": canonical_id,
                    "type": "athlete",
                    "name": name,
                    "aliases": [],
                    "teamCanonicalId": team_key if team_key in teams else "",
                    "position": str(row.get("Position") or ""),
                    "firstName": str(row.get("FirstName") or ""),
                    "lastName": str(row.get("LastName") or ""),
                    "status": str(row.get("Status") or ""),
                    "handedness": str(row.get("BatHand") or row.get("ThrowHand") or ""),
                    "jerseyNumber": row.get("Jersey"),
                    "active": status in {"active", "40 man active", "non-roster invitee"} or "injury list" in status,
                    "identityConfidence": 1.0 if known_id else 0.5,
                    "validationWarnings": warnings,
                })
            except ProviderValidationError:
                diagnostics["rejected"].append({"domain": "players", "code": "missing_provider_id"})
        return players

    @staticmethod
    def _managers(rows: list[dict[str, Any]], teams: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
        managers: list[dict[str, Any]] = []
        for row in rows:
            key = _canonical_team_key(row.get("Key"))
            name = str(row.get("Manager") or "").strip()
            if key not in teams or not name:
                continue
            managers.append({
                "providerId": f"sportsdataio:manager:{row.get('TeamID')}:{_slug(name)}",
                "canonicalId": f"mlb-manager-{_slug(name)}",
                "type": "manager",
                "name": name,
                "aliases": [],
                "teamCanonicalId": key,
                "active": True,
                "identityConfidence": 0.6,
            })
        return managers

    @staticmethod
    def _games(
        rows: list[dict[str, Any]],
        teams: dict[str, dict[str, Any]],
        venues: dict[str, dict[str, Any]],
        diagnostics: dict[str, Any] | None = None,
        *, allow_provider_derived_ids: bool = True,
    ) -> list[dict[str, Any]]:
        diagnostics = diagnostics if diagnostics is not None else {"rejected": [], "unresolved": [], "duplicateProviderRecords": 0}
        games: list[dict[str, Any]] = []
        seen: set[str] = set()
        by_canonical: dict[str, int] = {}
        for row in rows:
            try:
                raw_id = row.get("GameID")
                provider_id = _provider_id("game", raw_id)
                if provider_id in seen:
                    diagnostics["duplicateProviderRecords"] += 1
                    diagnostics["rejected"].append({"domain": "schedules", "code": "duplicate_provider_id"})
                    continue
                away = _canonical_team_key(row.get("AwayTeam"))
                home = _canonical_team_key(row.get("HomeTeam"))
                if away not in teams or home not in teams:
                    diagnostics["rejected"].append({"domain": "schedules", "code": "unknown_team_reference"})
                    continue
                start_time = _eastern_iso(row.get("DateTime"))
                schedule_date = _record_date(row.get("Day"), start_time)
                status = _STATUS_MAP.get(str(row.get("Status") or "Scheduled").strip().casefold())
                warnings = ["Provider timestamp timezone omitted; interpreted as America/New_York."]
                if status is None:
                    status = "unknown"
                    warnings.append("Unknown provider status was preserved as unknown.")
                doubleheader = row.get("DoubleHeader")
                game_number = row.get("DoubleHeaderGame") or row.get("GameNumber")
                if game_number not in {1, 2}:
                    game_number = None
                    if isinstance(doubleheader, str):
                        match = re.search(r"([12])", doubleheader)
                        game_number = int(match.group(1)) if match else None
                venue = venues.get(str(row.get("StadiumID") or ""))
                if row.get("StadiumID") not in (None, "") and not venue:
                    warnings.append("Game venue could not be reconciled.")
                updated = _eastern_iso(row.get("Updated"), fallback=datetime.fromisoformat(start_time.replace("Z", "+00:00")))
                identity_provider_id = row.get("RescheduledFromGameID") or raw_id
                canonical_id = _canonical_game_id(identity_provider_id) if allow_provider_derived_ids else ""
                game = {
                    "providerId": provider_id,
                    "canonicalId": canonical_id,
                    "date": schedule_date,
                    "startTime": start_time,
                    "timezone": "America/New_York",
                    "status": status,
                    "statusDetail": status.replace("_", " ").title(),
                    "providerStatus": str(row.get("Status") or ""),
                    "awayTeamProviderId": teams[away]["providerId"],
                    "homeTeamProviderId": teams[home]["providerId"],
                    "venueProviderId": venue["providerId"] if venue else "",
                    "doubleheaderGame": game_number,
                    "providerUpdatedAt": updated,
                    "providerStartTime": str(row.get("DateTime") or ""),
                    "season": row.get("Season"),
                    "seasonType": row.get("SeasonType"),
                    "seriesId": row.get("SeriesID"),
                    "seriesGameNumber": row.get("SeriesGameNumber"),
                    "rescheduledFromProviderId": str(row.get("RescheduledFromGameID") or ""),
                    "validationWarnings": warnings,
                    "identityConfidence": 0.6,
                }
                if canonical_id and canonical_id in by_canonical:
                    prior_index = by_canonical[canonical_id]
                    prior = games[prior_index]
                    if prior["status"] == "postponed" and game["status"] != "postponed":
                        games[prior_index] = game
                    else:
                        diagnostics["rejected"].append({"domain": "schedules", "code": "duplicate_canonical_event"})
                    seen.add(provider_id)
                    continue
                if canonical_id:
                    by_canonical[canonical_id] = len(games)
                games.append(game)
                seen.add(provider_id)
                if allow_provider_derived_ids:
                    diagnostics["unresolved"].append({
                        "type": "event", "providerId": provider_id,
                        "candidate": canonical_id, "reason": "provider_mapping_requires_review",
                    })
            except (ProviderValidationError, ValueError, TypeError):
                diagnostics["rejected"].append({"domain": "schedules", "code": "invalid_record"})
        return games
