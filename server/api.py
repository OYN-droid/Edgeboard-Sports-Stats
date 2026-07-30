from __future__ import annotations

import json
import hmac
from dataclasses import asdict
from typing import Any
from urllib.parse import parse_qs

from .adapters import CatalogAdapter, EntitySearchAdapter, StandingsAdapter
from .auth import Principal
from .errors import (
    AuthenticationError,
    AuthorizationError,
    EdgeBoardError,
    RateLimitError,
    UnsupportedFeatureError,
    ValidationError,
)
from .ingestion import schedule_manifest
from .observability import Timer, request_id


PUBLIC_RATE_POLICIES = {
    "metadata": (120, 60),
    "search": (30, 60),
    "research": (20, 60),
    "historical": (30, 60),
    "live": (120, 60),
    "odds": (90, 60),
    "workspace_write": (30, 60),
    "authentication": (10, 60),
    "export": (10, 60),
}


class Api:
    def __init__(self, runtime: Any):
        self.runtime = runtime
        self.catalog_adapter = CatalogAdapter()
        self.entity_adapter = EntitySearchAdapter()
        self.standings_adapter = StandingsAdapter()

    def handle(
        self,
        method: str,
        path: str,
        *,
        query: str = "",
        body: bytes = b"",
        headers: dict[str, str] | None = None,
        client_ip: str = "unknown",
    ) -> tuple[int, dict[str, Any], dict[str, str]]:
        headers = {key.lower(): value for key, value in (headers or {}).items()}
        rid = request_id(headers.get("x-request-id"))
        timer = Timer()
        response_headers = {"X-Request-ID": rid}
        try:
            if len(query.encode("utf-8")) > 8192:
                raise ValidationError("Query string exceeds the 8192-byte limit.")
            policy = self._policy(method, path)
            limit, window = PUBLIC_RATE_POLICIES[policy]
            rate = self.runtime.limiter.check(policy, client_ip, limit, window)
            response_headers.update({
                "X-RateLimit-Limit": str(rate["limit"]),
                "X-RateLimit-Remaining": str(rate["remaining"]),
            })
            payload = self._dispatch(method, path, parse_qs(query, keep_blank_values=False), body, headers)
            status = 503 if path == "/api/status/ready" and payload.get("status") != "ready" else 200
        except RateLimitError as error:
            status = error.status
            payload = {"error": error.safe(rid)}
            response_headers["Retry-After"] = str(max(1, int(error.retry_after)))
        except EdgeBoardError as error:
            status = error.status
            payload = {"error": error.safe(rid)}
        except Exception as error:
            status = 500
            safe = EdgeBoardError("EdgeBoard encountered an internal error.")
            payload = {"error": safe.safe(rid)}
            self.runtime.logger.log("error", "api_unhandled_error", request_id=rid, route=path, error_code=type(error).__name__)
        self.runtime.metrics.increment("api_requests", route=path, status=status)
        self.runtime.metrics.observe("api_latency", timer.milliseconds, route=path)
        self.runtime.logger.log(
            "info" if status < 500 else "error",
            "api_request",
            request_id=rid,
            route=path,
            method=method,
            status=status,
            duration=timer.milliseconds,
        )
        return status, payload, response_headers

    def _dispatch(
        self,
        method: str,
        path: str,
        query: dict[str, list[str]],
        body: bytes,
        headers: dict[str, str],
    ) -> dict[str, Any]:
        if method == "GET":
            return self._get(path, query, headers)
        if method == "POST":
            data = self._json_body(body)
            return self._post(path, data, headers)
        raise ValidationError("HTTP method is unsupported for this endpoint.")

    def _get(self, path: str, query: dict[str, list[str]], headers: dict[str, str]) -> dict[str, Any]:
        if path in {"/api/status", "/api/status/live"}:
            return {
                "status": "ok",
                "service": "edgeboard-api",
                "providerConfigured": self.runtime.config.live_configured,
                "liveData": self.runtime.live_provider_verified,
            }
        if path == "/api/status/ready":
            health = self.runtime.database.health()
            return {
                "status": "ready" if health["connected"] else "not_ready",
                "database": health,
                "cache": self.runtime.cache.diagnostics(),
                "dataMode": self.runtime.config.public_config()["dataMode"],
            }
        if path == "/api/config/public":
            return self.runtime.config.public_config()
        if path in {"/api/provider-data", "/api/provider-status"}:
            bundle = self.runtime.gateway.get_bundle()
            return bundle if path.endswith("provider-data") else bundle["provider_status"]
        if path == "/api/sports":
            return self._provider_items("sport_catalog", query)
        if path == "/api/leagues":
            return self._provider_items("league_catalog", query)
        if path == "/api/events":
            bundle = self.runtime.gateway.get_bundle()
            return self._collection(bundle, "events", query)
        if path == "/api/entities":
            return self._provider_items("entity_search", query)
        if path == "/api/stats":
            bundle = self.runtime.gateway.get_bundle()
            return {
                "items": [*bundle["team_statistics"], *bundle["player_statistics"]],
                "source": bundle["provider_status"],
            }
        if path == "/api/leaderboards":
            return {"items": [], "coverage": "No server historical provider configured.", "sample": True}
        if path in {"/api/markets", "/api/odds"}:
            bundle = self.runtime.gateway.get_bundle()
            return self._collection(bundle, "offers", query)
        if path == "/api/injuries":
            return self._collection(self.runtime.gateway.get_bundle(), "injuries", query)
        if path == "/api/lineups":
            return self._collection(self.runtime.gateway.get_bundle(), "lineups", query)
        if path == "/api/standings":
            return self._provider_items("standings", query)
        if path == "/api/visualizations":
            return {"items": [], "message": "Visualizations remain deterministic client-side until normalized server evidence is configured."}
        if path == "/api/live/updates":
            if not self.runtime.config.live_configured:
                return {
                    "updates": [], "connection_state": "offline",
                    "next_poll_seconds": 60,
                    "warnings": ["No verified live provider is configured; live polling is inactive."],
                }
            visible = query.get("visible", ["true"])[0] != "false"
            events = query.get("eventId", [])
            result = self.runtime.live_updates.poll(visible=visible, event_ids=events)
            return asdict(result)
        if path == "/api/auth/status":
            principal = self._principal(headers)
            return {"mode": principal.mode, "authenticated": principal.authenticated}
        if path == "/api/workspaces":
            principal = self._principal(headers)
            if not self.runtime.config.flags.cloud_workspace_sync_enabled:
                return {"mode": "local_only", "enabled": False, "message": "Cloud workspace synchronization is not configured."}
            if not principal.authenticated:
                raise AuthenticationError("Optional sign-in is required for cloud workspaces.")
            rows = self.runtime.database.execute(
                "SELECT id,title,server_revision,updated_at FROM cloud_workspaces WHERE owner_id=? AND deleted_at IS NULL",
                (principal.user_id,),
            )
            return {"mode": "cloud", "items": rows}
        if path == "/api/alerts":
            if not self.runtime.config.flags.server_alerts_enabled:
                return {
                    "enabled": False,
                    "capabilities": {"inApp": False, "email": False, "push": False, "continuousMonitoring": False},
                    "continuousMonitoring": False,
                }
            return {"enabled": True, "capabilities": self.runtime.alerts.capabilities(), "continuousMonitoring": False}
        if path == "/api/admin/diagnostics":
            self._require_admin(headers)
            return {
                "configuration": self.runtime.config.redacted(),
                "providers": self.runtime.provider_manager.summary(),
                "cache": self.runtime.cache.diagnostics(),
                "database": self.runtime.database.health(),
                "jobs": self.runtime.ingestion.recent(),
                "schedules": schedule_manifest(self.runtime.config.app_env),
                "metrics": self.runtime.metrics.snapshot(),
                "sampleMode": not self.runtime.config.live_configured,
                "readOnly": True,
            }
        raise UnsupportedFeatureError("API endpoint is not implemented.")

    def _post(self, path: str, data: dict[str, Any], headers: dict[str, str]) -> dict[str, Any]:
        if path == "/api/research":
            return self.runtime.research.execute(data)
        if path == "/api/workspaces/sync":
            if not self.runtime.config.flags.cloud_workspace_sync_enabled:
                raise UnsupportedFeatureError("Cloud workspace synchronization is disabled.")
            principal = self._principal(headers)
            self.runtime.sessions.verify_csrf(principal, headers.get("x-csrf-token"))
            workspace_id = str(data.get("workspaceId") or "")
            result = self.runtime.workspace_sync.push(
                principal, workspace_id, data.get("objects") if isinstance(data.get("objects"), list) else [],
                int(data.get("baseRevision") or 0),
            )
            return {
                "accepted": list(result.accepted), "conflicts": list(result.conflicts),
                "serverRevision": result.server_revision,
            }
        if path == "/api/alerts/evaluate":
            if not self.runtime.config.flags.server_alerts_enabled:
                raise UnsupportedFeatureError("Server alert evaluation is disabled.")
            principal = self._principal(headers)
            self.runtime.sessions.verify_csrf(principal, headers.get("x-csrf-token"))
            requested_rule = data.get("rule") if isinstance(data.get("rule"), dict) else {}
            rule_id = str(requested_rule.get("id") or "").strip()
            stored = self.runtime.database.execute(
                """SELECT id,owner_id,category,condition_json,cooldown_seconds,last_known_json,
                   last_triggered_json,delivery_json FROM alert_rules
                   WHERE id=? AND owner_id=? AND enabled=1 AND deleted_at IS NULL""",
                (rule_id, principal.user_id),
            )
            if not stored:
                raise AuthorizationError("Alert rule is unavailable or not owned by this account.")
            row = stored[0]
            last_known = json.loads(row["last_known_json"]) if row["last_known_json"] else None
            last_triggered = json.loads(row["last_triggered_json"]) if row["last_triggered_json"] else {}
            rule = {
                "id": row["id"],
                "ownerId": row["owner_id"],
                "category": row["category"],
                "condition": json.loads(row["condition_json"]),
                "cooldownSeconds": row["cooldown_seconds"],
                "lastKnownValue": last_known.get("value") if isinstance(last_known, dict) else last_known,
                "lastTriggeredAt": last_triggered.get("at") if isinstance(last_triggered, dict) else None,
                "lastTriggeredValue": last_triggered.get("value") if isinstance(last_triggered, dict) else None,
                "delivery": json.loads(row["delivery_json"]),
            }
            result = self.runtime.alerts.evaluate(rule, data.get("reading") or {})
            if result.triggered and result.event:
                self.runtime.alerts.persist_event(result.event)
            return {"triggered": result.triggered, "reason": result.reason, "event": result.event}
        if path == "/api/admin/jobs/run":
            self._require_admin(headers)
            if data.get("confirmation") != "RUN INGESTION JOB":
                raise ValidationError("Administrative ingestion requires explicit confirmation.")
            result = self.runtime.ingestion.run(
                str(data.get("jobType") or ""),
                provider=str(data.get("provider") or ""),
                sport_id=str(data.get("sportId") or ""),
                league_id=str(data.get("leagueId") or ""),
                date_scope=str(data.get("dateScope") or ""),
            )
            return asdict(result)
        if path == "/api/auth/logout":
            principal = self._principal(headers)
            self.runtime.sessions.verify_csrf(principal, headers.get("x-csrf-token"))
            self.runtime.sessions.logout(principal)
            return {"authenticated": False}
        raise UnsupportedFeatureError("API endpoint is not implemented.")

    def _provider_items(self, domain: str, query: dict[str, list[str]]) -> dict[str, Any]:
        scope = {"leagueId": query["leagueId"][0]} if query.get("leagueId") else None
        result = self.runtime.provider_manager.fetch(domain, scope, allow_sample=True)
        if domain == "sport_catalog":
            items = self.catalog_adapter.sports(result.data, result.provider)
        elif domain == "league_catalog":
            items = self.catalog_adapter.leagues(result.data, result.provider)
        elif domain == "entity_search":
            items = self.entity_adapter.adapt(result.data, result.provider)
        elif domain == "standings":
            items = self.standings_adapter.adapt(result.data, result.provider)
        else:
            items = []
        return {
            "items": items if isinstance(items, list) else [],
            "provider": result.provider,
            "fallbackUsed": result.fallback_used,
            "warnings": list(result.warnings),
            "sample": result.provider == "edgeboard-recorded-fixture",
        }

    @staticmethod
    def _collection(bundle: dict[str, Any], key: str, query: dict[str, list[str]]) -> dict[str, Any]:
        league_id = query.get("leagueId", [""])[0]
        event_id = query.get("eventId", [""])[0]
        items = [
            item for item in bundle.get(key, [])
            if (not league_id or item.get("league_key") == league_id)
            and (not event_id or item.get("event_id") == event_id)
        ]
        return {"items": items, "source": bundle.get("provider_status", {}), "sample": bundle.get("provider_status", {}).get("mode") == "sample"}

    def _principal(self, headers: dict[str, str]) -> Principal:
        cookie_token = next((
            part.split("=", 1)[1]
            for part in headers.get("cookie", "").split(";")
            if part.strip().startswith("edgeboard_session=")
        ), None)
        authorization = headers.get("authorization", "")
        token = cookie_token or (authorization[7:] if authorization.lower().startswith("bearer ") else None)
        return self.runtime.sessions.authenticate(token)

    def _require_admin(self, headers: dict[str, str]) -> None:
        configured = self.runtime.config.admin_token
        supplied = headers.get("x-edgeboard-admin", "")
        if not configured or not hmac.compare_digest(supplied, configured):
            raise AuthorizationError("Administrative diagnostics are unavailable.")

    @staticmethod
    def _json_body(body: bytes) -> dict[str, Any]:
        if not body:
            return {}
        try:
            value = json.loads(body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise ValidationError("Request body must be valid JSON.") from error
        if not isinstance(value, dict):
            raise ValidationError("Request body must be a JSON object.")
        return value

    @staticmethod
    def _policy(method: str, path: str) -> str:
        if path.startswith("/api/auth"): return "authentication"
        if path.startswith("/api/workspaces") and method != "GET": return "workspace_write"
        if path.startswith("/api/research"): return "research"
        if path.startswith("/api/live"): return "live"
        if path in {"/api/odds", "/api/markets"}: return "odds"
        if path in {"/api/stats", "/api/leaderboards"}: return "historical"
        if path == "/api/entities": return "search"
        return "metadata"
