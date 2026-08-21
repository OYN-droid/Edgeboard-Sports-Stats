from __future__ import annotations

from typing import Any

from .errors import UnsupportedFeatureError, ValidationError
from .edge_trust import evaluate_edge_trust


SUPPORTED_RESEARCH_INTENTS = {
    "event_search", "entity_lookup", "historical_summary", "comparison",
    "leaderboard", "visualization", "insight", "market_context",
}


class DeterministicResearchService:
    """Server orchestration boundary; statistical truth remains in normalized evidence rows."""

    def __init__(self, database: Any, feature_flags: Any, mlb_research: Any | None = None, mlb_markets: Any | None = None, mlb_player_props: Any | None = None, market_movement: Any | None = None):
        self.database = database
        self.flags = feature_flags
        self.mlb_research = mlb_research
        self.mlb_markets = mlb_markets
        self.mlb_player_props = mlb_player_props
        self.market_movement = market_movement

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
        if self.mlb_research is not None and str(structured.get("leagueId") or "").lower() == "mlb":
            season = structured.get("season")
            if intent == "leaderboard":
                stat_id = str(structured.get("statId") or "").strip()
                board = self.mlb_research.leaderboard(
                    stat_id, season, entity_type=str(structured.get("entityType") or "player"),
                    qualified_only=structured.get("qualifiedOnly") is not False, limit=limit,
                )
                return {
                    "status": "ready", "intent": intent, "deterministic": True,
                    "llmSourceOfTruth": False, "partial": board["source"]["sample"],
                    "message": f'{board["leaderLabel"]}: {stat_id}.',
                    "evidence": board["items"], "evidenceIds": [item["entityId"] for item in board["items"]],
                    "scope": {"leagueId": "mlb", "season": board["season"], "statId": stat_id},
                    "qualification": board["qualificationRule"], "source": board["source"],
                    "edgeTrust": board["edgeTrust"],
                }
            if intent == "historical_summary" and structured.get("domain") == "standings":
                table = self.mlb_research.standings(season)
                return {
                    "status": "ready", "intent": intent, "deterministic": True,
                    "llmSourceOfTruth": False, "partial": True,
                    "message": table["coverageNotice"], "evidence": table["items"],
                    "evidenceIds": [item["teamId"] for item in table["items"]],
                    "scope": {"leagueId": "mlb", "season": table["season"], "domain": "standings"},
                    "source": table["source"], "edgeTrust": table["edgeTrust"],
                }
        if (
            self.mlb_player_props is not None
            and str(structured.get("leagueId") or "").lower() == "mlb"
            and intent == "market_context"
            and structured.get("propId")
        ):
            research = self.mlb_player_props.research(str(structured["propId"]))
            window = research["historicalWindows"][str(structured.get("window") or "last10") if str(structured.get("window") or "last10") in research["historicalWindows"] else "last10"]
            return {
                "status":"ready", "intent":intent, "deterministic":True, "llmSourceOfTruth":False,
                "partial":True, "message":window["disclosure"], "evidence":window["supportingRows"][:limit],
                "evidenceIds":[row["eventId"] for row in window["supportingRows"][:limit]],
                "scope":{"leagueId":"mlb","propId":structured["propId"],"statId":research["definition"]["statId"],"line":research["prop"]["line"],"side":research["prop"]["side"]},
                "historicalPerformance":window, "counterarguments":research["counterarguments"],
                "source":research["source"], "edgeTrust":research["edgeTrust"],
                "limitations":research["limitations"],
            }
        if (
            self.mlb_markets is not None
            and str(structured.get("leagueId") or "").lower() == "mlb"
            and intent == "market_context"
        ):
            event_id = str(structured.get("eventId") or "").strip()
            family = str(structured.get("marketFamily") or structured.get("marketType") or "").strip()
            markets = self.mlb_markets.markets(event_id=event_id, family=family)
            comparisons = self.mlb_markets.best_prices(event_id=event_id, family=family)
            evidence = markets["items"][:limit]
            movement_requested = str(structured.get("action") or "").lower() in {"movement", "explain_move"}
            movement = None
            if movement_requested and self.market_movement is not None:
                movement = self.market_movement.timeline(
                    event_id=event_id, market_id=str(structured.get("marketId") or ""),
                    sportsbook_id=str(structured.get("sportsbookId") or ""),
                )
            message = (
                "No verified cause has been identified. Observed market changes remain separate from causal evidence."
                if movement_requested and movement and movement["items"] else
                "No normalized movement history is available for this market."
                if movement_requested else
                f"Found {len(evidence)} normalized fixture price rows; these are sample evidence, not live odds."
            )
            return {
                "status": "ready" if evidence else "unavailable", "intent": intent,
                "deterministic": True, "llmSourceOfTruth": False, "partial": True,
                "message": message, "evidence": evidence,
                "evidenceIds": [item["id"] for item in evidence],
                "scope": {"leagueId": "mlb", "eventId": event_id or None, "marketFamily": family or None},
                "bestPriceComparisons": comparisons["items"], "source": markets["source"],
                "marketMovement": movement,
                "edgeTrust": markets["edgeTrust"],
                "limitations": ["Fixture/sample market evidence only.", "No movement cause is inferred without provider evidence."],
            }
        if intent in {"historical_summary", "comparison", "leaderboard", "insight"} and not self.flags.historical_stats_enabled:
            response = {
                "status": "unavailable",
                "intent": intent,
                "message": "Historical statistics are not enabled on this server.",
                "evidence": [],
                "evidenceIds": evidence_ids,
                "deterministic": True,
                "llmSourceOfTruth": False,
                "partial": False,
            }
            response["edgeTrust"] = evaluate_edge_trust({
                "historical_data": "unavailable", "freshness": "unavailable",
                "coverage": 0, "identity": "pending", "research_completeness": 0,
            }, applicable={"historical_data", "freshness", "coverage", "identity", "research_completeness"})
            return response
        response = {
            "status": "ready",
            "intent": intent,
            "evidence": [],
            "evidenceIds": evidence_ids,
            "deterministic": True,
            "llmSourceOfTruth": False,
            "message": "The server research boundary is ready; no compatible normalized evidence rows were supplied.",
            "partial": True,
        }
        response["edgeTrust"] = evaluate_edge_trust({
            "historical_data": "pending", "freshness": "pending", "coverage": .25,
            "identity": "verified", "research_completeness": .25,
        }, applicable={"historical_data", "freshness", "coverage", "identity", "research_completeness"})
        return response
