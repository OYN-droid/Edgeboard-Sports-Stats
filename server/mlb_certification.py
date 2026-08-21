from __future__ import annotations

import copy
import json
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from .database import Database, utc_now
from .errors import ValidationError


CERTIFICATION_VERSION = "mlb-ticket10-v1"
CERTIFICATION_STATES = (
    "unsupported", "unknown", "documented", "contract_unconfirmed",
    "fixture_supported", "configured", "internal_testing", "shadow",
    "limited_live", "certified_live", "degraded", "suspended",
)
PUBLIC_STATE_LABELS = {
    "certified_live": "Certified Live", "limited_live": "Limited Live",
    "degraded": "Degraded", "suspended": "Unavailable",
    "fixture_supported": "Fixture", "shadow": "Fixture",
    "internal_testing": "Fixture", "configured": "Fixture",
    "documented": "Unavailable", "contract_unconfirmed": "Unavailable",
    "unknown": "Unavailable", "unsupported": "Unavailable",
}
CRITERIA = (
    "provider_entitlement", "adapter_capability", "canonical_entity_reconciliation",
    "canonical_event_reconciliation", "response_validation", "malformed_row_handling",
    "correction_handling", "duplicate_protection", "freshness_policy", "cache_policy",
    "stale_if_error", "source_provenance", "edge_trust", "provider_health",
    "rate_limit_safety", "timeout_behavior", "retries", "failover_behavior",
    "diagnostics", "browser_safe_state", "regression_tests", "live_integration_tests",
    "shadow_discrepancy_rate", "unresolved_mapping_rate", "validation_rejection_rate",
    "data_completeness", "production_monitoring", "security_review",
    "retention_licensing", "rollback_path",
)

# Fine-grained domains intentionally map to the older broad rollout buckets only for
# compatibility. The certification state remains independent at this layer.
DOMAIN_DEFINITIONS = (
    ("league_metadata", "League metadata", "core", "entities", "league_catalog"),
    ("teams", "Teams", "core", "entities", "teams"),
    ("venues", "Venues", "core", "entities", "entities"),
    ("players", "Players", "core", "entities", "entities"),
    ("schedules", "Schedules", "core", "schedules", "schedules"),
    ("event_identity", "Event identity", "core", "schedules", "event_details"),
    ("event_status", "Event status", "core", "live_status", "event_status"),
    ("completed_game_results", "Completed-game results", "statistics", "historical_stats", "event_details"),
    ("batter_game_logs", "Batter game logs", "statistics", "historical_stats", "game_logs"),
    ("pitcher_game_logs", "Pitcher game logs", "statistics", "historical_stats", "game_logs"),
    ("team_game_logs", "Team game logs", "statistics", "historical_stats", "game_logs"),
    ("season_statistics", "Season statistics", "statistics", "historical_stats", "historical_statistics"),
    ("historical_summaries", "Historical summaries", "statistics", "historical_stats", "historical_statistics"),
    ("standings", "Standings", "league_context", "standings", "standings"),
    ("division_standings", "Division standings", "league_context", "standings", "standings"),
    ("qualified_leaderboards", "Qualified leaderboards", "league_context", "standings", "leaderboards"),
    ("team_records", "Team records", "league_context", "standings", "historical_statistics"),
    ("rank_movement", "Rank movement", "league_context", "standings", "standings"),
    ("sportsbooks", "Sportsbooks", "markets", "markets", "odds"),
    ("moneyline", "Moneyline", "markets", "markets", "odds"),
    ("run_line", "Run line", "markets", "markets", "odds"),
    ("totals", "Totals", "markets", "markets", "odds"),
    ("player_props", "Player props", "markets", "props", "player_props"),
    ("best_available_price", "Best available price", "markets", "markets", "odds"),
    ("market_status", "Market status", "markets", "markets", "odds"),
    ("market_movement", "Market movement", "markets", "line_movement", "line_movement"),
    ("price_history", "Price history", "markets", "line_movement", "archived_odds"),
    ("injuries", "Injuries", "context", "injuries", "injuries"),
    ("roster_status", "Roster status", "context", "lineups", "rosters"),
    ("projected_lineups", "Projected lineups", "context", "lineups", "projected_lineups"),
    ("confirmed_lineups", "Confirmed lineups", "context", "lineups", "confirmed_lineups"),
    ("probable_starters", "Probable starters", "context", "lineups", "projected_lineups"),
    ("weather", "Weather", "context", "lineups", "weather"),
    ("contextual_events", "Contextual events", "context", "lineups", "availability"),
    ("live_event_status", "Live event status", "live", "live_status", "event_status"),
    ("live_score", "Live score", "live", "live_status", "live_scores"),
    ("inning_state", "Inning state", "live", "live_status", "inning_state"),
    ("outs", "Outs", "live", "live_status", "inning_state"),
    ("live_participants", "Live participants", "live", "live_status", "live_participants"),
    ("finalization", "Finalization", "live", "live_status", "event_status"),
    ("corrections", "Corrections", "live", "live_status", "event_status"),
)

LIVE_STATES = {"limited_live", "certified_live"}
SAFE_DOMAIN_TRANSITIONS = {
    "unsupported": {"documented"}, "unknown": {"documented", "unsupported"},
    "documented": {"contract_unconfirmed", "fixture_supported", "unsupported"},
    "contract_unconfirmed": {"documented", "configured", "fixture_supported"},
    "fixture_supported": {"configured", "internal_testing", "shadow", "suspended"},
    "configured": {"fixture_supported", "internal_testing", "shadow", "suspended"},
    "internal_testing": {"fixture_supported", "configured", "shadow", "suspended"},
    "shadow": {"fixture_supported", "internal_testing", "limited_live", "suspended"},
    "limited_live": {"shadow", "certified_live", "degraded", "suspended"},
    "certified_live": {"limited_live", "degraded", "suspended"},
    "degraded": {"limited_live", "shadow", "fixture_supported", "suspended"},
    "suspended": {"fixture_supported", "internal_testing", "shadow"},
}
MARKET_DOMAINS = {item[0] for item in DOMAIN_DEFINITIONS if item[2] == "markets"}
LIVE_DOMAINS = {item[0] for item in DOMAIN_DEFINITIONS if item[2] == "live"}
IDENTITY_DOMAINS = {"league_metadata", "teams", "venues", "players"}
EVENT_DOMAINS = {item[0] for item in DOMAIN_DEFINITIONS} - IDENTITY_DOMAINS


def _criterion_results(domain_id: str) -> list[dict[str, Any]]:
    implemented = {
        "adapter_capability", "response_validation", "malformed_row_handling",
        "duplicate_protection", "freshness_policy", "cache_policy", "stale_if_error",
        "source_provenance", "edge_trust", "rate_limit_safety", "timeout_behavior",
        "retries", "failover_behavior", "diagnostics", "browser_safe_state",
        "regression_tests", "security_review", "rollback_path",
    }
    results = []
    for key in CRITERIA:
        if key in implemented:
            status, note = "passed", "Deterministic fixture/adapter and failure-path evidence is implemented."
        elif key == "canonical_entity_reconciliation":
            status, note = ("passed", "Canonical entity IDs are validated at the provider boundary.") if domain_id in IDENTITY_DOMAINS else ("manual_review", "Live-provider entity mapping rates require retained shadow evidence.")
        elif key == "canonical_event_reconciliation":
            status, note = ("not_applicable", "This identity domain does not depend on an event.") if domain_id in IDENTITY_DOMAINS else ("manual_review", "Live-provider event reconciliation rates require retained shadow evidence.")
        elif key == "correction_handling":
            relevant = domain_id in {"schedules", "event_status", "completed_game_results", "standings", "division_standings", "rank_movement", "market_movement", "price_history", "live_event_status", "live_score", "finalization", "corrections"}
            status, note = ("passed", "Versioned corrections preserve old and new normalized values.") if relevant else ("not_applicable", "No mutable correction lifecycle is defined for this domain contract.")
        elif key in {"provider_entitlement", "live_integration_tests"}:
            status, note = "blocked", "No retained authorized Ticket 10 live certification result is available."
        elif key in {"shadow_discrepancy_rate", "unresolved_mapping_rate", "validation_rejection_rate", "data_completeness"}:
            status, note = "manual_review", "A justified denominator and representative shadow window are not yet retained."
        elif key == "provider_health":
            status, note = "blocked", "No production-length domain health window is retained."
        elif key == "production_monitoring":
            status, note = "blocked", "Process-local diagnostics exist; shared production monitoring is not provisioned."
        elif key == "retention_licensing":
            status, note = "blocked", "Commercial display, cache, retention, derived-data, and redistribution rights are not recorded as approved."
        else:
            status, note = "manual_review", "Manual certification evidence is required."
        results.append({"id": key, "status": status, "note": note})
    return results


@dataclass(frozen=True)
class FailoverResult:
    state: str
    source_mode: str
    label: str
    value: Any
    fallback_used: bool
    reason: str
    mixed_sources: bool = False


class MlbCertificationService:
    """Domain certification, incident controls, health evaluation, and fail-closed source choice."""

    def __init__(self, database: Database, config: Any, rollout: Any, shadow: Any, provider_manager: Any):
        self.database, self.config, self.rollout = database, config, rollout
        self.shadow, self.provider_manager = shadow, provider_manager
        self._health: dict[str, dict[str, Any]] = {}
        self._ensure_defaults()

    def _ensure_defaults(self) -> None:
        now = utc_now()
        with self.database.transaction() as connection:
            for domain_id, label, group, broad_domain, provider_domain in DOMAIN_DEFINITIONS:
                connection.execute(
                    """INSERT OR IGNORE INTO mlb_domain_certification(
                      domain,state,provider,entitlement,coverage,freshness_policy,fallback,
                      limitations_json,validation_status,edge_trust_status,certified_at,
                      certification_version,reviewer_notes,criteria_json,updated_at
                    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                    (domain_id, "fixture_supported", "sportsdataio", "unverified",
                     "Representative deterministic fixture coverage only", provider_domain,
                     "validated stale cache → fixture → unavailable",
                     json.dumps(["Live entitlement, representative shadow rates, licensing, quota, and production infrastructure remain unverified."]),
                     "fixture_validated", "fixture", None, CERTIFICATION_VERSION,
                     "Ticket 10 review: remain fixture-primary; shadow is the next owner-controlled step.",
                     json.dumps(_criterion_results(domain_id)), now),
                )

    @staticmethod
    def validate_definition(payload: dict[str, Any]) -> None:
        required = {"domain", "state", "certificationVersion", "criteria", "knownLimitations"}
        if not isinstance(payload, dict) or not required.issubset(payload):
            raise ValidationError("Certification domain is missing required fields.")
        if payload["state"] not in CERTIFICATION_STATES:
            raise ValidationError("Certification domain has an invalid state.")
        if payload["certificationVersion"] != CERTIFICATION_VERSION:
            raise ValidationError("Certification version is unsupported.")
        criteria = payload["criteria"]
        if not isinstance(criteria, list) or {item.get("id") for item in criteria if isinstance(item, dict)} != set(CRITERIA):
            raise ValidationError("Certification domain must evaluate every required criterion.")
        if not isinstance(payload["knownLimitations"], list):
            raise ValidationError("Certification limitations must be a list.")

    def domain(self, domain_id: str, *, public: bool = False) -> dict[str, Any]:
        definition = next((item for item in DOMAIN_DEFINITIONS if item[0] == domain_id), None)
        if definition is None:
            raise ValidationError("Unknown MLB certification domain.")
        rows = self.database.execute("SELECT * FROM mlb_domain_certification WHERE domain=?", (domain_id,))
        if not rows:
            raise ValidationError("MLB certification domain is unavailable.")
        row = rows[0]
        state = self._effective_state(domain_id, row["state"])
        health = self._health.get(domain_id, {"state": "misconfigured" if not self.config.provider_configured else "unavailable", "reason": "No retained provider-health window."})
        stored_criteria = json.loads(row["criteria_json"])
        shadow_evidence = self._latest_shadow_evidence(domain_id)
        effective_criteria = self._criteria_with_shadow(stored_criteria, shadow_evidence)
        result = {
            "domain": domain_id, "label": definition[1], "group": definition[2],
            "rolloutDomain": definition[3], "providerDomain": definition[4],
            "state": state, "configuredState": row["state"], "publicLabel": PUBLIC_STATE_LABELS[state],
            "provider": row["provider"], "entitlement": row["entitlement"],
            "coverage": row["coverage"], "freshnessPolicy": row["freshness_policy"],
            "fallback": row["fallback"], "knownLimitations": json.loads(row["limitations_json"]),
            "validationStatus": row["validation_status"], "edgeTrustStatus": self._trust_state(state, health["state"]),
            "lastCertifiedAt": row["certified_at"], "certificationVersion": row["certification_version"],
            "reviewerNotes": row["reviewer_notes"], "providerHealth": health["state"],
            "recommendedState": self._recommended_state(row), "explicitPromotionRequired": True,
        }
        if not public:
            result["criteria"] = effective_criteria
            result["measuredShadowEvidence"] = shadow_evidence
            result["controls"] = self.controls(domain_id)
            result["promotion"] = self.promotion_readiness(domain_id, result=result)
        self.validate_definition({**result, "criteria": effective_criteria, "knownLimitations": result["knownLimitations"]})
        return result

    def report(self, *, public: bool = False) -> dict[str, Any]:
        domains = [self.domain(item[0], public=public) for item in DOMAIN_DEFINITIONS]
        states = Counter(item["state"] for item in domains)
        shadow = self.shadow.summary("mlb")
        evidence_count = self.database.execute("SELECT COUNT(DISTINCT domain) count FROM mlb_shadow_domain_evidence")[0]["count"]
        return {
            "leagueId": "mlb", "certificationVersion": CERTIFICATION_VERSION,
            "generatedAt": utc_now(), "automaticPromotion": False,
            "overallStatus": "staging_only" if not any(item["state"] in LIVE_STATES for item in domains) else "domain_limited",
            "domains": domains, "stateCounts": dict(states),
            "shadowEvidence": {**shadow, "ratesAvailable": evidence_count > 0,
                "measuredDomainCount": evidence_count,
                "notice": "Only retained window evidence with meaningful denominators is treated as a measured rate."},
            "productionBlockers": [
                "No retained authorized live-integration certification window.",
                "Commercial quota and burst limits are not recorded.",
                "Display, caching, retention, derived-data, and redistribution rights are unresolved.",
                "Shared durable database, cache, locks, worker coordination, and monitoring are not provisioned.",
            ],
            "ownerActivationReady": False,
        }

    def _latest_shadow_evidence(self, domain_id: str) -> dict[str, Any] | None:
        rows = self.database.execute(
            """SELECT e.evidence_json,e.updated_at FROM mlb_shadow_domain_evidence e
               JOIN mlb_shadow_windows w ON w.id=e.window_id
               WHERE e.domain=? AND w.status IN ('completed','stopped','budget_exhausted','expired')
               ORDER BY e.updated_at DESC LIMIT 1""", (domain_id,),
        )
        if not rows:
            return None
        return {**json.loads(rows[0]["evidence_json"]), "updatedAt": rows[0]["updated_at"]}

    @staticmethod
    def _criteria_with_shadow(criteria: list[dict[str, Any]], evidence: dict[str, Any] | None) -> list[dict[str, Any]]:
        output = copy.deepcopy(criteria)
        if not evidence:
            return output
        entitlement = evidence.get("entitlement")
        mapping = evidence.get("mappingMetrics") or {}
        validation = evidence.get("validationMetrics") or {}
        shadow = evidence.get("shadowMetrics") or {}
        requests = evidence.get("requestMetrics") or {}
        replacements: dict[str, tuple[str, str]] = {}
        if entitlement in {"entitled_and_working", "entitled_but_empty"}:
            replacements["provider_entitlement"] = ("passed", f"Measured during bounded shadow validation: {entitlement}.")
        elif entitlement not in {None, "not_tested"}:
            replacements["provider_entitlement"] = ("blocked", f"Measured shadow entitlement state: {entitlement}.")
        for criterion, metric in (
            ("unresolved_mapping_rate", mapping.get("unresolvedMappingRate")),
            ("validation_rejection_rate", validation.get("validationRejectionRate")),
            ("shadow_discrepancy_rate", shadow.get("discrepancyRate")),
        ):
            if isinstance(metric, dict) and metric.get("status") == "measured":
                replacements[criterion] = ("passed", f"Measured value {metric.get('value')} from denominator {metric.get('denominator')}.")
        success = requests.get("requestSuccessRate") if isinstance(requests, dict) else None
        if isinstance(success, dict) and success.get("status") == "measured":
            replacements["provider_health"] = ("passed", f"Bounded shadow request success rate measured at {success.get('value')}.")
            replacements["live_integration_tests"] = ("passed", "A bounded credentialed shadow integration window completed for this domain.")
        if int(evidence.get("sampleSize") or 0) >= 5:
            replacements["data_completeness"] = ("passed", f"Measured shadow sample size: {evidence.get('sampleSize')}.")
        for item in output:
            if item["id"] in replacements:
                item["status"], item["note"] = replacements[item["id"]]
        return output

    def promotion_readiness(self, domain_id: str, *, result: dict[str, Any] | None = None) -> dict[str, Any]:
        item = result or self.domain(domain_id)
        criteria = item.get("criteria") or json.loads(self.database.execute(
            "SELECT criteria_json FROM mlb_domain_certification WHERE domain=?", (domain_id,))[0]["criteria_json"])
        blockers = [entry["id"] for entry in criteria if entry["status"] not in {"passed", "not_applicable"}]
        return {"eligibleForLimitedLive": not blockers, "eligibleForCertifiedLive": not blockers,
                "blockers": blockers, "requiresExplicitOwnerAction": True, "autoPromoted": False}

    def set_state(self, domain_id: str, target: str, *, actor: str, reason: str, confirmation: str) -> dict[str, Any]:
        if target not in CERTIFICATION_STATES:
            raise ValidationError("Unknown certification state.")
        current = self.domain(domain_id)
        if target == current["configuredState"]:
            raise ValidationError("Certification domain is already in the requested state.")
        if target not in SAFE_DOMAIN_TRANSITIONS[current["configuredState"]]:
            raise ValidationError("Unsafe certification domain transition.")
        if not reason.strip():
            raise ValidationError("Certification state changes require a reason.")
        expected = f"SET MLB {domain_id.upper()} {target.upper()}"
        if confirmation != expected:
            raise ValidationError("Certification state change requires the domain-specific confirmation phrase.")
        is_live_promotion = target == "certified_live" or (
            target == "limited_live" and current["configuredState"] != "certified_live"
        )
        if is_live_promotion:
            readiness = self.promotion_readiness(domain_id, result=current)
            if not readiness["eligibleForLimitedLive"]:
                raise ValidationError("Certification promotion is blocked by incomplete domain evidence.")
        if target == "shadow" and not self.config.provider_configured:
            raise ValidationError("Shadow activation requires a configured server-side provider.")
        now = utc_now()
        with self.database.transaction() as connection:
            connection.execute(
                "UPDATE mlb_domain_certification SET state=?,reviewer_notes=?,certified_at=?,updated_at=? WHERE domain=?",
                (target, reason.strip()[:1000], now if target == "certified_live" else None, now, domain_id),
            )
            connection.execute(
                "INSERT INTO audit_log(id,actor_id,action,target_type,target_id,metadata_json,created_at) VALUES(lower(hex(randomblob(16))),?,?,?,?,?,?)",
                (actor[:120], "mlb_domain_certification_changed", "mlb_domain", domain_id,
                 json.dumps({"from": current["configuredState"], "to": target, "reason": reason.strip()[:500]}), now),
            )
        return self.domain(domain_id)

    def set_control(self, control: str, enabled: bool, *, actor: str, reason: str, domain_id: str = "") -> dict[str, Any]:
        allowed = {"provider", "league", "polling", "market_data", "live_event", "domain"}
        if control not in allowed or control == "domain" and not domain_id:
            raise ValidationError("Unknown certification kill switch.")
        if domain_id and domain_id not in {item[0] for item in DOMAIN_DEFINITIONS}:
            raise ValidationError("Unknown MLB certification domain.")
        if not reason.strip():
            raise ValidationError("Kill-switch changes require a reason.")
        key = domain_id if control == "domain" else "mlb"
        now = utc_now()
        with self.database.transaction() as connection:
            connection.execute(
                """INSERT INTO operational_controls(scope_type,scope_id,enabled,reason,updated_at,updated_by)
                   VALUES(?,?,?,?,?,?) ON CONFLICT(scope_type,scope_id) DO UPDATE SET
                   enabled=excluded.enabled,reason=excluded.reason,updated_at=excluded.updated_at,updated_by=excluded.updated_by""",
                (control, key, int(enabled), reason.strip()[:500], now, actor[:120]),
            )
        return self.controls(domain_id)

    def controls(self, domain_id: str = "") -> dict[str, Any]:
        rows = self.database.execute("SELECT * FROM operational_controls")
        values = {(row["scope_type"], row["scope_id"]): bool(row["enabled"]) for row in rows}
        env_domains = set(self.config.mlb_domain_kill_switches)
        return {
            "providerEnabled": values.get(("provider", "mlb"), not self.config.sports_provider_kill_switch),
            "leagueEnabled": values.get(("league", "mlb"), not self.config.mlb_kill_switch),
            "pollingEnabled": values.get(("polling", "mlb"), self.config.mlb_live_polling_enabled),
            "marketDataEnabled": values.get(("market_data", "mlb"), not self.config.mlb_market_data_kill_switch),
            "liveEventEnabled": values.get(("live_event", "mlb"), not self.config.mlb_live_event_kill_switch),
            "domainEnabled": values.get(("domain", domain_id), domain_id not in env_domains) if domain_id else True,
        }

    def _effective_state(self, domain_id: str, configured: str) -> str:
        controls = self.controls(domain_id)
        if not controls["providerEnabled"] or not controls["leagueEnabled"] or not controls["domainEnabled"]:
            return "suspended"
        if domain_id in MARKET_DOMAINS and not controls["marketDataEnabled"]:
            return "suspended"
        if domain_id in LIVE_DOMAINS and not controls["liveEventEnabled"]:
            return "suspended"
        health = self._health.get(domain_id, {}).get("state")
        if configured in LIVE_STATES and health in {"degraded", "unavailable", "misconfigured"}:
            return "degraded" if health == "degraded" else "suspended"
        return configured

    @staticmethod
    def _recommended_state(row: Any) -> str:
        criteria = json.loads(row["criteria_json"])
        return "shadow" if all(item["status"] != "failed" for item in criteria) else "fixture_supported"

    @staticmethod
    def _trust_state(state: str, health: str) -> str:
        if state in {"fixture_supported", "shadow", "internal_testing", "configured"}: return "fixture"
        if state == "certified_live" and health in {"healthy", "impaired"}: return "certified_live"
        if state == "limited_live" and health in {"healthy", "impaired"}: return "limited_live"
        if state == "degraded" or health == "degraded": return "degraded"
        if state == "suspended" or health in {"unavailable", "misconfigured"}: return "unavailable"
        return "unavailable"

    def evaluate_health(self, domain_id: str, metrics: dict[str, Any]) -> dict[str, Any]:
        self.domain(domain_id)
        requests = max(0, int(metrics.get("requests", 0)))
        failures = max(0, int(metrics.get("failures", 0)))
        timeouts = max(0, int(metrics.get("timeouts", 0)))
        rate_limits = max(0, int(metrics.get("rateLimits", 0)))
        rejected = max(0, int(metrics.get("validationRejected", 0)))
        stale = max(0, int(metrics.get("staleFallbacks", 0)))
        malformed = max(0, int(metrics.get("malformed", 0)))
        mapping_failures = max(0, int(metrics.get("mappingFailures", 0)))
        polling_remaining = max(0, int(metrics.get("pollingBudgetRemaining", self.config.mlb_live_poll_request_budget)))
        corrections = max(0, int(metrics.get("corrections", 0)))
        shadow_discrepancies = max(0, int(metrics.get("shadowDiscrepancies", 0)))
        latency = max(0.0, float(metrics.get("latencyMs", 0)))
        if metrics.get("configured") is False:
            state, reason = "misconfigured", "Provider configuration is incomplete."
        elif metrics.get("authFailure") or metrics.get("entitlementFailure"):
            state, reason = "unavailable", "Authentication or entitlement failed; retries and live use are stopped."
        elif requests == 0:
            state, reason = "unavailable", "No provider requests are available for the health window."
        else:
            pressure = max(failures / requests, timeouts / requests, rate_limits / requests,
                           rejected / requests, stale / requests, malformed / requests)
            state = "healthy" if pressure <= .02 and latency <= 1500 else "impaired" if pressure <= .10 and latency <= 4000 else "degraded" if pressure <= .35 else "unavailable"
            reason = f"Worst observed issue rate {pressure:.1%}; average latency {latency:.0f} ms."
        denominator = max(1, requests)
        alerts = []
        for code, triggered in (
            ("provider_failure_rate", failures > 0 and failures / denominator >= self.config.mlb_cert_failure_rate_alert),
            ("stale_data_rate", stale > 0 and stale / denominator >= self.config.mlb_cert_stale_rate_alert),
            ("validation_rejection_rate", rejected > 0 and rejected / denominator >= self.config.mlb_cert_rejection_rate_alert),
            ("rate_limit_pressure", rate_limits > 0 and rate_limits / denominator >= self.config.mlb_cert_rate_limit_alert),
            ("mapping_failures", mapping_failures > 0 and mapping_failures >= self.config.mlb_cert_mapping_failure_alert),
            ("polling_budget", polling_remaining <= self.config.mlb_cert_polling_budget_alert),
            ("correction_spike", corrections >= self.config.mlb_cert_correction_spike_alert),
            ("shadow_discrepancy_spike", shadow_discrepancies >= self.config.mlb_cert_shadow_discrepancy_alert),
        ):
            if triggered: alerts.append(code)
        result = {"domain": domain_id, "state": state, "reason": reason, "requests": requests,
                  "failures": failures, "timeouts": timeouts, "rateLimits": rate_limits,
                  "validationRejected": rejected, "staleFallbacks": stale,
                  "malformedPayloads": malformed, "latencyMs": latency,
                  "mappingFailures": mapping_failures, "pollingBudgetRemaining": polling_remaining,
                  "corrections": corrections, "shadowDiscrepancies": shadow_discrepancies,
                  "internalAlerts": alerts,
                  "isBettingConfidence": False, "evaluatedAt": utc_now()}
        self._health[domain_id] = result
        return copy.deepcopy(result)

    def select_source(self, domain_id: str, *, live: Any = None, stale_cache: Any = None,
                      fixture: Any = None, supports_fixture: bool = True) -> FailoverResult:
        item = self.domain(domain_id)
        health = item["providerHealth"]
        if item["state"] in LIVE_STATES and health in {"healthy", "impaired"} and live is not None:
            return FailoverResult(item["state"], "live", item["publicLabel"], copy.deepcopy(live), False, "Eligible provider value selected.")
        if (item["state"] in LIVE_STATES | {"degraded"} or item["configuredState"] in LIVE_STATES) and stale_cache is not None:
            return FailoverResult("degraded", "cached_stale", "Delayed", copy.deepcopy(stale_cache), True, "Validated stale cache used after live source became unavailable.")
        if supports_fixture and fixture is not None:
            return FailoverResult("fixture_supported", "fixture", "Fixture", copy.deepcopy(fixture), True, "Clearly labeled fixture fallback used; it is not live data.")
        return FailoverResult("unsupported" if not supports_fixture else "unknown", "unavailable", "Unavailable", None, False, "No validated source is available.")

    def explain(self, domain_id: str) -> dict[str, Any]:
        item = self.domain(domain_id, public=True)
        wording = {
            "certified_live": f"Using certified live MLB {item['label'].lower()} data.",
            "limited_live": f"Current MLB {item['label'].lower()} data is available, but coverage is limited.",
            "degraded": f"Current MLB {item['label'].lower()} data is delayed or degraded; limitations remain visible.",
            "suspended": f"I don’t have verified live MLB {item['label'].lower()} data right now.",
        }.get(item["state"], f"Using clearly labeled fixture MLB {item['label'].lower()} data; live certification is not complete.")
        return {"domain": domain_id, "state": item["state"], "answer": wording,
                "limitations": item["knownLimitations"], "isPrediction": False,
                "isBettingConfidence": False}
