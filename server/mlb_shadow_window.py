from __future__ import annotations

import copy
import json
import math
import threading
import uuid
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from typing import Any, Callable

from .database import Database, utc_now
from .errors import ProviderError, ShadowBudgetExhaustedError, ValidationError
from .mlb_certification import DOMAIN_DEFINITIONS


WINDOW_VERSION = "mlb-shadow-window-v1"
WINDOW_STATUSES = {"active", "completed", "stopped", "budget_exhausted", "expired", "failed"}
ENTITLEMENT_STATES = {
    "entitled_and_working", "entitled_but_empty", "entitlement_denied",
    "endpoint_unavailable", "unsupported_by_plan", "provider_error",
    "configuration_error", "not_tested",
}
RECOMMENDATIONS = {
    "insufficient_sample", "remain_fixture", "remain_shadow",
    "candidate_limited_live", "candidate_certified_live", "blocked_entitlement",
    "blocked_licensing", "blocked_infrastructure", "blocked_quality",
}
REVIEW_STATES = {
    "open", "expected_difference", "fixture_issue", "provider_issue",
    "normalization_issue", "mapping_issue", "resolved",
}
DISCREPANCY_TYPES = {
    "provider_more_current", "fixture_more_current", "expected_fixture_gap",
    "expected_live_gap", "identity_conflict", "event_conflict", "value_conflict",
    "status_conflict", "scope_conflict", "timestamp_conflict",
    "provider_correction", "fixture_staleness", "unsupported_comparison", "unresolved",
}

DOMAIN_IDS = {item[0] for item in DOMAIN_DEFINITIONS}
GROUP_DOMAINS = {
    "schedule_entities": (
        "league_metadata", "teams", "venues", "players", "schedules",
        "event_identity", "event_status", "completed_game_results",
    ),
    "standings_leaders": (
        "batter_game_logs", "pitcher_game_logs", "team_game_logs",
        "season_statistics", "historical_summaries", "standings",
        "division_standings", "qualified_leaderboards", "team_records", "rank_movement",
    ),
    "markets": (
        "sportsbooks", "moneyline", "run_line", "totals", "best_available_price",
        "market_status", "market_movement", "price_history",
    ),
    "player_props": ("player_props",),
    "context": (
        "injuries", "roster_status", "projected_lineups", "confirmed_lineups",
        "probable_starters", "weather", "contextual_events",
    ),
    "live_state": (
        "live_event_status", "live_score", "inning_state", "outs",
        "live_participants", "finalization", "corrections",
    ),
}
DOMAIN_GROUP = {domain: group for group, domains in GROUP_DOMAINS.items() for domain in domains}

_ENDPOINT_DOMAINS = {
    "AllTeams": "teams", "Stadiums": "venues", "Players": "players",
    "GamesByDate": "schedules", "Standings": "standings",
    "PlayerSeasonStats": "season_statistics", "TeamSeasonStats": "team_records",
    "BettingEventsByDate": "sportsbooks", "BettingMarketsByDate": "moneyline",
    "PlayerPropsByDate": "player_props", "Injuries": "injuries",
    "PlayerGameProjectionStatsByDate": "projected_lineups", "StartingLineupsByDate": "confirmed_lineups",
    "ProbablePitchers": "probable_starters", "GameWeatherByDate": "weather",
    "BoxScoresByDate": "live_score", "GamesByDateLive": "live_event_status",
}


def safe_rate(numerator: int | float, denominator: int | float, *, minimum_sample: int = 5) -> dict[str, Any]:
    numerator, denominator = float(numerator), float(denominator)
    if denominator <= 0:
        return {"status": "insufficient_sample", "value": None, "numerator": numerator, "denominator": denominator}
    if denominator < minimum_sample:
        return {"status": "insufficient_sample", "value": None, "numerator": numerator, "denominator": denominator}
    return {"status": "measured", "value": round(numerator / denominator, 6), "numerator": numerator, "denominator": denominator}


def percentile(values: list[float], fraction: float) -> float | None:
    clean = sorted(value for value in values if math.isfinite(value))
    if not clean:
        return None
    if len(clean) == 1:
        return round(clean[0], 3)
    position = (len(clean) - 1) * fraction
    lower, upper = math.floor(position), math.ceil(position)
    result = clean[lower] if lower == upper else clean[lower] + (clean[upper] - clean[lower]) * (position - lower)
    return round(result, 3)


def classify_entitlement(endpoints: list[dict[str, Any]]) -> str:
    if not endpoints:
        return "not_tested"
    statuses = {str(item.get("status") or "") for item in endpoints}
    codes = {str(item.get("reasonCode") or "") for item in endpoints}
    if any(status in {"authenticated_available", "cached_fresh"} for status in statuses):
        return "entitled_and_working"
    if "authenticated_empty" in statuses:
        return "entitled_but_empty"
    if "forbidden_by_entitlement" in statuses or "provider_entitlement_denied" in codes:
        return "entitlement_denied"
    if "unsupported_by_plan" in statuses:
        return "unsupported_by_plan"
    if "invalid_endpoint" in statuses or "provider_endpoint_invalid" in codes:
        return "endpoint_unavailable"
    if "configuration_error" in codes:
        return "configuration_error"
    return "provider_error"


def classify_discrepancy(category: str, details: dict[str, Any] | None = None) -> str:
    details = details or {}
    mapping = {
        "missing_primary": "expected_fixture_gap", "missing_secondary": "fixture_more_current",
        "missing_fixture": "expected_fixture_gap", "outside_fixture_coverage": "expected_fixture_gap", "identity_conflict": "identity_conflict",
        "duplicate_identity": "identity_conflict", "time_conflict": "timestamp_conflict",
        "timestamp_conflict": "timestamp_conflict", "status_conflict": "status_conflict",
        "score_conflict": "value_conflict", "stat_conflict": "value_conflict",
        "market_conflict": "value_conflict", "value_conflict": "value_conflict",
        "stale_primary": "fixture_staleness", "stale_secondary": "fixture_more_current",
        "unsupported_comparison": "unsupported_comparison",
    }
    result = mapping.get(category, "unresolved")
    if details.get("providerUpdatedAt") and details.get("fixtureUpdatedAt"):
        result = "provider_more_current" if details["providerUpdatedAt"] > details["fixtureUpdatedAt"] else "fixture_more_current"
    return result


class MlbShadowWindowService:
    """Durable, bounded, internal-only evidence coordinator for MLB shadow calls."""

    def __init__(self, database: Database, config: Any, certification: Any):
        self.database = database
        self.config = config
        self.certification = certification
        self._lock = threading.RLock()
        self._attempt_tokens: dict[str, str] = {}

    def start(
        self, *, confirmation: str, actor: str, request_budget: int,
        duration_minutes: int | None = None, date_start: str = "", date_end: str = "",
        event_ids: list[str] | None = None, domains: list[str] | None = None,
        domain_budgets: dict[str, int] | None = None, endpoint_budgets: dict[str, int] | None = None,
    ) -> dict[str, Any]:
        if confirmation != "START BOUNDED MLB SHADOW WINDOW":
            raise ValidationError("Starting an MLB shadow window requires explicit confirmation.")
        if not str(actor or "").strip():
            raise ValidationError("Shadow window actor is required.")
        if not getattr(self.config, "api_key", ""):
            raise ValidationError("SportsDataIO server credential is not configured.")
        if not getattr(self.config, "sports_provider_poc_enabled", False):
            raise ValidationError("SPORTS_PROVIDER_POC_ENABLED must be true for a shadow window.")
        if dict(getattr(self.config, "league_rollout_states", ())).get("mlb") != "shadow":
            raise ValidationError("MLB_ROLLOUT_STATE must explicitly be shadow.")
        budget = self._bounded_int(request_budget, "requestBudget", 1, 250)
        duration = self._bounded_int(duration_minutes, "durationMinutes", 1, 1440) if duration_minutes is not None else None
        first, last = self._dates(date_start, date_end)
        selected_events = self._safe_ids(event_ids or [], maximum=50)
        if duration is None and first is None and not selected_events:
            raise ValidationError("A shadow window requires a fixed duration, date range, or event set.")
        selected_domains = list(dict.fromkeys(domains or sorted(DOMAIN_IDS)))
        unknown = sorted(set(selected_domains) - DOMAIN_IDS)
        if unknown:
            raise ValidationError(f"Unknown MLB shadow domains: {', '.join(unknown)}.")
        domain_limits = self._budgets(domain_budgets or {}, DOMAIN_IDS, "domain")
        endpoint_limits = self._budgets(endpoint_budgets or {}, None, "endpoint")
        with self._lock:
            active = self._active_row(expire=True)
            if active:
                raise ValidationError("An MLB shadow window is already active.")
            window_id = f"mlb-shadow-{uuid.uuid4().hex}"
            started = datetime.now(timezone.utc)
            ends = started + timedelta(minutes=duration) if duration else None
            with self.database.transaction() as connection:
                connection.execute(
                    """INSERT INTO mlb_shadow_windows(
                      id,provider,status,started_at,ends_at,date_start,date_end,event_ids_json,
                      domains_json,request_budget,domain_budgets_json,endpoint_budgets_json,
                      configuration_json,created_by
                    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                    (window_id, "sportsdataio", "active", self._iso(started), self._iso(ends) if ends else None,
                     first.isoformat() if first else None, last.isoformat() if last else None,
                     json.dumps(selected_events), json.dumps(selected_domains), budget,
                     json.dumps(domain_limits, sort_keys=True), json.dumps(endpoint_limits, sort_keys=True),
                     json.dumps({"version": WINDOW_VERSION, "publicSourceUnchanged": True, "automaticPromotion": False}),
                     str(actor).strip()),
                )
            return self.status(window_id)

    def stop(self, window_id: str, *, confirmation: str, reason: str, actor: str) -> dict[str, Any]:
        if confirmation != "STOP MLB SHADOW WINDOW":
            raise ValidationError("Stopping an MLB shadow window requires explicit confirmation.")
        row = self._window(window_id)
        if row["status"] == "active":
            self._set_status(window_id, "stopped", reason or f"Stopped manually by {actor or 'operator'}.")
        return self.status(window_id)

    def status(self, window_id: str = "") -> dict[str, Any]:
        row = self._window(window_id) if window_id else self._active_row(expire=True)
        if not row:
            return {"status": "not_active", "publicSource": "fixture", "shadowExposedAsPrimary": False}
        if row["status"] == "active":
            self._expire(row)
            row = self._window(row["id"])
        requests = self._request_rows(row["id"])
        return self._safe_window(row, requests)

    def before_request(self, endpoint: str, attempt: int = 0) -> str:
        domain = self._endpoint_domain(endpoint)
        operation = str(endpoint).split("/", 1)[0][:120]
        with self._lock:
            row = self._active_row(expire=True)
            if not row:
                raise ShadowBudgetExhaustedError("No active authorized MLB shadow window permits this provider request.")
            window = self._decode_window(row)
            authorized_group = DOMAIN_GROUP.get(domain)
            if domain not in window["domains"] and not any(
                DOMAIN_GROUP.get(selected) == authorized_group for selected in window["domains"]
            ):
                raise ShadowBudgetExhaustedError("The active MLB shadow window does not authorize this domain.")
            requests = self._request_rows(row["id"])
            if len(requests) >= row["request_budget"]:
                self._set_status(row["id"], "budget_exhausted", "Global provider request budget exhausted.")
                raise ShadowBudgetExhaustedError("MLB shadow request budget exhausted.")
            domain_used = sum(item["domain"] == domain for item in requests)
            if domain in window["domainBudgets"] and domain_used >= window["domainBudgets"][domain]:
                raise ShadowBudgetExhaustedError(f"MLB shadow domain budget exhausted for {domain}.")
            endpoint_used = sum(item["endpoint"] == operation for item in requests)
            if operation in window["endpointBudgets"] and endpoint_used >= window["endpointBudgets"][operation]:
                raise ShadowBudgetExhaustedError(f"MLB shadow endpoint budget exhausted for {operation}.")
            request_id = uuid.uuid4().hex
            with self.database.transaction() as connection:
                connection.execute(
                    """INSERT INTO mlb_shadow_requests(
                      id,window_id,domain,endpoint,attempt,outcome,started_at
                    ) VALUES(?,?,?,?,?,?,?)""",
                    (request_id, row["id"], domain, operation, max(0, int(attempt)), "started", utc_now()),
                )
            return request_id

    def after_request(self, token: str | None, attempt: int, outcome: str, error_code: str, latency_ms: float) -> None:
        if not token:
            return
        safe_outcome = "success" if outcome == "success" else "error"
        with self.database.transaction() as connection:
            connection.execute(
                """UPDATE mlb_shadow_requests SET outcome=?,error_code=?,latency_ms=?,completed_at=?
                   WHERE id=?""",
                (safe_outcome, error_code or None, max(0.0, float(latency_ms)), utc_now(), token),
            )

    def record_simulated_failure(self, window_id: str, *, domain: str, error_code: str) -> None:
        if domain not in DOMAIN_IDS:
            raise ValidationError("Unknown simulated-failure domain.")
        with self.database.transaction() as connection:
            connection.execute(
                """INSERT INTO mlb_shadow_requests(
                  id,window_id,domain,endpoint,attempt,outcome,error_code,simulated,started_at,completed_at
                ) VALUES(?,?,?,?,?,?,?,?,?,?)""",
                (uuid.uuid4().hex, window_id, domain, "simulated_failure", 0, "error",
                 str(error_code or "provider_error")[:80], 1, utc_now(), utc_now()),
            )

    def run_once(self, window_id: str, services: dict[str, Callable[[], dict[str, Any]]]) -> dict[str, Any]:
        status = self.status(window_id)
        if status["status"] != "active":
            raise ValidationError("MLB shadow window is not active.")
        selected = set(status["domains"])
        executed, failures = [], []
        for group, group_domains in GROUP_DOMAINS.items():
            if group not in services or not selected.intersection(group_domains):
                continue
            try:
                report = services[group]()
                self.record_group_report(window_id, group, report)
                executed.append(group)
            except ProviderError as error:
                failures.append({"group": group, "errorCode": error.code})
            except ValidationError as error:
                failures.append({"group": group, "errorCode": error.code})
            if self.status(window_id)["status"] != "active":
                break
        if self.status(window_id)["status"] == "active":
            self._set_status(window_id, "completed", "One bounded validation cycle completed.")
        return {"window": self.status(window_id), "executedGroups": executed, "failures": failures, "report": self.report(window_id)}

    def record_group_report(self, window_id: str, group: str, report: dict[str, Any]) -> None:
        if group not in GROUP_DOMAINS:
            raise ValidationError("Unknown MLB shadow validation group.")
        window = self._decode_window(self._window(window_id))
        endpoints = report.get("endpoints") if isinstance(report.get("endpoints"), list) else []
        entitlement = classify_entitlement(endpoints)
        normalization = report.get("normalization") if isinstance(report.get("normalization"), dict) else {}
        accepted = self._accepted_count(normalization)
        rejected = int(normalization.get("rejected") or normalization.get("providerRejected") or 0)
        canonical = report.get("canonicalIds") if isinstance(report.get("canonicalIds"), dict) else {}
        discrepancies = report.get("discrepancies") if isinstance(report.get("discrepancies"), dict) else {}
        categories = discrepancies.get("categories") if isinstance(discrepancies.get("categories"), dict) else {}
        cache = report.get("cache") if isinstance(report.get("cache"), dict) else {}
        domain_requests = self._request_rows(window_id, simulated=False)
        group_request_domains = set(GROUP_DOMAINS[group])
        relevant_requests = [item for item in domain_requests if item["domain"] in group_request_domains]
        latencies = [float(item["latency_ms"]) for item in relevant_requests if item.get("latency_ms") is not None]
        request_metrics = self._request_metrics(relevant_requests, latencies)
        mapping_total = max(accepted, int(canonical.get("count") or 0))
        unresolved = int(canonical.get("unresolvedMappingCount") or 0)
        ambiguous = int(canonical.get("ambiguousMappingCount") or 0)
        freshness = self._freshness_metrics(normalization, cache, accepted)
        classified = Counter()
        for category, count in categories.items():
            classified[classify_discrepancy(str(category))] += int(count or 0)
        comparison_count = int(discrepancies.get("comparisonCount") or max(accepted, int(discrepancies.get("total") or 0)))
        discrepancy_count = int(discrepancies.get("total") or sum(classified.values()))
        expected_count = sum(classified[key] for key in ("expected_fixture_gap", "expected_live_gap"))
        actionable_count = max(0, discrepancy_count - expected_count)
        actionable_comparisons = max(0, comparison_count - expected_count)
        exact = max(0, actionable_comparisons - actionable_count)
        evidence = {
            "leagueId": "mlb", "windowId": window_id, "provider": "sportsdataio",
            "sampleSize": accepted, "requestMetrics": request_metrics,
            "entitlementObservations": [{
                "domain": str(item.get("domain") or ""), "operation": str(item.get("operation") or "")[:120],
                "status": str(item.get("status") or ""), "recordCount": max(0, int(item.get("recordCount") or 0)),
                "rejectedSiblingCount": max(0, int(item.get("rejectedSiblingCount") or 0)),
                "reasonCode": str(item.get("reasonCode") or "") or None,
            } for item in endpoints],
            "validationMetrics": {
                "acceptedRecordCount": accepted, "rejectedRecordCount": rejected,
                "validationRejectionRate": safe_rate(rejected, accepted + rejected),
                "warningCount": int(normalization.get("warningCount") or 0),
                "malformedResponseCount": sum(item.get("error_code") == "provider_schema_error" for item in relevant_requests),
            },
            "mappingMetrics": {
                "resolvedCount": max(0, mapping_total - unresolved - ambiguous),
                "unresolvedCount": unresolved, "ambiguousCount": ambiguous,
                "conflictingCount": int(canonical.get("conflictingMappingCount") or 0),
                "mappingSuccessRate": safe_rate(max(0, mapping_total - unresolved - ambiguous), mapping_total),
                "unresolvedMappingRate": safe_rate(unresolved, mapping_total),
            },
            "identityMetrics": copy.deepcopy(canonical.get("identityMetrics") or {}),
            "freshnessMetrics": freshness,
            "shadowMetrics": {
                "comparisonCount": comparison_count, "rawDiscrepancyCount": discrepancy_count,
                "rawDiscrepancyRate": safe_rate(discrepancy_count, comparison_count),
                "excludedExpectedDifferenceCount": expected_count,
                "actionableComparisonCount": actionable_comparisons, "exactMatchCount": exact,
                "discrepancyCount": actionable_count,
                "discrepancyRate": safe_rate(actionable_count, actionable_comparisons),
                "discrepancyTypes": dict(sorted(classified.items())),
            },
            "correctionMetrics": {"observed": 0, "applied": 0, "failures": 0, "downstreamInvalidations": 0},
            "cacheMetrics": {
                "hits": sum(item.get("cache_state") == "fresh" for item in relevant_requests),
                "misses": sum(item.get("cache_state") == "miss" for item in relevant_requests),
                "staleIfErrorUsage": int(cache.get("state") == "stale-if-error"),
                "coalescedRequestCount": int(cache.get("coalescedRequests") or 0),
            },
            "marketMetrics": self._market_metrics(group, normalization, canonical),
            "liveMetrics": self._live_metrics(group, normalization),
            "edgeTrust": copy.deepcopy(report.get("edgeTrust") or {"status": "unavailable"}),
            "knownLimitations": list(report.get("limitations") or []),
            "exposedAsPrimary": False,
        }
        for domain in GROUP_DOMAINS[group]:
            if domain not in window["domains"]:
                continue
            domain_entitlement = self._domain_entitlement(domain, endpoints, entitlement)
            domain_sample = self._domain_sample(domain, normalization, accepted)
            domain_evidence = {**copy.deepcopy(evidence), "domain": domain, "sampleSize": domain_sample,
                               "entitlement": domain_entitlement}
            domain_evidence = self._domain_specific_evidence(domain_evidence)
            recommendation = self._recommendation(domain_entitlement, domain_sample, domain_evidence)
            domain_evidence["recommendation"] = recommendation
            self._upsert_evidence(window_id, domain, domain_entitlement, domain_sample, recommendation, domain_evidence)
        self._create_reviews(window_id, group, report, classified)
        self._create_mapping_reviews(window_id, canonical)

    def report(self, window_id: str, *, public: bool = False) -> dict[str, Any]:
        window = self.status(window_id)
        rows = self.database.execute(
            "SELECT domain,entitlement,sample_size,evidence_json,recommendation,updated_at FROM mlb_shadow_domain_evidence WHERE window_id=? ORDER BY domain",
            (window_id,),
        )
        evidence = []
        for row in rows:
            item = json.loads(row["evidence_json"])
            if public:
                item.pop("requestMetrics", None)
            evidence.append(item)
        tested = {item["domain"] for item in evidence}
        for domain in window.get("domains", []):
            if domain not in tested:
                evidence.append({
                    "leagueId": "mlb", "domain": domain, "windowId": window_id,
                    "provider": "sportsdataio", "sampleSize": 0, "entitlement": "not_tested",
                    "recommendation": "insufficient_sample", "knownLimitations": ["No provider request was completed for this domain in the bounded window."],
                    "exposedAsPrimary": False,
                })
        requests = self._request_rows(window_id, simulated=False)
        simulated = self._request_rows(window_id, simulated=True)
        latencies = [float(item["latency_ms"]) for item in requests if item.get("latency_ms") is not None]
        entitlement_counts = Counter(item["entitlement"] for item in evidence)
        recommendation_counts = Counter(item["recommendation"] for item in evidence)
        return {
            "version": WINDOW_VERSION, "window": window, "provider": "sportsdataio", "leagueId": "mlb",
            "publicSource": "fixture", "shadowExposedAsPrimary": False, "automaticPromotion": False,
            "domainsTested": sorted(tested), "requestMetrics": self._request_metrics(requests, latencies),
            "simulatedFailureMetrics": {"count": len(simulated), "errorCodes": dict(Counter(item.get("error_code") or "provider_error" for item in simulated))},
            "entitlementSummary": dict(sorted(entitlement_counts.items())),
            "domainEvidence": sorted(evidence, key=lambda item: item["domain"]),
            "recommendationSummary": dict(sorted(recommendation_counts.items())),
            "manualReview": {"open": len(self.reviews(window_id, status="open")), "total": len(self.reviews(window_id))},
            "productionGates": {
                "ownerApproval": "required", "licensing": "blocked", "infrastructure": "blocked", "quota": "unconfirmed",
            },
        }

    def certification_evidence(self) -> dict[str, dict[str, Any]]:
        rows = self.database.execute(
            """SELECT e.domain,e.entitlement,e.sample_size,e.evidence_json,e.recommendation,e.updated_at
               FROM mlb_shadow_domain_evidence e JOIN mlb_shadow_windows w ON w.id=e.window_id
               WHERE w.status IN ('completed','stopped','budget_exhausted','expired')
               ORDER BY e.updated_at DESC"""
        )
        latest: dict[str, dict[str, Any]] = {}
        for row in rows:
            latest.setdefault(row["domain"], {**json.loads(row["evidence_json"]), "updatedAt": row["updated_at"]})
        return latest

    def recalculate(self, window_id: str) -> dict[str, Any]:
        """Re-derive aggregate classifications without making provider requests."""
        rows = self.database.execute(
            "SELECT domain,entitlement,sample_size,evidence_json FROM mlb_shadow_domain_evidence WHERE window_id=?",
            (window_id,),
        )
        for row in rows:
            evidence = self._correct_retained_evidence(json.loads(row["evidence_json"]))
            evidence = self._domain_specific_evidence(evidence)
            recommendation = self._recommendation(row["entitlement"], row["sample_size"], evidence)
            evidence["recommendation"] = recommendation
            self._upsert_evidence(window_id, row["domain"], row["entitlement"], row["sample_size"], recommendation, evidence)
        return self.report(window_id)

    def reviews(self, window_id: str, *, status: str = "") -> list[dict[str, Any]]:
        if status and status not in REVIEW_STATES:
            raise ValidationError("Unknown shadow review status.")
        clause, params = ("AND status=?", (window_id, status)) if status else ("", (window_id,))
        rows = self.database.execute(
            f"""SELECT id,domain,canonical_id,provider_id,discrepancy_type,fixture_value_json,
                provider_value_json,provenance_json,edge_trust_json,suggested_reason,status,created_at,updated_at
                FROM mlb_shadow_reviews WHERE window_id=? {clause} ORDER BY created_at DESC LIMIT 200""", params,
        )
        return [{
            "id": row["id"], "domain": row["domain"], "canonicalId": row["canonical_id"],
            "providerId": row["provider_id"], "discrepancyType": row["discrepancy_type"],
            "fixtureValue": json.loads(row["fixture_value_json"] or "null"),
            "normalizedProviderValue": json.loads(row["provider_value_json"] or "null"),
            "provenance": json.loads(row["provenance_json"] or "{}"),
            "edgeTrust": json.loads(row["edge_trust_json"] or "{}"),
            "suggestedReason": row["suggested_reason"], "status": row["status"],
            "createdAt": row["created_at"], "updatedAt": row["updated_at"],
        } for row in rows]

    def update_review(self, review_id: str, *, status: str) -> dict[str, Any]:
        if status not in REVIEW_STATES:
            raise ValidationError("Unknown shadow review status.")
        with self.database.transaction() as connection:
            changed = connection.execute("UPDATE mlb_shadow_reviews SET status=?,updated_at=? WHERE id=?", (status, utc_now(), review_id)).rowcount
        if not changed:
            raise ValidationError("Shadow review item was not found.")
        row = self.database.execute("SELECT window_id FROM mlb_shadow_reviews WHERE id=?", (review_id,))[0]
        return next(item for item in self.reviews(row["window_id"]) if item["id"] == review_id)

    def mappings(self, window_id: str) -> list[dict[str, Any]]:
        rows = self.database.execute(
            "SELECT * FROM mlb_shadow_mapping_reviews WHERE window_id=? ORDER BY created_at DESC", (window_id,),
        )
        return [{
            "id": row["id"], "entityType": row["entity_type"], "providerId": row["provider_id"],
            "canonicalId": row["canonical_id"], "candidates": json.loads(row["candidates_json"] or "[]"),
            "resolutionState": row["resolution_state"], "correctionReason": row["correction_reason"],
            "updatedAt": row["updated_at"],
        } for row in rows]

    def correct_mapping(self, mapping_id: str, *, canonical_id: str, actor: str, reason: str, confirmation: str) -> dict[str, Any]:
        if confirmation != "APPLY EXPLICIT MLB MAPPING":
            raise ValidationError("Explicit mapping correction requires confirmation.")
        if not canonical_id.strip() or not actor.strip() or not reason.strip():
            raise ValidationError("Canonical ID, actor, and correction reason are required.")
        with self.database.transaction() as connection:
            changed = connection.execute(
                """UPDATE mlb_shadow_mapping_reviews SET canonical_id=?,resolution_state='resolved',
                   correction_reason=?,corrected_by=?,updated_at=? WHERE id=?""",
                (canonical_id.strip(), reason.strip(), actor.strip(), utc_now(), mapping_id),
            ).rowcount
        if not changed:
            raise ValidationError("Shadow mapping review was not found.")
        row = self.database.execute("SELECT window_id FROM mlb_shadow_mapping_reviews WHERE id=?", (mapping_id,))[0]
        return next(item for item in self.mappings(row["window_id"]) if item["id"] == mapping_id)

    @staticmethod
    def _bounded_int(value: Any, label: str, minimum: int, maximum: int) -> int:
        try:
            result = int(value)
        except (TypeError, ValueError) as error:
            raise ValidationError(f"{label} must be an integer.") from error
        if result < minimum or result > maximum:
            raise ValidationError(f"{label} must be between {minimum} and {maximum}.")
        return result

    @staticmethod
    def _safe_ids(values: list[Any], *, maximum: int) -> list[str]:
        output = []
        for value in values[:maximum]:
            text = str(value or "").strip()
            if text and len(text) <= 120 and all(char.isalnum() or char in "-_.:" for char in text):
                output.append(text)
        return list(dict.fromkeys(output))

    @classmethod
    def _dates(cls, first: str, last: str) -> tuple[date | None, date | None]:
        if not first and not last:
            return None, None
        try:
            start = date.fromisoformat(first)
            end = date.fromisoformat(last or first)
        except ValueError as error:
            raise ValidationError("Shadow dates must use YYYY-MM-DD.") from error
        if end < start or (end - start).days > 6:
            raise ValidationError("Shadow date range must be ordered and no longer than seven days.")
        return start, end

    @classmethod
    def _budgets(cls, values: dict[str, Any], allowed: set[str] | None, label: str) -> dict[str, int]:
        output = {}
        for key, value in values.items():
            safe_key = str(key or "").strip()
            if not safe_key or (allowed is not None and safe_key not in allowed):
                raise ValidationError(f"Unknown shadow {label} budget key.")
            output[safe_key] = cls._bounded_int(value, f"{label} budget", 1, 250)
        return output

    def _active_row(self, *, expire: bool = False) -> dict[str, Any] | None:
        rows = self.database.execute("SELECT * FROM mlb_shadow_windows WHERE status='active' ORDER BY started_at DESC LIMIT 1")
        if not rows:
            return None
        if expire:
            self._expire(rows[0])
            rows = self.database.execute("SELECT * FROM mlb_shadow_windows WHERE id=? AND status='active'", (rows[0]["id"],))
        return rows[0] if rows else None

    def _window(self, window_id: str) -> dict[str, Any]:
        rows = self.database.execute("SELECT * FROM mlb_shadow_windows WHERE id=?", (str(window_id),))
        if not rows:
            raise ValidationError("MLB shadow window was not found.")
        return rows[0]

    def _expire(self, row: dict[str, Any]) -> None:
        if row.get("status") != "active" or not row.get("ends_at"):
            return
        end = datetime.fromisoformat(row["ends_at"].replace("Z", "+00:00"))
        if datetime.now(timezone.utc) >= end:
            self._set_status(row["id"], "expired", "Configured duration elapsed.")

    def _set_status(self, window_id: str, status: str, reason: str) -> None:
        if status not in WINDOW_STATUSES:
            raise ValidationError("Unknown MLB shadow window status.")
        with self.database.transaction() as connection:
            connection.execute(
                "UPDATE mlb_shadow_windows SET status=?,stopped_at=?,stop_reason=? WHERE id=? AND status='active'",
                (status, utc_now(), str(reason or "")[:300], window_id),
            )

    def _decode_window(self, row: dict[str, Any]) -> dict[str, Any]:
        return {
            **row, "eventIds": json.loads(row["event_ids_json"] or "[]"),
            "domains": json.loads(row["domains_json"] or "[]"),
            "domainBudgets": json.loads(row["domain_budgets_json"] or "{}"),
            "endpointBudgets": json.loads(row["endpoint_budgets_json"] or "{}"),
        }

    def _safe_window(self, row: dict[str, Any], requests: list[dict[str, Any]]) -> dict[str, Any]:
        decoded = self._decode_window(row)
        used = len([item for item in requests if not item["simulated"]])
        return {
            "id": row["id"], "provider": row["provider"], "leagueId": "mlb", "status": row["status"],
            "startedAt": row["started_at"], "endsAt": row["ends_at"], "stoppedAt": row["stopped_at"],
            "stopReason": row["stop_reason"], "dateRange": {"start": row["date_start"], "end": row["date_end"]},
            "eventIds": decoded["eventIds"], "domains": decoded["domains"],
            "requestBudget": {"limit": row["request_budget"], "used": used, "remaining": max(0, row["request_budget"] - used)},
            "domainBudgets": decoded["domainBudgets"], "endpointBudgets": decoded["endpointBudgets"],
            "publicSource": "fixture", "shadowExposedAsPrimary": False, "automaticPromotion": False,
        }

    def _request_rows(self, window_id: str, simulated: bool | None = None) -> list[dict[str, Any]]:
        clause, params = ("", (window_id,)) if simulated is None else ("AND simulated=?", (window_id, int(simulated)))
        return self.database.execute(f"SELECT * FROM mlb_shadow_requests WHERE window_id=? {clause} ORDER BY started_at", params)

    @staticmethod
    def _endpoint_domain(endpoint: str) -> str:
        operation = str(endpoint).split("/", 1)[0]
        if operation in _ENDPOINT_DOMAINS:
            return _ENDPOINT_DOMAINS[operation]
        text = operation.casefold()
        if "prop" in text: return "player_props"
        if "odd" in text or "betting" in text: return "moneyline"
        if "lineup" in text: return "confirmed_lineups"
        if "injur" in text: return "injuries"
        if "weather" in text: return "weather"
        if "box" in text or "live" in text: return "live_event_status"
        return "schedules"

    @staticmethod
    def _accepted_count(normalization: dict[str, Any]) -> int:
        direct = normalization.get("accepted")
        if isinstance(direct, (int, float)) and not isinstance(direct, bool):
            return max(0, int(direct))
        count_keys = ("games", "entities", "standings", "playerStats", "teamStats", "sportsbooks", "prices", "props", "states")
        total = sum(int(normalization.get(key) or 0) for key in count_keys)
        counts = normalization.get("counts") if isinstance(normalization.get("counts"), dict) else {}
        return max(total, sum(int(value or 0) for value in counts.values()))

    @staticmethod
    def _domain_sample(domain: str, normalization: dict[str, Any], fallback: int) -> int:
        mapping = {
            "league_metadata": "league", "teams": "teams", "venues": "venues", "players": "players",
            "schedules": "games", "event_identity": "games", "event_status": "games",
            "completed_game_results": "games", "standings": "standings", "division_standings": "standings",
            "qualified_leaderboards": "playerStats", "season_statistics": "playerStats",
            "batter_game_logs": "playerStats", "pitcher_game_logs": "playerStats",
            "team_game_logs": "teamStats", "team_records": "teamStats", "historical_summaries": "teamStats",
            "rank_movement": "standings", "sportsbooks": "sportsbooks", "player_props": "props",
            "live_event_status": "states", "live_score": "states", "inning_state": "states", "outs": "states",
            "live_participants": "states", "finalization": "states", "corrections": "states",
        }
        key = mapping.get(domain)
        if key and key in normalization:
            return max(0, int(normalization.get(key) or 0))
        counts = normalization.get("counts") if isinstance(normalization.get("counts"), dict) else {}
        context_keys = {
            "injuries": "availability", "roster_status": "rosters", "projected_lineups": "lineups",
            "confirmed_lineups": "lineups", "probable_starters": "starters", "weather": "weather",
            "contextual_events": "transactions",
        }
        if domain in context_keys:
            return max(0, int(counts.get(context_keys[domain]) or 0))
        if domain in {"moneyline", "run_line", "totals", "best_available_price", "market_status", "market_movement", "price_history"}:
            return max(0, int(normalization.get("prices") or 0))
        return max(0, fallback)

    @staticmethod
    def _request_metrics(requests: list[dict[str, Any]], latencies: list[float]) -> dict[str, Any]:
        completed = [item for item in requests if item["outcome"] in {"success", "error"}]
        successes = sum(item["outcome"] == "success" for item in completed)
        errors = len(completed) - successes
        retries = sum(int(item.get("attempt") or 0) > 0 for item in completed)
        return {
            "totalProviderRequests": len(requests), "completedRequests": len(completed), "successfulRequests": successes,
            "failedRequests": errors, "retries": retries,
            "rateLimitResponses": sum(item.get("error_code") == "provider_rate_limit" for item in completed),
            "timeouts": sum(item.get("error_code") == "provider_timeout" for item in completed),
            "requestSuccessRate": safe_rate(successes, len(completed)),
            "timeoutRate": safe_rate(sum(item.get("error_code") == "provider_timeout" for item in completed), len(completed)),
            "rateLimitRate": safe_rate(sum(item.get("error_code") == "provider_rate_limit" for item in completed), len(completed)),
            "providerErrorRate": safe_rate(errors, len(completed)),
            "medianLatencyMs": percentile(latencies, 0.5),
            "p95LatencyMs": percentile(latencies, 0.95) if len(latencies) >= 20 else {"status": "insufficient_sample", "value": None, "sampleSize": len(latencies)},
            "requestsByDomain": dict(Counter(item["domain"] for item in requests)),
            "requestsByEndpoint": dict(Counter(item["endpoint"] for item in requests)),
        }

    @staticmethod
    def _freshness_metrics(normalization: dict[str, Any], cache: dict[str, Any], accepted: int) -> dict[str, Any]:
        observed = any(key in normalization for key in ("fresh", "delayed", "stale"))
        if not observed:
            unavailable = {"status": "insufficient_sample", "value": None, "numerator": 0.0, "denominator": 0.0}
            return {
                "freshRecordCount": 0, "delayedRecordCount": 0, "staleRecordCount": 0,
                "freshRecordRate": copy.deepcopy(unavailable), "delayedRecordRate": copy.deepcopy(unavailable),
                "staleRecordRate": copy.deepcopy(unavailable),
                "staleFallbackUsage": int(cache.get("state") == "stale-if-error"),
                "providerTimestampAvailability": {"status": "insufficient_sample", "value": None, "reason": "Aggregate adapter report does not retain a timestamp denominator."},
            }
        stale = int(normalization.get("stale") or 0)
        delayed = int(normalization.get("delayed") or 0)
        fresh = max(0, accepted - stale - delayed)
        return {
            "freshRecordCount": fresh, "delayedRecordCount": delayed, "staleRecordCount": stale,
            "freshRecordRate": safe_rate(fresh, accepted), "delayedRecordRate": safe_rate(delayed, accepted),
            "staleRecordRate": safe_rate(stale, accepted),
            "staleFallbackUsage": int(cache.get("state") == "stale-if-error"),
            "providerTimestampAvailability": {"status": "insufficient_sample", "value": None, "reason": "Aggregate adapter report does not retain a denominator."},
        }

    @staticmethod
    def _domain_specific_evidence(evidence: dict[str, Any]) -> dict[str, Any]:
        output = copy.deepcopy(evidence)
        identity = output.get("identityMetrics") if isinstance(output.get("identityMetrics"), dict) else {}
        identity_domains = identity.get("domains") if isinstance(identity.get("domains"), dict) else {}
        entity_type = {
            "teams": "team", "venues": "venue", "players": "athlete",
            "schedules": "event", "event_identity": "event", "event_status": "event",
            "completed_game_results": "event",
        }.get(output.get("domain"))
        domain_mapping = identity_domains.get(entity_type) if entity_type else None
        if isinstance(domain_mapping, dict) and domain_mapping.get("total"):
            total = int(domain_mapping.get("total") or 0)
            resolved = int(domain_mapping.get("confirmed") or 0) + int(domain_mapping.get("deterministic") or 0)
            unresolved = int(domain_mapping.get("unresolved") or 0) + int(domain_mapping.get("ambiguous") or 0)
            output["mappingMetrics"] = {
                "resolvedCount": resolved,
                "unresolvedCount": unresolved,
                "ambiguousCount": int(domain_mapping.get("ambiguous") or 0),
                "historicalCount": int(domain_mapping.get("historical") or 0),
                "mappingSuccessRate": safe_rate(resolved, total),
                "unresolvedMappingRate": safe_rate(unresolved, total),
                "tierSpecific": True,
            }
        elif output.get("domain") != "players":
            mapping = output.get("mappingMetrics") if isinstance(output.get("mappingMetrics"), dict) else {}
            mapping["mappingSuccessRate"] = {"status": "insufficient_sample", "value": None, "reason": "The aggregate adapter report cannot allocate mapping outcomes to this domain."}
            mapping["unresolvedMappingRate"] = {"status": "insufficient_sample", "value": None, "reason": "The aggregate adapter report cannot allocate mapping outcomes to this domain."}
            output["mappingMetrics"] = mapping
        return output

    @staticmethod
    def _correct_retained_evidence(evidence: dict[str, Any]) -> dict[str, Any]:
        output = copy.deepcopy(evidence)
        shadow = output.get("shadowMetrics") if isinstance(output.get("shadowMetrics"), dict) else {}
        types = shadow.get("discrepancyTypes") if isinstance(shadow.get("discrepancyTypes"), dict) else {}
        comparison = int(shadow.get("comparisonCount") or 0)
        raw = int(shadow.get("rawDiscrepancyCount") or shadow.get("discrepancyCount") or 0)
        expected = sum(int(types.get(key) or 0) for key in ("expected_fixture_gap", "expected_live_gap"))
        actionable = max(0, raw - expected)
        meaningful = max(0, comparison - expected)
        output["shadowMetrics"] = {
            **shadow, "rawDiscrepancyCount": raw, "rawDiscrepancyRate": safe_rate(raw, comparison),
            "excludedExpectedDifferenceCount": expected, "actionableComparisonCount": meaningful,
            "discrepancyCount": actionable, "discrepancyRate": safe_rate(actionable, meaningful),
            "exactMatchCount": max(0, meaningful - actionable),
        }
        freshness = output.get("freshnessMetrics") if isinstance(output.get("freshnessMetrics"), dict) else {}
        timestamp = freshness.get("providerTimestampAvailability") if isinstance(freshness.get("providerTimestampAvailability"), dict) else {}
        if timestamp.get("status") != "measured":
            unavailable = {"status": "insufficient_sample", "value": None, "numerator": 0.0, "denominator": 0.0}
            freshness.update({
                "freshRecordCount": 0, "delayedRecordCount": 0, "staleRecordCount": 0,
                "freshRecordRate": copy.deepcopy(unavailable), "delayedRecordRate": copy.deepcopy(unavailable),
                "staleRecordRate": copy.deepcopy(unavailable),
            })
        output["freshnessMetrics"] = freshness
        return output

    @staticmethod
    def _market_metrics(group: str, normalization: dict[str, Any], canonical: dict[str, Any]) -> dict[str, Any]:
        if group not in {"markets", "player_props"}:
            return {"status": "not_applicable"}
        return {
            "activeMarketCount": max(0, int(normalization.get("prices") or normalization.get("props") or 0) - int(normalization.get("suspended") or 0)),
            "suspendedMarketCount": int(normalization.get("suspended") or 0), "staleMarketCount": int(normalization.get("stale") or 0),
            "eventMappingSuccess": safe_rate(max(0, int(normalization.get("prices") or normalization.get("props") or 0) - int(canonical.get("unresolvedEvents") or 0)), int(normalization.get("prices") or normalization.get("props") or 0)),
            "playerMappingSuccess": {"status": "insufficient_sample", "value": None},
            "sportsbookMappingSuccess": safe_rate(max(0, int(normalization.get("sportsbooks") or 0) - int(canonical.get("unresolvedSportsbooks") or 0)), int(normalization.get("sportsbooks") or 0)),
        }

    @staticmethod
    def _live_metrics(group: str, normalization: dict[str, Any]) -> dict[str, Any]:
        if group != "live_state":
            return {"status": "not_applicable"}
        states = int(normalization.get("states") or 0)
        return {
            "stateTransitionsObserved": int(normalization.get("transitions") or 0),
            "staleStateEvents": int(normalization.get("stale") or 0),
            "invalidTransitions": int(normalization.get("invalidTransitions") or 0),
            "finalizationReconciliation": {"status": "insufficient_sample" if states < 1 else "observed", "sampleSize": states},
        }

    @staticmethod
    def _domain_entitlement(domain: str, endpoints: list[dict[str, Any]], fallback: str) -> str:
        matching = [item for item in endpoints if str(item.get("domain") or "") in {domain, DOMAIN_GROUP.get(domain), "schedules" if domain in {"event_identity", "event_status", "completed_game_results"} else ""}]
        return classify_entitlement(matching) if matching else fallback

    @staticmethod
    def _recommendation(entitlement: str, sample_size: int, evidence: dict[str, Any]) -> str:
        if entitlement in {"entitlement_denied", "unsupported_by_plan", "endpoint_unavailable"}:
            return "blocked_entitlement"
        if entitlement in {"provider_error", "configuration_error"}:
            return "remain_fixture"
        if sample_size < 5:
            return "insufficient_sample"
        rejection = evidence["validationMetrics"]["validationRejectionRate"]
        mapping = evidence["mappingMetrics"]["mappingSuccessRate"]
        if rejection.get("status") == "measured" and rejection["value"] > 0.05:
            return "blocked_quality"
        if mapping.get("status") == "measured" and mapping["value"] < 0.95:
            return "blocked_quality"
        return "remain_shadow"

    def _upsert_evidence(self, window_id: str, domain: str, entitlement: str, sample: int, recommendation: str, evidence: dict[str, Any]) -> None:
        if entitlement not in ENTITLEMENT_STATES or recommendation not in RECOMMENDATIONS:
            raise ValidationError("Invalid MLB shadow evidence state.")
        with self.database.transaction() as connection:
            connection.execute(
                """INSERT INTO mlb_shadow_domain_evidence(window_id,domain,provider,entitlement,sample_size,evidence_json,recommendation,updated_at)
                   VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(window_id,domain) DO UPDATE SET
                   entitlement=excluded.entitlement,sample_size=excluded.sample_size,evidence_json=excluded.evidence_json,
                   recommendation=excluded.recommendation,updated_at=excluded.updated_at""",
                (window_id, domain, "sportsdataio", entitlement, sample, json.dumps(evidence, sort_keys=True), recommendation, utc_now()),
            )

    def _create_reviews(self, window_id: str, group: str, report: dict[str, Any], classified: Counter) -> None:
        discrepancies = report.get("discrepancies") if isinstance(report.get("discrepancies"), dict) else {}
        raw_items = discrepancies.get("items") if isinstance(discrepancies.get("items"), list) else []
        if not raw_items:
            raw_items = [{"category": key, "recordId": None, "details": {"count": count}} for key, count in classified.items()]
        for item in raw_items[:50]:
            category = str(item.get("category") or "")
            dtype = category if category in DISCREPANCY_TYPES else classify_discrepancy(category, item.get("details"))
            if dtype in {"expected_fixture_gap", "expected_live_gap"}:
                continue
            details = item.get("details") if isinstance(item.get("details"), dict) else {}
            review_id = uuid.uuid5(uuid.NAMESPACE_URL, f"{window_id}:{group}:{item.get('recordId')}:{dtype}:{json.dumps(details, sort_keys=True)}").hex
            with self.database.transaction() as connection:
                connection.execute(
                    """INSERT OR IGNORE INTO mlb_shadow_reviews(
                      id,window_id,domain,canonical_id,provider_id,discrepancy_type,fixture_value_json,
                      provider_value_json,provenance_json,edge_trust_json,suggested_reason,status,created_at,updated_at
                    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                    (review_id, window_id, GROUP_DOMAINS[group][0], str(item.get("recordId") or "") or None, None, dtype,
                     json.dumps(details.get("fixture", details.get("primary"))), json.dumps(details.get("provider", details.get("secondary"))),
                     json.dumps({"fixture": report.get("primarySource"), "provider": report.get("provider")}, sort_keys=True),
                     json.dumps(report.get("edgeTrust") or {}, sort_keys=True),
                     f"Review {dtype.replace('_', ' ')} before changing normalization or canonical mappings.",
                     "open", utc_now(), utc_now()),
                )

    def _create_mapping_reviews(self, window_id: str, canonical: dict[str, Any]) -> None:
        unresolved = canonical.get("unresolvedMappings") if isinstance(canonical.get("unresolvedMappings"), list) else []
        for item in unresolved[:50]:
            if not isinstance(item, dict):
                continue
            provider_id = str(item.get("providerId") or item.get("provider_id") or "").strip()
            if not provider_id:
                continue
            entity_type = str(item.get("entityType") or item.get("type") or "entity")[:40]
            candidates = item.get("candidates") if isinstance(item.get("candidates"), list) else []
            state = "ambiguous" if len(candidates) > 1 else "unresolved"
            with self.database.transaction() as connection:
                connection.execute(
                    """INSERT OR IGNORE INTO mlb_shadow_mapping_reviews(
                      id,window_id,entity_type,provider_id,candidates_json,resolution_state,created_at,updated_at
                    ) VALUES(?,?,?,?,?,?,?,?)""",
                    (uuid.uuid4().hex, window_id, entity_type, provider_id, json.dumps(candidates[:20]), state, utc_now(), utc_now()),
                )

    @staticmethod
    def _iso(value: datetime) -> str:
        return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
