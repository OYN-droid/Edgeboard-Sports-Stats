from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
import json
import uuid

from .freshness import parse_timestamp
from .database import Database, utc_now


EDGE_TRUST_COMPONENTS = (
    "historical_data", "markets", "lineups", "injuries", "provider_agreement",
    "freshness", "coverage", "identity", "visualizations", "research_completeness",
)

PUBLIC_COMPONENT_LABELS = {
    "historical_data": "Historical Statistics",
    "markets": "Markets",
    "lineups": "Lineups",
    "injuries": "Injuries",
    "provider_agreement": "Provider Agreement",
    "freshness": "Freshness",
    "coverage": "Coverage",
    "identity": "Identity Resolution",
    "visualizations": "Visualization Support",
    "research_completeness": "Research Completeness",
}

STATE_VALUES = {
    "verified": 1.0, "certified": 1.0, "live_verified": 1.0, "fresh": 1.0,
    "passing": .9, "cached_fresh": .82, "conditional": .72, "fixture": .66,
    "sample": .62, "pending": .5, "waiting": .5, "live_partial": .5,
    "partial": .48, "delayed": .45, "limited": .42, "cached_stale": .25,
    "stale": .2, "failing": .12, "error": 0.0, "suspended": 0.0,
    "unavailable": 0.0, "not_started": 0.0,
}

WEIGHTS = {
    "historical_data": .18, "markets": .14, "lineups": .08, "injuries": .07,
    "provider_agreement": .13, "freshness": .13, "coverage": .11,
    "identity": .09, "visualizations": .03, "research_completeness": .14,
}


def quality_label(score: float) -> str:
    if score >= 90: return "Excellent"
    if score >= 75: return "Good"
    if score >= 40: return "Limited"
    return "Incomplete"


def public_component_status(state: str, score: float) -> str:
    labels = {
        "verified": "Verified", "certified": "Verified", "live_verified": "Verified",
        "fresh": "Fresh", "passing": "Verified", "cached_fresh": "Delayed",
        "conditional": "Conditional", "fixture": "Validated Sample", "sample": "Validated Sample",
        "pending": "Waiting for Confirmation", "waiting": "Waiting for Confirmation",
        "live_partial": "Partial", "partial": "Partial", "delayed": "Delayed",
        "cached_stale": "Stale", "stale": "Stale", "failing": "Failed Validation",
        "error": "Error", "suspended": "Suspended", "unavailable": "Unavailable",
        "not_started": "Not Evaluated",
    }
    return labels.get(state, "Verified" if score >= .9 else "Limited" if score >= .4 else "Unavailable")


def evaluate_edge_trust(
    components: dict[str, Any], *, applicable: set[str] | None = None,
    conflicts: list[dict[str, Any]] | None = None, sample: bool = False,
    last_validation: str | None = None, include_internal: bool = False,
) -> dict[str, Any]:
    active = set(applicable or EDGE_TRUST_COMPONENTS) & set(EDGE_TRUST_COMPONENTS)
    normalized: dict[str, dict[str, Any]] = {}
    for component in EDGE_TRUST_COMPONENTS:
        if component not in active:
            continue
        raw = components.get(component, "unavailable")
        if isinstance(raw, dict):
            state = str(raw.get("state") or "unavailable")
            numeric = raw.get("score")
            source = str(raw.get("source") or "")
            updated_at = raw.get("updatedAt")
        elif isinstance(raw, (int, float)):
            state, numeric, source, updated_at = "verified", raw, "", None
        else:
            state, numeric, source, updated_at = str(raw), None, "", None
        score = max(0.0, min(1.0, float(numeric) if isinstance(numeric, (int, float)) else STATE_VALUES.get(state, 0.0)))
        normalized[component] = {"state": state, "score": score, "source": source, "updatedAt": updated_at}

    disagreement = list(conflicts or [])
    agreement = max(0.0, 1.0 - min(1.0, len(disagreement) * .2))
    if "provider_agreement" in normalized and disagreement:
        normalized["provider_agreement"]["score"] = min(normalized["provider_agreement"]["score"], agreement)
        normalized["provider_agreement"]["state"] = "failing" if agreement < .6 else "partial"

    denominator = sum(WEIGHTS[key] for key in normalized)
    raw_score = sum(normalized[key]["score"] * WEIGHTS[key] for key in normalized) / denominator * 100 if denominator else 0
    if sample:
        raw_score = min(raw_score, 69)
    score = round(max(0.0, min(100.0, raw_score)))
    timestamp = last_validation if parse_timestamp(last_validation) else datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    public_details = [{
        "id": key,
        "label": PUBLIC_COMPONENT_LABELS[key],
        "status": public_component_status(value["state"], value["score"]),
        "updatedAt": value["updatedAt"],
        **({"percentage": round(value["score"] * 100)} if key in {"provider_agreement", "research_completeness"} else {}),
    } for key, value in normalized.items()]
    limitations = []
    if sample: limitations.append("Validated sample or fixture evidence is not live data.")
    if disagreement: limitations.append(f"{len(disagreement)} unresolved provider conflict{'s' if len(disagreement) != 1 else ''} {'reduce' if len(disagreement) != 1 else 'reduces'} research quality.")
    waiting = [item["label"] for item in public_details if item["status"] in {"Waiting for Confirmation", "Unavailable", "Stale", "Failed Validation"}]
    if waiting: limitations.append(f"Waiting on: {', '.join(waiting[:4])}.")
    result = {
        "researchQuality": {
            "label": quality_label(score), "score": score,
            "isBettingConfidence": False, "isModelConfidence": False, "isProbability": False,
        },
        "details": public_details,
        "lastValidation": timestamp,
        "limitations": limitations,
        "conflicts": [{
            "category": item.get("category", "provider_conflict"),
            "recordId": item.get("recordId"),
            "sources": item.get("sources", []),
            "recommendation": "Await official confirmation before relying on the disputed field.",
        } for item in disagreement],
        "applicableComponents": len(normalized),
    }
    if include_internal:
        result["internal"] = {"components": normalized, "weights": {key: WEIGHTS[key] for key in normalized}}
    return result


def trust_from_coverage(league: dict[str, Any], *, conflicts: list[dict[str, Any]] | None = None, include_internal: bool = False) -> dict[str, Any]:
    domains = {item["id"]: item for item in league.get("domains", [])}
    def state(domain: str) -> dict[str, Any]:
        item = domains.get(domain, {})
        return {"state": item.get("sourceMode") or item.get("readiness") or "unavailable", "updatedAt": item.get("lastUpdatedAt")}
    has_visuals = "spatial_data" in domains
    components = {
        "historical_data": state("historical_stats"), "markets": state("markets"),
        "lineups": state("lineups"), "injuries": state("injuries"),
        "provider_agreement": "verified" if not conflicts else "partial",
        "freshness": {"state": "sample" if league.get("dataMode") == "fixture" else "fresh", "updatedAt": league.get("lastUpdatedAt")},
        "coverage": {"score": sum(item.get("sourceMode") != "unavailable" for item in domains.values()) / max(1, len(domains)), "state": "partial"},
        "identity": state("entities"), "visualizations": state("spatial_data"),
        "research_completeness": {"score": sum(item.get("sourceMode") != "unavailable" for item in domains.values()) / max(1, len(domains)), "state": "partial"},
    }
    applicable = set(EDGE_TRUST_COMPONENTS)
    if "lineups" not in domains: applicable.discard("lineups")
    if "injuries" not in domains: applicable.discard("injuries")
    if not has_visuals: applicable.discard("visualizations")
    return evaluate_edge_trust(components, applicable=applicable, conflicts=conflicts, sample=league.get("dataMode") in {"fixture", "sample"}, last_validation=league.get("lastUpdatedAt"), include_internal=include_internal)


class EdgeTrustService:
    def __init__(self, database: Database):
        self.database = database

    def evaluate_league(self, league: dict[str, Any], *, trigger: str = "validation", record: bool = False, include_internal: bool = False) -> dict[str, Any]:
        trust = trust_from_coverage(league, include_internal=include_internal)
        if record:
            with self.database.transaction() as connection:
                connection.execute(
                    "INSERT INTO edge_trust_history(id,league_id,research_quality,quality_label,details_json,trigger,evaluated_at) VALUES(?,?,?,?,?,?,?)",
                    (uuid.uuid4().hex, league["leagueId"], trust["researchQuality"]["score"], trust["researchQuality"]["label"], json.dumps({"details": trust["details"], "limitations": trust["limitations"]}), trigger[:80], utc_now()),
                )
        return trust

    def history(self, league_id: str = "", limit: int = 100) -> list[dict[str, Any]]:
        safe_limit = max(1, min(500, int(limit)))
        if league_id:
            rows = self.database.execute("SELECT * FROM edge_trust_history WHERE league_id=? ORDER BY evaluated_at DESC LIMIT ?", (league_id, safe_limit))
        else:
            rows = self.database.execute("SELECT * FROM edge_trust_history ORDER BY evaluated_at DESC LIMIT ?", (safe_limit,))
        return [{
            "leagueId": row["league_id"], "researchQuality": row["research_quality"],
            "label": row["quality_label"], "details": json.loads(row["details_json"]),
            "trigger": row["trigger"], "evaluatedAt": row["evaluated_at"],
        } for row in rows]
