from __future__ import annotations

import json
import hmac
from dataclasses import asdict
from datetime import date, datetime, timezone
from typing import Any
from urllib.parse import parse_qs

from .adapters import CatalogAdapter, EntitySearchAdapter, StandingsAdapter
from .auth import Principal
from .database import utc_now
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
from .rollout_adapters import RolloutFixtureAdapter
from .rollout_schedules import league_schedule
from .shadow import compare_shadow
from .edge_trust import trust_from_coverage


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

    def _edge_trust(self, league: dict[str, Any], *, include_internal: bool = False) -> dict[str, Any]:
        conflicts = self.runtime.shadow.active_conflicts(league["leagueId"], limit=10)
        return trust_from_coverage(league, conflicts=conflicts, include_internal=include_internal)

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
        if path == "/api/coverage":
            if not self.runtime.config.flags.coverage_page_enabled:
                raise UnsupportedFeatureError("The public data-coverage page is disabled.")
            coverage = self.runtime.rollout.list_coverage(public=True)
            public_certification = self.runtime.mlb_certification.report(public=True)
            public_leagues = []
            for league in coverage:
                public_leagues.append({**league, "edgeTrust": self._edge_trust(league),
                    **({"certificationDomains": public_certification["domains"],
                        "lastCertification": max((item.get("lastCertifiedAt") or "" for item in public_certification["domains"]), default="") or None}
                       if league["leagueId"] == "mlb" else {})})
            return {
                "generatedAt": utc_now(),
                "liveProviderVerified": self.runtime.live_provider_verified,
                "leagues": public_leagues,
                "labels": ["Certified Live", "Limited Live", "Delayed", "Degraded", "Fixture", "Sample", "Unavailable"],
                "notice": "Fixture and sample evidence are not live data. No league is promoted automatically.",
            }
        if path == "/api/certification/mlb":
            return self.runtime.mlb_certification.report(public=True)
        if path in {"/api/provider-data", "/api/provider-status"}:
            bundle = self.runtime.mlb_schedule_entities.provider_bundle(self.runtime.gateway.get_bundle())
            bundle = self.runtime.mlb_standings_leaders.provider_bundle(bundle)
            bundle = self.runtime.mlb_game_markets.provider_bundle(bundle)
            bundle = self.runtime.mlb_player_props.provider_bundle(bundle)
            bundle = self.runtime.mlb_context.provider_bundle(bundle)
            bundle = self.runtime.mlb_live_state.provider_bundle(bundle)
            bundle["offers"] = self.runtime.market_movement.enrich_offers(bundle.get("offers", []))
            bundle["provider_status"] = {
                **bundle.get("provider_status", {}),
                "market_movement": self.runtime.market_movement.diagnostics(),
            }
            bundle["mlb_certification"] = self.runtime.mlb_certification.report(public=True)
            return bundle if path.endswith("provider-data") else bundle["provider_status"]
        if path == "/api/sports":
            return self._provider_items("sport_catalog", query)
        if path == "/api/leagues":
            return self._provider_items("league_catalog", query)
        if path == "/api/events":
            if query.get("leagueId", [""])[0] == "mlb":
                schedule = self.runtime.mlb_schedule_entities.schedule(
                    selected_date=query.get("date", [""])[0], status="",
                )
                schedule["items"] = [self.runtime.mlb_live_state.enrich_game(item) for item in schedule["items"]]
                requested_status = query.get("status", [""])[0]
                if requested_status:
                    accepted = {"in_progress", "resumed"} if requested_status == "live" else {requested_status}
                    schedule["items"] = [item for item in schedule["items"] if (item.get("liveState") or {}).get("status", item.get("status")) in accepted]
                return schedule
            bundle = self.runtime.gateway.get_bundle()
            return self._collection(bundle, "events", query)
        if path == "/api/entities":
            if query.get("leagueId", [""])[0] == "mlb":
                return self.runtime.mlb_schedule_entities.search(query.get("q", [""])[0])
            return self._provider_items("entity_search", query)
        if path.startswith("/api/entities/"):
            item = self.runtime.mlb_schedule_entities.entity(path.removeprefix("/api/entities/"))
            if item is None:
                raise ValidationError("Unknown MLB entity.")
            return {"item": self.runtime.mlb_live_state.enrich_entity(self.runtime.mlb_context.enrich_entity(item))}
        if path.startswith("/api/games/"):
            item = self.runtime.mlb_schedule_entities.game(path.removeprefix("/api/games/"))
            if item is None:
                raise ValidationError("Unknown MLB game.")
            return {"item": self.runtime.mlb_live_state.enrich_game(self.runtime.mlb_context.enrich_game(item))}
        if path == "/api/stats":
            bundle = self.runtime.gateway.get_bundle()
            return {
                "items": [*bundle["team_statistics"], *bundle["player_statistics"]],
                "source": bundle["provider_status"],
            }
        if path == "/api/leaderboards":
            if query.get("leagueId", ["mlb"])[0] == "mlb":
                return self.runtime.mlb_standings_leaders.leaderboard(
                    query.get("statId", ["baseball-home-runs"])[0],
                    self._season(query),
                    entity_type=query.get("entityType", ["player"])[0],
                    qualified_only=query.get("qualified", ["true"])[0].lower() != "false",
                    limit=self._positive_limit(query.get("limit", ["10"])[0]),
                )
            return {"items": [], "coverage": "No server historical provider configured for this league.", "sample": True}
        if path in {"/api/markets", "/api/odds"}:
            if query.get("leagueId", [""])[0] == "mlb":
                return self.runtime.mlb_game_markets.markets(
                    event_id=query.get("eventId", [""])[0], family=query.get("family", [""])[0],
                    sportsbook_id=query.get("sportsbookId", [""])[0],
                    include_suspended=query.get("includeSuspended", ["true"])[0].lower() != "false",
                )
            bundle = self.runtime.gateway.get_bundle()
            return self._collection(bundle, "offers", query)
        if path == "/api/sportsbooks":
            return self.runtime.mlb_game_markets.sportsbooks()
        if path == "/api/best-prices":
            return self.runtime.mlb_game_markets.best_prices(
                event_id=query.get("eventId", [""])[0], family=query.get("family", [""])[0],
            )
        if path == "/api/player-props":
            return self.runtime.mlb_player_props.props(
                event_id=query.get("eventId", [""])[0], player_id=query.get("playerId", [""])[0],
                family=query.get("family", [""])[0], sportsbook_id=query.get("sportsbookId", [""])[0],
                include_suspended=query.get("includeSuspended", ["true"])[0].lower() != "false",
            )
        if path == "/api/prop-best-prices":
            return self.runtime.mlb_player_props.best_prices(
                event_id=query.get("eventId", [""])[0], family=query.get("family", [""])[0],
            )
        if path == "/api/prop-best-lines":
            return self.runtime.mlb_player_props.best_lines(
                event_id=query.get("eventId", [""])[0], family=query.get("family", [""])[0],
            )
        if path == "/api/market-movement":
            return self.runtime.market_movement.timeline(
                series_id=query.get("seriesId", [""])[0],
                event_id=query.get("eventId", [""])[0],
                player_id=query.get("playerId", [""])[0],
                sportsbook_id=query.get("sportsbookId", [""])[0],
                market_id=query.get("marketId", [""])[0],
            )
        if path == "/api/market-movement/recent":
            return self.runtime.market_movement.recent(
                event_id=query.get("eventId", [""])[0], player_id=query.get("playerId", [""])[0],
                market_id=query.get("marketId", [""])[0],
                meaningful_only=query.get("meaningful", ["true"])[0].lower() != "false",
                limit=self._positive_limit(query.get("limit", ["50"])[0]),
            )
        if path == "/api/market-movement/consensus":
            return self.runtime.market_movement.consensus(
                event_id=query.get("eventId", [""])[0], market_id=query.get("marketId", [""])[0],
                player_id=query.get("playerId", [""])[0],
            )
        if path.startswith("/api/prop-research/"):
            return self.runtime.mlb_player_props.research(path.removeprefix("/api/prop-research/"))
        if path in {"/api/injuries", "/api/availability"}:
            return self.runtime.mlb_context.collection("availability", player_id=query.get("playerId", [""])[0], team_id=query.get("teamId", [""])[0])
        if path == "/api/rosters":
            return self.runtime.mlb_context.collection("rosters", player_id=query.get("playerId", [""])[0], team_id=query.get("teamId", [""])[0])
        if path == "/api/lineups":
            return self.runtime.mlb_context.collection("lineups", event_id=query.get("eventId", [""])[0], team_id=query.get("teamId", [""])[0])
        if path == "/api/probable-starters":
            return self.runtime.mlb_context.collection("starters", event_id=query.get("eventId", [""])[0], team_id=query.get("teamId", [""])[0])
        if path == "/api/weather":
            return self.runtime.mlb_context.collection("weather", event_id=query.get("eventId", [""])[0])
        if path == "/api/transactions":
            return self.runtime.mlb_context.collection("transactions", player_id=query.get("playerId", [""])[0], team_id=query.get("teamId", [""])[0])
        if path == "/api/mlb-context/events":
            return self.runtime.mlb_context.collection("contextualEvents", player_id=query.get("playerId", [""])[0], team_id=query.get("teamId", [""])[0], event_id=query.get("eventId", [""])[0])
        if path == "/api/mlb-context":
            return self.runtime.mlb_context.context(player_id=query.get("playerId", [""])[0], team_id=query.get("teamId", [""])[0], event_id=query.get("eventId", [""])[0])
        if path == "/api/live/mlb":
            return self.runtime.mlb_live_state.read()
        if path.startswith("/api/live/mlb/"):
            remainder = path.removeprefix("/api/live/mlb/")
            if remainder.endswith("/history"):
                event_id = remainder.removesuffix("/history")
                return self.runtime.mlb_live_state.history(event_id)
            if remainder.endswith("/research"):
                event_id = remainder.removesuffix("/research")
                return self.runtime.mlb_live_state.answer(event_id, query.get("q", [""])[0])
            state = self.runtime.mlb_live_state.state(remainder)
            if state is None:
                raise ValidationError("Unknown MLB live-state event.")
            return {"item": state}
        if path == "/api/standings":
            if query.get("leagueId", ["mlb"])[0] == "mlb":
                return self.runtime.mlb_standings_leaders.standings(self._season(query))
            return self._provider_items("standings", query)
        if path.startswith("/api/team-records/"):
            item = self.runtime.mlb_standings_leaders.team_record(
                path.removeprefix("/api/team-records/"), self._season(query),
            )
            if item is None:
                raise ValidationError("Unknown MLB team record.")
            return item
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
            rollouts = self.runtime.rollout.list_coverage(public=False)
            expected_capabilities = [
                (self.runtime.gateway.provider.provider_id, league["leagueId"], domain["canonicalDomain"])
                for league in rollouts for domain in league["domains"]
            ]
            capability_summary = self.runtime.capabilities.summary(expected_capabilities)
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
                "rollouts": rollouts,
                "edgeTrust": [{"leagueId": league["leagueId"], **self._edge_trust(league, include_internal=True)} for league in rollouts],
                "shadow": self.runtime.shadow.summary(),
                "usage": self.runtime.usage.summary(),
                "researchQualityHistory": self.runtime.edge_trust.history(limit=100),
                "mlbCertification": self.runtime.mlb_certification.report(public=False),
                "providerBoundary": {
                    "dataMode": self.runtime.config.data_mode,
                    "configurationValid": not self.runtime.config.validate()[0],
                    "capabilities": capability_summary,
                    "fixtureAvailable": bool(capability_summary["fixtureDeclarationCount"]),
                    "health": self.runtime.gateway.provider.health_status()
                    if hasattr(self.runtime.gateway.provider, "health_status") else {"state": "not_checked"},
                },
            }
        if path == "/api/admin/mlb/shadow/status":
            self._require_admin(headers)
            return self.runtime.mlb_schedule_entities.shadow_diagnostics()
        if path == "/api/admin/mlb/standings-leaders/status":
            self._require_admin(headers)
            return self.runtime.mlb_standings_leaders.shadow_status()
        if path == "/api/admin/mlb/odds/status":
            self._require_admin(headers)
            return self.runtime.mlb_game_markets.shadow_status()
        if path == "/api/admin/mlb/player-props/status":
            self._require_admin(headers)
            return self.runtime.mlb_player_props.shadow_status()
        if path == "/api/admin/mlb/context/status":
            self._require_admin(headers)
            return self.runtime.mlb_context.shadow_status()
        if path == "/api/admin/mlb/live-state/status":
            self._require_admin(headers)
            return self.runtime.mlb_live_state.diagnostics()
        if path == "/api/admin/mlb/certification/status":
            self._require_admin(headers)
            return self.runtime.mlb_certification.report(public=False)
        if path == "/api/admin/mlb/shadow-window/status":
            self._require_admin(headers)
            return self.runtime.mlb_shadow_window.status(query.get("windowId", [""])[0])
        if path == "/api/admin/mlb/shadow-window/report":
            self._require_admin(headers)
            return self.runtime.mlb_shadow_window.report(query.get("windowId", [""])[0])
        if path == "/api/admin/mlb/shadow-window/reviews":
            self._require_admin(headers)
            return {"items": self.runtime.mlb_shadow_window.reviews(
                query.get("windowId", [""])[0], status=query.get("status", [""])[0],
            )}
        if path == "/api/admin/mlb/shadow-window/mappings":
            self._require_admin(headers)
            return {"items": self.runtime.mlb_shadow_window.mappings(query.get("windowId", [""])[0])}
        if path == "/api/admin/mlb/identity/status":
            self._require_admin(headers)
            return self.runtime.mlb_identity.metrics()
        if path == "/api/admin/mlb/identity/review-queue":
            self._require_admin(headers)
            try:
                review_limit = int(query.get("limit", ["100"])[0])
            except (TypeError, ValueError) as error:
                raise ValidationError("Identity review limit must be an integer.") from error
            return {"items": self.runtime.mlb_identity.list_review_queue(
                entity_type=query.get("entityType", [""])[0] or None,
                limit=review_limit,
            )}
        if path == "/api/admin/mlb/market-movement/status":
            self._require_admin(headers)
            return self.runtime.market_movement.diagnostics()
        if path == "/api/admin/certification":
            self._require_admin(headers)
            coverage = self.runtime.rollout.list_coverage(public=False)
            checklists = [self.runtime.certification.checklist(item["leagueId"]) for item in coverage]
            return {
                "readOnly": True, "rollouts": coverage, "certification": checklists,
                "edgeTrust": [{"leagueId": league["leagueId"], **self._edge_trust(league, include_internal=True)} for league in coverage],
                "shadow": self.runtime.shadow.summary(), "usage": self.runtime.usage.summary(),
                "schedules": {item["leagueId"]: league_schedule(item["leagueId"]) for item in coverage},
                "researchQualityHistory": self.runtime.edge_trust.history(limit=100),
                "mlbCertification": self.runtime.mlb_certification.report(public=False),
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
        if path == "/api/admin/rollout/transition":
            self._require_admin(headers)
            result = self.runtime.rollout.transition(
                str(data.get("leagueId") or ""), str(data.get("state") or ""), actor="admin-token",
                reason=str(data.get("reason") or ""), confirmation=str(data.get("confirmation") or ""),
                certification_service=self.runtime.certification,
            )
            self.runtime.cache.invalidate(tag=f"league:{result.league_id}")
            self.runtime.edge_trust.evaluate_league(self.runtime.rollout.get(result.league_id), trigger="rollout_transition", record=True)
            return asdict(result)
        if path == "/api/admin/mlb/certification/state":
            self._require_admin(headers)
            return self.runtime.mlb_certification.set_state(
                str(data.get("domain") or ""), str(data.get("state") or ""),
                actor="admin-token", reason=str(data.get("reason") or ""),
                confirmation=str(data.get("confirmation") or ""),
            )
        if path == "/api/admin/mlb/certification/control":
            self._require_admin(headers)
            if data.get("confirmation") != "UPDATE MLB OPERATIONAL CONTROL":
                raise ValidationError("Operational controls require explicit confirmation.")
            return self.runtime.mlb_certification.set_control(
                str(data.get("control") or ""), data.get("enabled") is True,
                actor="admin-token", reason=str(data.get("reason") or ""),
                domain_id=str(data.get("domain") or ""),
            )
        if path == "/api/admin/mlb/certification/health":
            self._require_admin(headers)
            if data.get("confirmation") != "EVALUATE MLB DOMAIN HEALTH":
                raise ValidationError("Domain-health evaluation requires explicit confirmation.")
            return self.runtime.mlb_certification.evaluate_health(
                str(data.get("domain") or ""),
                data.get("metrics") if isinstance(data.get("metrics"), dict) else {},
            )
        if path == "/api/admin/mlb/shadow-window/start":
            self._require_admin(headers)
            return self.runtime.mlb_shadow_window.start(
                confirmation=str(data.get("confirmation") or ""), actor="admin-token",
                request_budget=data.get("requestBudget"), duration_minutes=data.get("durationMinutes"),
                date_start=str(data.get("dateStart") or ""), date_end=str(data.get("dateEnd") or ""),
                event_ids=data.get("eventIds") if isinstance(data.get("eventIds"), list) else [],
                domains=data.get("domains") if isinstance(data.get("domains"), list) else None,
                domain_budgets=data.get("domainBudgets") if isinstance(data.get("domainBudgets"), dict) else {},
                endpoint_budgets=data.get("endpointBudgets") if isinstance(data.get("endpointBudgets"), dict) else {},
            )
        if path == "/api/admin/mlb/shadow-window/run":
            self._require_admin(headers)
            if data.get("confirmation") != "RUN BOUNDED MLB SHADOW CYCLE":
                raise ValidationError("Running an MLB shadow cycle requires explicit confirmation.")
            window_id = str(data.get("windowId") or "")
            status = self.runtime.mlb_shadow_window.status(window_id)
            selected_date = status.get("dateRange", {}).get("start") or datetime.now(timezone.utc).date().isoformat()
            end_date = status.get("dateRange", {}).get("end") or selected_date
            season = date.fromisoformat(selected_date).year
            return self.runtime.mlb_shadow_window.run_once(window_id, {
                "schedule_entities": lambda: self.runtime.mlb_schedule_entities.run_shadow_validation(start_date=selected_date, end_date=end_date, refresh=True),
                "standings_leaders": lambda: self.runtime.mlb_standings_leaders.run_shadow_validation(season=season, refresh=True),
                "markets": lambda: self.runtime.mlb_game_markets.run_shadow_validation(selected_date=selected_date, refresh=True),
                "player_props": lambda: self.runtime.mlb_player_props.run_shadow_validation(selected_date=selected_date, refresh=True),
                "context": lambda: self.runtime.mlb_context.run_shadow_validation(selected_date=selected_date, refresh=True),
                "live_state": lambda: self.runtime.mlb_live_state.run_shadow_validation(selected_date=selected_date, event_ids=status.get("eventIds") or []),
            })
        if path == "/api/admin/mlb/shadow-window/stop":
            self._require_admin(headers)
            return self.runtime.mlb_shadow_window.stop(
                str(data.get("windowId") or ""), confirmation=str(data.get("confirmation") or ""),
                reason=str(data.get("reason") or ""), actor="admin-token",
            )
        if path == "/api/admin/mlb/shadow-window/review":
            self._require_admin(headers)
            return self.runtime.mlb_shadow_window.update_review(
                str(data.get("reviewId") or ""), status=str(data.get("status") or ""),
            )
        if path == "/api/admin/mlb/shadow-window/mapping":
            self._require_admin(headers)
            return self.runtime.mlb_shadow_window.correct_mapping(
                str(data.get("mappingId") or ""), canonical_id=str(data.get("canonicalId") or ""),
                actor="admin-token", reason=str(data.get("reason") or ""),
                confirmation=str(data.get("confirmation") or ""),
            )
        if path == "/api/admin/mlb/identity/review":
            self._require_admin(headers)
            if data.get("confirmation") != "APPLY MLB IDENTITY REVIEW":
                raise ValidationError("Identity review requires explicit confirmation.")
            return self.runtime.mlb_identity.review(
                str(data.get("providerId") or ""), str(data.get("action") or ""),
                canonical_id=str(data.get("canonicalId") or "") or None,
                actor="admin-token", reason=str(data.get("reason") or ""),
                alias=str(data.get("alias") or "") or None,
            )
        if path == "/api/admin/rollout/domain":
            self._require_admin(headers)
            league_id, domain = str(data.get("leagueId") or ""), str(data.get("domain") or "")
            self.runtime.rollout.set_domain(
                league_id, domain, str(data.get("readiness") or ""), str(data.get("sourceMode") or ""),
                actor="admin-token", evidence=data.get("evidence") if isinstance(data.get("evidence"), dict) else {},
                limitations=data.get("limitations") if isinstance(data.get("limitations"), list) else [],
                provider=str(data.get("provider") or ""),
            )
            self.runtime.cache.invalidate(tag=f"league:{league_id}")
            self.runtime.edge_trust.evaluate_league(self.runtime.rollout.get(league_id), trigger=f"domain_validation:{domain}", record=True)
            return {"league": self.runtime.rollout.get(league_id), "domain": domain}
        if path == "/api/admin/rollout/provider":
            self._require_admin(headers)
            league_id = str(data.get("leagueId") or "")
            self.runtime.rollout.switch_provider(league_id, str(data.get("provider") or ""), actor="admin-token", reason=str(data.get("reason") or ""))
            self.runtime.cache.invalidate(tag=f"league:{league_id}")
            self.runtime.edge_trust.evaluate_league(self.runtime.rollout.get(league_id), trigger="provider_changed", record=True)
            return {"league": self.runtime.rollout.get(league_id)}
        if path == "/api/admin/cache/clear":
            self._require_admin(headers)
            if data.get("confirmation") != "CLEAR PUBLIC CACHE":
                raise ValidationError("Clearing public cache requires explicit confirmation.")
            return {"cleared": self.runtime.cache.clear_public(), "privateEntriesPreserved": True}
        if path == "/api/admin/certification/record":
            self._require_admin(headers)
            result_id = self.runtime.certification.record(
                str(data.get("leagueId") or ""), str(data.get("category") or ""), str(data.get("checkKey") or ""),
                str(data.get("status") or ""), evidence=data.get("evidence") if isinstance(data.get("evidence"), dict) else {},
                actor="admin-token", evidence_at=data.get("evidenceAt"), expires_at=data.get("expiresAt"),
                notes=str(data.get("notes") or ""),
            )
            league_id = str(data.get("leagueId") or "")
            self.runtime.edge_trust.evaluate_league(self.runtime.rollout.get(league_id), trigger="certification_recorded", record=True)
            return {"resultId": result_id, "checklist": self.runtime.certification.checklist(league_id)}
        if path == "/api/admin/shadow/compare":
            self._require_admin(headers)
            league_id = str(data.get("leagueId") or "")
            domain = str(data.get("domain") or "")
            discrepancies = compare_shadow(data.get("primary"), data.get("secondary"), domain=domain)
            self.runtime.shadow.record(league_id, domain, str(data.get("primaryProvider") or "primary"), str(data.get("secondaryProvider") or "secondary"), discrepancies)
            return {"discrepancies": discrepancies, "summary": self.runtime.shadow.summary(league_id)}
        if path == "/api/admin/mlb/shadow/compare":
            self._require_admin(headers)
            provider = str(data.get("provider") or "").strip()
            candidate = data.get("candidate")
            if not provider or not isinstance(candidate, dict):
                raise ValidationError("MLB shadow comparison requires a provider and candidate payload.")
            return self.runtime.mlb_schedule_entities.compare_shadow_candidate(candidate, provider)
        if path == "/api/admin/mlb/shadow/validate":
            self._require_admin(headers)
            if data.get("confirmation") != "VALIDATE MLB SHADOW":
                raise ValidationError("MLB shadow validation requires explicit confirmation.")
            return self.runtime.mlb_schedule_entities.run_shadow_validation(
                start_date=str(data.get("startDate") or ""),
                end_date=str(data.get("endDate") or ""),
                refresh=data.get("refresh") is True,
            )
        if path == "/api/admin/mlb/standings-leaders/validate":
            self._require_admin(headers)
            if data.get("confirmation") != "VALIDATE MLB STANDINGS LEADERS":
                raise ValidationError("MLB standings/leader validation requires explicit confirmation.")
            try:
                season = int(data.get("season") or datetime.now(timezone.utc).year)
            except (TypeError, ValueError) as error:
                raise ValidationError("MLB season must be an integer.") from error
            return self.runtime.mlb_standings_leaders.run_shadow_validation(
                season=season, refresh=data.get("refresh") is True,
            )
        if path == "/api/admin/mlb/odds/validate":
            self._require_admin(headers)
            if data.get("confirmation") != "VALIDATE MLB ODDS":
                raise ValidationError("MLB odds validation requires explicit confirmation.")
            selected_date = str(data.get("date") or "")
            try:
                date.fromisoformat(selected_date)
            except ValueError as error:
                raise ValidationError("MLB odds date must use YYYY-MM-DD.") from error
            return self.runtime.mlb_game_markets.run_shadow_validation(
                selected_date=selected_date, refresh=data.get("refresh") is True,
            )
        if path == "/api/admin/mlb/player-props/validate":
            self._require_admin(headers)
            if data.get("confirmation") != "VALIDATE MLB PLAYER PROPS":
                raise ValidationError("MLB player-prop validation requires explicit confirmation.")
            selected_date = str(data.get("date") or "")
            try:
                date.fromisoformat(selected_date)
            except ValueError as error:
                raise ValidationError("MLB player-prop date must use YYYY-MM-DD.") from error
            return self.runtime.mlb_player_props.run_shadow_validation(
                selected_date=selected_date, refresh=data.get("refresh") is True,
            )
        if path == "/api/admin/mlb/context/validate":
            self._require_admin(headers)
            if data.get("confirmation") != "VALIDATE MLB CONTEXT":
                raise ValidationError("MLB context validation requires explicit confirmation.")
            selected_date = str(data.get("date") or "")
            try:
                date.fromisoformat(selected_date)
            except ValueError as error:
                raise ValidationError("MLB context date must use YYYY-MM-DD.") from error
            return self.runtime.mlb_context.run_shadow_validation(
                selected_date=selected_date, refresh=data.get("refresh") is True,
            )
        if path == "/api/admin/mlb/live-state/validate":
            self._require_admin(headers)
            if data.get("confirmation") != "VALIDATE MLB LIVE STATE":
                raise ValidationError("MLB live-state validation requires explicit confirmation.")
            selected_date = str(data.get("date") or "")
            try:
                date.fromisoformat(selected_date)
            except ValueError as error:
                raise ValidationError("MLB live-state date must use YYYY-MM-DD.") from error
            event_ids = data.get("eventIds") if isinstance(data.get("eventIds"), list) else []
            return self.runtime.mlb_live_state.run_shadow_validation(selected_date=selected_date, event_ids=event_ids)
        if path == "/api/admin/mlb/live-state/poll":
            self._require_admin(headers)
            if data.get("confirmation") != "POLL MLB LIVE STATE ONCE":
                raise ValidationError("MLB live-state polling requires explicit confirmation.")
            selected_date = str(data.get("date") or "")
            try:
                date.fromisoformat(selected_date)
            except ValueError as error:
                raise ValidationError("MLB live-state date must use YYYY-MM-DD.") from error
            event_ids = data.get("eventIds") if isinstance(data.get("eventIds"), list) else []
            self.runtime.mlb_live_state.configure_polling(enabled=data.get("enabled") is True, event_ids=event_ids[:3])
            return self.runtime.mlb_live_state.poll_shadow_once(selected_date=selected_date)
        if path == "/api/admin/mlb/market-movement/capture":
            self._require_admin(headers)
            if data.get("confirmation") != "CAPTURE MLB MARKET MOVEMENT":
                raise ValidationError("MLB market movement capture requires explicit confirmation.")
            return self.runtime.market_movement.capture_normalized(
                self.runtime.mlb_game_markets.read(refresh=data.get("refresh") is True),
                self.runtime.mlb_player_props.read(refresh=data.get("refresh") is True),
            )
        if path == "/api/admin/mlb/refresh":
            self._require_admin(headers)
            if data.get("confirmation") != "REFRESH MLB SCHEDULES":
                raise ValidationError("MLB refresh requires explicit confirmation.")
            refreshed = self.runtime.mlb_schedule_entities.refresh()
            return {"refreshed": True, "source": refreshed["source"], "counts": {"games": len(refreshed["games"]), "entities": len(refreshed["entities"])}}
        if path == "/api/admin/fixtures/validate":
            self._require_admin(headers)
            adapter = RolloutFixtureAdapter()
            league_id = str(data.get("leagueId") or "")
            normalized = adapter.normalize(league_id)
            return {
                "leagueId": league_id, "fixture": adapter.metadata,
                "counts": {key: len(normalized[key]) for key in ("entities", "events", "statistics", "markets", "rejected_markets")},
                "sourceMode": normalized["source_mode"],
            }
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

    @staticmethod
    def _season(query: dict[str, list[str]]) -> int:
        raw = query.get("season", [str(datetime.now(timezone.utc).year)])[0]
        try:
            season = int(raw)
        except (TypeError, ValueError) as error:
            raise ValidationError("Season must be an integer.") from error
        if season < 1876 or season > datetime.now(timezone.utc).year + 1:
            raise ValidationError("Season is outside the supported MLB range.")
        return season

    @staticmethod
    def _positive_limit(raw: Any) -> int:
        try:
            value = int(raw)
        except (TypeError, ValueError) as error:
            raise ValidationError("Limit must be an integer.") from error
        if not 1 <= value <= 100:
            raise ValidationError("Limit must be between 1 and 100.")
        return value

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
        if path in {"/api/odds", "/api/markets"} or path.startswith("/api/market-movement"): return "odds"
        if path in {"/api/stats", "/api/leaderboards"}: return "historical"
        if path == "/api/entities" or path.startswith("/api/entities/"): return "search"
        return "metadata"
