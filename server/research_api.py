from __future__ import annotations

from typing import Any

from .errors import UnsupportedFeatureError, ValidationError


SUPPORTED_RESEARCH_INTENTS = {
    "event_search", "entity_lookup", "historical_summary", "comparison",
    "leaderboard", "visualization", "insight", "market_context",
}


class DeterministicResearchService:
    """Server orchestration boundary; statistical truth remains in normalized evidence rows."""

    def __init__(self, database: Any, feature_flags: Any):
        self.database = database
        self.flags = feature_flags

    def execute(self, request: dict[str, Any]) -> dict[str, Any]:
        if not isinstance(request, dict):
            raise ValidationError("Research request must be an object.")
        structured = request.get("structuredQuery")
        if not isinstance(structured, dict):
            raise ValidationError("A structuredQuery object is required.")
        intent = str(structured.get("intent") or "")
        if intent not in SUPPORTED_RESEARCH_INTENTS:
            raise UnsupportedFeatureError("This deterministic research intent is not supported by the server scaffold.")
        try:
            limit = int(structured.get("limit") or 25)
        except (TypeError, ValueError) as error:
            raise ValidationError("Research result limit must be an integer.") from error
        if not 1 <= limit <= 100:
            raise ValidationError("Research result limit must be between 1 and 100.")
        raw_evidence_ids = structured.get("evidenceIds", [])
        if not isinstance(raw_evidence_ids, list):
            raise ValidationError("Research evidenceIds must be a list.")
        evidence_ids = [str(value)[:240] for value in raw_evidence_ids if value][:100]
        if intent in {"historical_summary", "comparison", "leaderboard", "insight"} and not self.flags.historical_stats_enabled:
            return {
                "status": "unavailable",
                "intent": intent,
                "message": "Historical statistics are not enabled on this server.",
                "evidence": [],
                "evidenceIds": evidence_ids,
                "deterministic": True,
                "llmSourceOfTruth": False,
                "partial": False,
            }
        return {
            "status": "ready",
            "intent": intent,
            "evidence": [],
            "evidenceIds": evidence_ids,
            "deterministic": True,
            "llmSourceOfTruth": False,
            "message": "The server research boundary is ready; no compatible normalized evidence rows were supplied.",
            "partial": True,
        }
