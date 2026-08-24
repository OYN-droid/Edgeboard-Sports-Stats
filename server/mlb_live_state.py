from __future__ import annotations

import copy
import hashlib
import json
import math
import re
import threading
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from .cache import CachePolicy, MemoryCache
from .edge_trust import evaluate_edge_trust
from .errors import (
    ProviderAuthenticationError, ProviderEntitlementError, ProviderError,
    ProviderRateLimitError, ProviderValidationError, ValidationError,
)
from .mlb_domain_service import MlbDomainService
from .provider_contracts import CapabilityDeclaration


MLB_LIVE_STATE_CONTRACT_VERSION = "edgeboard-mlb-live-state-v1"
MLB_LIVE_STATE_FIXTURE_PROVIDER = "edgeboard-mlb-live-state-fixture"
LIVE_STATUSES = frozenset({
    "scheduled", "pregame", "in_progress", "delayed", "postponed",
    "suspended", "resumed", "cancelled", "final", "unknown",
})
ACTIVE_STATUSES = frozenset({"pregame", "in_progress", "delayed", "suspended", "resumed"})
STATUS_ALIASES = {
    "scheduled": "scheduled", "pregame": "pregame", "pre_game": "pregame",
    "inprogress": "in_progress", "in_progress": "in_progress", "live": "in_progress",
    "delayed": "delayed", "postponed": "postponed", "suspended": "suspended",
    "resumed": "resumed", "cancelled": "cancelled", "canceled": "cancelled",
    "completed": "final", "final": "final", "unknown": "unknown",
}
LEGAL_TRANSITIONS = {
    "scheduled": {"pregame", "in_progress", "delayed", "postponed", "cancelled"},
    "pregame": {"in_progress", "delayed", "postponed", "cancelled"},
    "in_progress": {"delayed", "suspended", "final"},
    "delayed": {"resumed", "in_progress", "suspended", "postponed", "cancelled"},
    "suspended": {"resumed", "in_progress", "postponed", "cancelled", "final"},
    "resumed": {"in_progress", "delayed", "suspended", "final"},
    "postponed": {"scheduled", "pregame", "cancelled"},
    "cancelled": set(), "final": set(), "unknown": LIVE_STATUSES,
}
POLL_INTERVALS = {
    "scheduled": 3600, "pregame": 60, "in_progress": 8, "delayed": 30,
    "suspended": 120, "resumed": 8, "postponed": 0, "cancelled": 0,
    "final": 0, "unknown": 0,
}
FRESHNESS_THRESHOLDS = {
    "scheduled": 3600, "pregame": 180, "in_progress": 20, "delayed": 90,
    "suspended": 300, "resumed": 20, "postponed": 3600,
    "cancelled": 86400, "final": 900, "unknown": 0,
}


def mlb_ticket9_capabilities() -> tuple[CapabilityDeclaration, ...]:
    return tuple(CapabilityDeclaration(
        MLB_LIVE_STATE_FIXTURE_PROVIDER, "baseball", "mlb", domain,
        support_state="fixture_supported", rollout_state="fixture_only",
        fixture_available=True, contract_confirmed=True,
        freshness_policy="event_status", cache_policy="event_status",
        retention_policy="bounded-normalized-history",
        limitations=("Deterministic Ticket 9 live-state fixture; not live provider data.",),
    ) for domain in ("event_status", "live_scores", "inning_state", "live_participants", "inning_linescore"))


def _iso(value: Any, field: str) -> str:
    try:
        parsed = datetime.fromisoformat(str(value or "").replace("Z", "+00:00"))
    except (TypeError, ValueError) as error:
        raise ProviderValidationError(f"MLB live-state {field} is invalid.") from error
    if parsed.tzinfo is None:
        raise ProviderValidationError(f"MLB live-state {field} requires a timezone.")
    return parsed.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _integer(value: Any, field: str, minimum: int, maximum: int | None = None) -> int:
    if isinstance(value, bool):
        raise ProviderValidationError(f"MLB live-state {field} must be an integer.")
    try:
        number = int(value)
    except (TypeError, ValueError) as error:
        raise ProviderValidationError(f"MLB live-state {field} must be an integer.") from error
    if number != value and not isinstance(value, str) or isinstance(value, str) and str(number) != value.strip():
        raise ProviderValidationError(f"MLB live-state {field} must be an integer.")
    if number < minimum or maximum is not None and number > maximum:
        raise ProviderValidationError(f"MLB live-state {field} is outside the supported range.")
    return number


def _canonical_status(value: Any) -> str:
    key = str(value or "unknown").strip().casefold().replace(" ", "_")
    return STATUS_ALIASES.get(key, "unknown")


def _fingerprint(state: dict[str, Any]) -> str:
    meaningful = {key: value for key, value in state.items() if key not in {
        "id", "version", "fingerprint", "providerUpdatedAt", "fetchedAt", "freshness",
        "source", "sourceMode", "provenance", "edgeTrust", "warnings", "_providerStatus",
    }}
    return hashlib.sha256(json.dumps(meaningful, sort_keys=True, separators=(",", ":")).encode()).hexdigest()[:24]


def _freshness(status: str, provider_updated_at: str, fetched_at: str, reference: datetime) -> dict[str, Any]:
    updated = datetime.fromisoformat(provider_updated_at.replace("Z", "+00:00"))
    fetched = datetime.fromisoformat(fetched_at.replace("Z", "+00:00"))
    age = max(0, int((reference - updated).total_seconds()))
    provider_delay = max(0, int((fetched - updated).total_seconds()))
    threshold = FRESHNESS_THRESHOLDS.get(status, 0)
    state = "unavailable" if threshold <= 0 and status == "unknown" else "fresh" if age <= threshold else "delayed" if age <= threshold * 3 else "stale"
    return {"state": state, "ageSeconds": age, "providerDelaySeconds": provider_delay,
            "thresholdSeconds": threshold, "eventAware": True}


def _state_trust(state: dict[str, Any], mode: str, conflicts: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    warnings = state.get("warnings", [])
    unresolved = any("unresolved" in item for item in warnings)
    freshness = state.get("freshness", {}).get("state", "unavailable")
    return evaluate_edge_trust({
        "provider_validation": "sample" if mode in {"fixture", "sample"} else "passing",
        "event_reconciliation": "passing",
        "status_consistency": "partial" if "invalid_transition" in warnings else "passing",
        "score_consistency": "partial" if any("score" in item for item in warnings) else "passing",
        "freshness": "cached_stale" if freshness == "stale" else "partial" if freshness == "delayed" else "sample" if mode in {"fixture", "sample"} else "passing",
        "identity": "partial" if unresolved else "passing",
        "coverage": "partial" if warnings else "passing",
    }, applicable={"provider_validation", "event_reconciliation", "status_consistency", "score_consistency", "freshness", "identity", "coverage"},
        conflicts=conflicts or [], sample=mode in {"fixture", "sample"}, last_validation=state.get("fetchedAt"))


class MlbLiveStateAdapter:
    """Validates provider-neutral MLB progression without inferring missing game detail."""

    def normalize(self, payload: dict[str, Any], schedule: dict[str, Any], *,
                  source_mode: str | None = None, now: datetime | None = None) -> dict[str, Any]:
        if not isinstance(payload, dict) or payload.get("contractVersion") != MLB_LIVE_STATE_CONTRACT_VERSION:
            raise ProviderValidationError("MLB live-state provider contract is unsupported.")
        provider = str(payload.get("provider") or "").strip()
        if not provider:
            raise ProviderValidationError("MLB live-state provider is required.")
        recorded_at = _iso(payload.get("recordedAt"), "recordedAt")
        mode = source_mode or str(payload.get("sourceMode") or "fixture")
        if mode not in {"fixture", "sample", "live", "cached", "degraded", "offline"}:
            raise ProviderValidationError("MLB live-state source mode is invalid.")
        reference = now or datetime.fromisoformat(recorded_at.replace("Z", "+00:00"))
        games = {item["id"]: item for item in schedule.get("games", [])}
        entities = {item["id"]: item for item in schedule.get("entities", [])}
        players = {key for key, item in entities.items() if item.get("type") == "athlete"}
        states: list[dict[str, Any]] = []
        rejected: list[dict[str, Any]] = []
        for index, raw in enumerate(payload.get("updates", [])):
            try:
                states.append(self._state(raw, games, players, provider, mode, reference))
            except ProviderValidationError as error:
                rejected.append({"domain": "live_event_state", "index": index, "code": "invalid_live_state",
                                 "safeReason": str(error)})
        return {
            "contractVersion": MLB_LIVE_STATE_CONTRACT_VERSION, "provider": provider,
            "sourceMode": mode, "recordedAt": recorded_at,
            "attribution": str(payload.get("attribution") or provider), "states": states,
            "rejected": rejected,
        }

    def _state(self, raw: Any, games: dict[str, dict[str, Any]], players: set[str],
               provider: str, mode: str, reference: datetime) -> dict[str, Any]:
        if not isinstance(raw, dict):
            raise ProviderValidationError("MLB live-state update must be an object.")
        event_id = str(raw.get("eventId") or "").strip()
        if event_id not in games:
            raise ProviderValidationError("MLB live-state event identity is unresolved.")
        status = _canonical_status(raw.get("status"))
        provider_updated = _iso(raw.get("providerUpdatedAt"), "providerUpdatedAt")
        fetched_at = _iso(raw.get("fetchedAt") or provider_updated, "fetchedAt")
        warnings: list[str] = []
        state: dict[str, Any] = {
            "eventId": event_id, "status": status, "period": None, "score": None,
            "outs": None, "count": None, "bases": None, "baseRunners": None,
            "currentBatterId": None, "currentPitcherId": None, "inningScores": [],
            "inningScoresComplete": raw.get("inningScoresComplete") is True,
            "providerUpdatedAt": provider_updated, "fetchedAt": fetched_at,
            "warnings": warnings, "source": provider, "sourceMode": mode,
            "_providerStatus": str(raw.get("providerStatus") or raw.get("status") or "unknown")[:80],
        }
        period = raw.get("period")
        if period is not None:
            if not isinstance(period, dict):
                raise ProviderValidationError("MLB live-state period must be an object.")
            inning = _integer(period.get("inning"), "period.inning", 1)
            half = str(period.get("half") or "").strip().casefold()
            if half not in {"top", "bottom", "middle", "end"}:
                raise ProviderValidationError("MLB live-state inning half is invalid.")
            state["period"] = {"sport": "baseball", "inning": inning, "half": half}
        score = raw.get("score")
        if score is not None:
            if not isinstance(score, dict):
                raise ProviderValidationError("MLB live-state score must be an object.")
            state["score"] = {"away": _integer(score.get("away"), "score.away", 0),
                              "home": _integer(score.get("home"), "score.home", 0)}
        if raw.get("outs") not in (None, ""):
            outs = _integer(raw.get("outs"), "outs", 0, 3)
            if outs == 3:
                warnings.append("provider_three_out_transition_omitted")
            else:
                state["outs"] = outs
        count = raw.get("count")
        if count is not None:
            if not isinstance(count, dict):
                raise ProviderValidationError("MLB live-state count must be an object.")
            normalized_count: dict[str, int] = {}
            if count.get("balls") not in (None, ""):
                normalized_count["balls"] = _integer(count["balls"], "count.balls", 0, 3)
            if count.get("strikes") not in (None, ""):
                normalized_count["strikes"] = _integer(count["strikes"], "count.strikes", 0, 2)
            if len(normalized_count) == 1:
                warnings.append("partial_count_coverage")
            state["count"] = normalized_count or None
        bases = raw.get("bases")
        if bases is not None:
            if not isinstance(bases, dict):
                raise ProviderValidationError("MLB live-state bases must be an object.")
            occupancy: dict[str, bool] = {}
            runners: dict[str, str] = {}
            for base in ("first", "second", "third"):
                value = bases.get(base, False)
                if isinstance(value, bool):
                    occupancy[base] = value
                elif value in (None, ""):
                    occupancy[base] = False
                else:
                    player_id = str(value)
                    if player_id not in players:
                        raise ProviderValidationError("MLB live-state base runner is unresolved.")
                    occupancy[base] = True; runners[base] = player_id
            if len(runners.values()) != len(set(runners.values())):
                raise ProviderValidationError("MLB live-state duplicates a base runner.")
            state["bases"] = occupancy
            state["baseRunners"] = runners or None
        for target in ("currentBatterId", "currentPitcherId"):
            value = raw.get(target)
            if value in (None, ""):
                continue
            if str(value) in players:
                state[target] = str(value)
            else:
                warnings.append(f"{target}_unresolved")
        if raw.get("currentBatterName") and not raw.get("currentBatterId"):
            warnings.append("currentBatterId_unresolved_name_only")
        if raw.get("currentPitcherName") and not raw.get("currentPitcherId"):
            warnings.append("currentPitcherId_unresolved_name_only")
        inning_scores, seen_innings = [], set()
        for row in raw.get("inningScores", []):
            if not isinstance(row, dict):
                raise ProviderValidationError("MLB live-state inning score is invalid.")
            inning = _integer(row.get("inning"), "inningScores.inning", 1)
            if inning in seen_innings:
                raise ProviderValidationError("MLB live-state duplicates an inning score.")
            seen_innings.add(inning)
            inning_scores.append({"inning": inning, "away": _integer(row.get("away"), "inningScores.away", 0),
                                  "home": _integer(row.get("home"), "inningScores.home", 0)})
        inning_scores.sort(key=lambda item: item["inning"])
        state["inningScores"] = inning_scores
        if inning_scores and state["score"]:
            away_sum, home_sum = sum(item["away"] for item in inning_scores), sum(item["home"] for item in inning_scores)
            totals = state["score"]
            if away_sum > totals["away"] or home_sum > totals["home"]:
                raise ProviderValidationError("MLB inning scores exceed the game total.")
            if state["inningScoresComplete"] and (away_sum != totals["away"] or home_sum != totals["home"]):
                raise ProviderValidationError("Complete MLB inning scores do not match the game total.")
        if status in {"in_progress", "resumed"} and state["period"] is None:
            warnings.append("inning_state_unavailable")
        if status == "final" and state["score"] is None:
            raise ProviderValidationError("Final MLB live state requires a validated score.")
        state["freshness"] = _freshness(status, provider_updated, fetched_at, reference)
        state["fingerprint"] = _fingerprint(state)
        state["id"] = f"mlb-live-{event_id}-{state['fingerprint']}"
        state["version"] = state["fingerprint"]
        state["edgeTrust"] = _state_trust(state, mode)
        return state


def compare_mlb_live_shadow(fixture: dict[str, Any], candidate: dict[str, Any]) -> list[dict[str, Any]]:
    left = {item["eventId"]: item for item in fixture.get("states", [])}
    right = {item["eventId"]: item for item in candidate.get("states", [])}
    differences: list[dict[str, Any]] = []
    fields = {
        "status": "status_conflict", "score": "score_conflict", "period": "inning_conflict",
        "outs": "outs_conflict", "currentBatterId": "batter_conflict",
        "currentPitcherId": "pitcher_conflict",
    }
    for event_id in sorted(set(left) | set(right)):
        if event_id not in left:
            differences.append({"category": "missing_fixture", "recordId": event_id, "details": {}}); continue
        if event_id not in right:
            differences.append({"category": "missing_live", "recordId": event_id, "details": {}}); continue
        for field, category in fields.items():
            first, second = left[event_id].get(field), right[event_id].get(field)
            if field == "period" and isinstance(first, dict) and isinstance(second, dict):
                if first.get("inning") != second.get("inning"):
                    differences.append({"category": "inning_conflict", "recordId": event_id, "details": {"fixture": first.get("inning"), "candidate": second.get("inning")}})
                if first.get("half") != second.get("half"):
                    differences.append({"category": "half_conflict", "recordId": event_id, "details": {"fixture": first.get("half"), "candidate": second.get("half")}})
            elif first != second:
                differences.append({"category": category, "recordId": event_id, "details": {"fixture": first, "candidate": second}})
        if right[event_id].get("freshness", {}).get("state") == "stale":
            differences.append({"category": "stale_live", "recordId": event_id, "details": {}})
    return differences


class LivePollingPolicy:
    """Pure policy object. It never schedules work or starts a background thread."""

    def __init__(self, *, enabled: bool = False, request_budget: int = 20,
                 intervals: dict[str, int] | None = None, correction_window_seconds: int = 900):
        self.enabled = bool(enabled)
        self.request_budget = max(1, int(request_budget))
        self.intervals = {**POLL_INTERVALS, **(intervals or {})}
        self.correction_window_seconds = max(0, int(correction_window_seconds))

    def interval(self, status: str, *, final_age_seconds: int = 0) -> int:
        if not self.enabled:
            return 0
        if status == "final" and final_age_seconds <= self.correction_window_seconds:
            return 120
        return max(0, int(self.intervals.get(status, 0)))

    def eligible(self, state: dict[str, Any], allowlist: set[str]) -> bool:
        return bool(self.enabled and state.get("eventId") in allowlist and self.interval(
            state.get("status", "unknown"), final_age_seconds=state.get("freshness", {}).get("ageSeconds", 0)) > 0)


class MlbLiveStateService(MlbDomainService):
    """Bounded live-state history, explicit polling, shadow validation, and read models."""

    provider_status_fields = ("mlb_live_state_source", "mlb_live_state_edge_trust")

    def __init__(self, cache: MemoryCache, rollout: Any, shadow: Any, schedule_service: Any,
                 *, payload_loader: Callable[[], dict[str, Any]] | None = None,
                 shadow_validator: Callable[..., tuple[dict[str, Any] | None, list[dict[str, Any]], ProviderError | None]] | None = None,
                 polling_policy: LivePollingPolicy | None = None, history_limit: int = 50):
        super().__init__(cache, rollout, shadow, schedule_service, payload_loader=payload_loader, shadow_validator=shadow_validator)
        self.adapter = MlbLiveStateAdapter()
        self.polling_policy = polling_policy or LivePollingPolicy()
        self.history_limit = max(2, history_limit)
        self._lock, self._poll_lock = threading.RLock(), threading.Lock()
        self._history: dict[str, list[dict[str, Any]]] = {}
        self._transitions: list[dict[str, Any]] = []
        self._corrections: list[dict[str, Any]] = []
        self._last_shadow_report: dict[str, Any] | None = None
        self._active_allowlist: set[str] = set()
        self._budget_used = 0
        self._poll_failures = 0
        self._poll_stopped_reason = "kill_switch"
        self._last_provider_error: str | None = None
        self._last_successful_update: str | None = None
        self._coalesced_requests = 0
        self._provider_requests = 0
        self.invalidation_callbacks: list[Callable[[str], None]] = []

    @staticmethod
    def _fixture() -> dict[str, Any]:
        with (Path(__file__).parent / "fixtures" / "mlb_live_state_ticket9.json").open("r", encoding="utf-8") as handle:
            return json.load(handle)

    def read(self, *, refresh: bool = False, now: datetime | None = None) -> dict[str, Any]:
        key = CachePolicy.key(MLB_LIVE_STATE_CONTRACT_VERSION, MLB_LIVE_STATE_FIXTURE_PROVIDER, "event_status", "mlb")
        if not refresh:
            cached, _ = self.cache.get(key)
            if cached is not None:
                return copy.deepcopy(cached)
        with self._lock:
            raw = self.payload_loader()
            reference = now or datetime.fromisoformat(str(raw["recordedAt"]).replace("Z", "+00:00"))
            normalized = self.adapter.normalize(raw, self.schedule_service.read(), source_mode="fixture", now=reference)
            self._accept(normalized["states"])
            result = self._result(normalized)
            ttl = min((POLL_INTERVALS.get(item["status"], 300) or 300 for item in result["states"]), default=300)
            self.cache.set(key, result, ttl, 1800, tags=("league:mlb", "domain:event_status", "domain:live_scores"))
            return copy.deepcopy(result)

    def _accept(self, states: list[dict[str, Any]]) -> dict[str, int]:
        accepted = duplicates = invalid_transitions = corrections = 0
        for state in sorted(states, key=lambda item: (item["providerUpdatedAt"], item["eventId"])):
            event_id = state["eventId"]
            history = self._history.setdefault(event_id, [])
            if any(item["fingerprint"] == state["fingerprint"] for item in history):
                duplicates += 1; continue
            previous = history[-1] if history else None
            transition_warning = False
            if previous and previous["status"] != state["status"]:
                legal = state["status"] in LEGAL_TRANSITIONS.get(previous["status"], set())
                if not legal:
                    state = copy.deepcopy(state); state["warnings"] = [*state["warnings"], "invalid_transition"]
                    state["edgeTrust"] = _state_trust(state, state["sourceMode"])
                    invalid_transitions += 1; transition_warning = True
                self._transitions.append({
                    "id": f"mlb-live-transition-{event_id}-{state['fingerprint']}", "eventId": event_id,
                    "from": previous["status"], "to": state["status"], "occurredAt": state["providerUpdatedAt"],
                    "valid": not transition_warning, "source": state["source"], "sourceMode": state["sourceMode"],
                })
            if previous and self._is_correction(previous, state):
                corrections += 1
                self._corrections.append({
                    "id": f"mlb-live-correction-{event_id}-{state['fingerprint']}", "eventId": event_id,
                    "previousVersion": previous["version"], "correctedVersion": state["version"],
                    "previousState": self._public_state(previous), "correctedState": self._public_state(state),
                    "correctedAt": state["providerUpdatedAt"], "source": state["source"],
                    "savedSnapshotsChanged": False, "refreshableViewsInvalidated": True,
                })
                for callback in self.invalidation_callbacks:
                    callback(event_id)
            history.append(copy.deepcopy(state)); self._history[event_id] = history[-self.history_limit:]
            accepted += 1
        return {"accepted": accepted, "duplicates": duplicates, "invalidTransitions": invalid_transitions, "corrections": corrections}

    @staticmethod
    def _is_correction(previous: dict[str, Any], current: dict[str, Any]) -> bool:
        if previous["status"] == "final" and current["fingerprint"] != previous["fingerprint"]:
            return True
        old_score, new_score = previous.get("score"), current.get("score")
        return bool(old_score and new_score and (new_score["away"] < old_score["away"] or new_score["home"] < old_score["home"]))

    @staticmethod
    def _public_state(state: dict[str, Any]) -> dict[str, Any]:
        return {key: copy.deepcopy(value) for key, value in state.items() if not key.startswith("_")}

    def _result(self, normalized: dict[str, Any]) -> dict[str, Any]:
        current = [self._public_state(items[-1]) for items in self._history.values() if items]
        current.sort(key=lambda item: item["eventId"])
        sample = normalized["sourceMode"] in {"fixture", "sample"}
        conflicts = [item for item in self._transitions if not item["valid"]]
        trust = evaluate_edge_trust({
            "provider_validation": "sample" if sample else "passing",
            "event_reconciliation": "passing", "status_consistency": "partial" if conflicts else "passing",
            "freshness": "cached_stale" if any(item["freshness"]["state"] == "stale" for item in current) else "sample" if sample else "passing",
            "identity": "partial" if any(any("unresolved" in warning for warning in item["warnings"]) for item in current) else "passing",
            "coverage": "partial" if any(item["warnings"] for item in current) else "passing",
        }, applicable={"provider_validation", "event_reconciliation", "status_consistency", "freshness", "identity", "coverage"},
            conflicts=conflicts, sample=sample, last_validation=normalized["recordedAt"])
        return {
            "states": current, "transitions": copy.deepcopy(self._transitions[-200:]),
            "corrections": copy.deepcopy(self._corrections[-100:]), "rejected": normalized["rejected"],
            "source": {"provider": normalized["provider"], "mode": normalized["sourceMode"],
                       "sample": sample, "liveVerified": False, "lastUpdated": normalized["recordedAt"],
                       "attribution": normalized["attribution"],
                       "notice": "Deterministic MLB live-state fixture — not live provider data."},
            "edgeTrust": trust,
        }

    def state(self, event_id: str) -> dict[str, Any] | None:
        return next((item for item in self.read()["states"] if item["eventId"] == event_id), None)

    def history(self, event_id: str) -> dict[str, Any]:
        self.read()
        return {"eventId": event_id, "items": [self._public_state(item) for item in self._history.get(event_id, [])],
                "transitions": [copy.deepcopy(item) for item in self._transitions if item["eventId"] == event_id],
                "corrections": [copy.deepcopy(item) for item in self._corrections if item["eventId"] == event_id],
                "bounded": True, "maximumVersions": self.history_limit}

    def answer(self, event_id: str, question: str) -> dict[str, Any]:
        state = self.state(event_id)
        if state is None:
            return {"status": "unavailable", "answer": "No validated game state is available for this event.", "evidence": []}
        query = " ".join(str(question or "").casefold().split())
        value: Any = None
        label = "Game state"
        if "score" in query:
            label, value = "Score", self._score_label(state) or None
        elif "inning" in query:
            label, value = "Inning", self._period_label(state) or None
        elif "out" in query:
            label, value = "Outs", state.get("outs")
        elif "bat" in query:
            label, value = "Current batter", state.get("currentBatterId")
        elif "pitch" in query:
            label, value = "Current pitcher", state.get("currentPitcherId")
        elif "delay" in query:
            label, value = "Delay status", state["status"] if state["status"] == "delayed" else "not reported delayed"
        elif "resume" in query:
            label, value = "Resumption status", state["status"] if state["status"] in {"resumed", "in_progress"} else "not reported resumed"
        elif "final" in query:
            label, value = "Final status", "final" if state["status"] == "final" else "not final"
        elif "fresh" in query or "updated" in query:
            label, value = "Freshness", f"{state['freshness']['state']} · provider updated {state['providerUpdatedAt']}"
        elif "live" in query or "status" in query:
            label, value = "Status", state["status"]
        if value is None:
            answer = f"{label} is unavailable from the validated provider fields."
            status = "unavailable"
        else:
            answer = f"{label}: {value}."
            status = "supported"
        return {"status": status, "answer": answer, "evidence": [{"eventId": event_id,
            "version": state["version"], "providerUpdatedAt": state["providerUpdatedAt"],
            "source": state["source"], "sourceMode": state["sourceMode"]}],
            "edgeTrust": state["edgeTrust"], "disclosure": "Live-state facts are context, not betting confidence or win probability."}

    def enrich_game(self, game: dict[str, Any]) -> dict[str, Any]:
        return {**copy.deepcopy(game), "liveState": self.state(game["id"])}

    def enrich_entity(self, entity: dict[str, Any]) -> dict[str, Any]:
        data = self.read()
        if entity.get("type") == "athlete":
            states = [item for item in data["states"] if entity["id"] in {item.get("currentBatterId"), item.get("currentPitcherId")}]
        elif entity.get("type") == "team":
            games = {item["id"] for item in self.schedule_service.read()["games"]
                     if entity["id"] in {participant.get("id") for participant in item.get("participants", [])}}
            states = [item for item in data["states"] if item["eventId"] in games]
        else:
            states = []
        return {**copy.deepcopy(entity), "liveContext": {"states": copy.deepcopy(states),
            "source": data["source"], "edgeTrust": data["edgeTrust"]}}

    def _extend_provider_bundle(self, bundle: dict[str, Any], data: dict[str, Any]) -> None:
        by_event = {item["eventId"]: item for item in data["states"]}
        enriched_events = []
        for event in bundle.get("events", []):
            state = by_event.get(event.get("event_id"))
            if not state:
                enriched_events.append(event); continue
            public = copy.deepcopy(event)
            public["live_state"] = state
            public["status"] = state["status"] if state["freshness"]["state"] != "stale" else "stale"
            public["live"] = {
                "period": self._period_label(state), "score": self._score_label(state),
                "outs": state.get("outs"), "last_updated_at": state["providerUpdatedAt"],
                "connection_state": state["freshness"]["state"],
                "delay_seconds": state["freshness"]["providerDelaySeconds"],
                "source_mode": state["sourceMode"], "edge_trust": state["edgeTrust"],
            }
            enriched_events.append(public)
        bundle["events"] = enriched_events
        for offer in bundle.get("offers", []):
            state = by_event.get(offer.get("event_id"))
            if not state or state["status"] not in {"in_progress", "delayed", "suspended", "resumed", "final"}:
                continue
            for selection in offer.get("selections", []):
                selection["event_status"] = state["status"]
                selection["pregame_context_current"] = False
                selection["tracking_state"] = "event_started" if state["status"] in {"in_progress", "resumed"} else state["status"]
                selection["context_review_required"] = True
                selection["data_quality_warning"] = " ".join(filter(None, [selection.get("data_quality_warning"),
                    f"Game status is {state['status'].replace('_', ' ')}; the saved pregame price is retained only as a research snapshot."]))
        bundle["live_event_states"] = data["states"]
        bundle["live_state_events"] = self._meaningful_events(data)
        bundle.setdefault("provider_status", {})["mlb_live_polling"] = self.diagnostics()

    @staticmethod
    def _meaningful_events(data: dict[str, Any]) -> list[dict[str, Any]]:
        labels = {
            "in_progress": "game_started", "delayed": "game_delayed",
            "suspended": "game_suspended", "resumed": "game_resumed", "final": "game_final",
        }
        events = []
        for item in data.get("transitions", []):
            event_type = labels.get(item["to"])
            if not event_type or not item.get("valid"):
                continue
            events.append({"id": item["id"], "eventId": item["eventId"], "type": event_type,
                "previousStatus": item["from"], "currentStatus": item["to"],
                "occurredAt": item["occurredAt"], "source": item["source"],
                "sourceMode": item["sourceMode"], "verification": "validated_fixture" if item["sourceMode"] in {"fixture", "sample"} else "provider_validated",
                "summary": f"Game status changed from {item['from'].replace('_', ' ')} to {item['to'].replace('_', ' ')}.",
                "narrativeSignificance": "factual_transition", "bettingConfidence": None})
        return events

    @staticmethod
    def _period_label(state: dict[str, Any]) -> str:
        period = state.get("period")
        return f"{period['half'].title()} {period['inning']}" if period else ""

    @staticmethod
    def _score_label(state: dict[str, Any]) -> str:
        score = state.get("score")
        return f"{score['away']}–{score['home']}" if score else ""

    def configure_polling(self, *, enabled: bool, event_ids: list[str]) -> dict[str, Any]:
        if enabled and not 1 <= len(set(event_ids)) <= 3:
            raise ValidationError("Polling requires an allowlist of one to three MLB events.")
        schedule_ids = {item["id"] for item in self.schedule_service.read()["games"]}
        if any(event_id not in schedule_ids and not re.fullmatch(r"mlb-game-[0-9a-f]{16}", event_id) for event_id in event_ids):
            raise ValidationError("Polling allowlist contains an unknown MLB event.")
        self.polling_policy.enabled = bool(enabled)
        self._active_allowlist = set(event_ids) if enabled else set()
        self._poll_stopped_reason = "" if enabled else "kill_switch"
        return self.diagnostics()

    def poll_once(self, fetcher: Callable[[list[str]], dict[str, Any]], *, now: datetime | None = None) -> dict[str, Any]:
        if not self.polling_policy.enabled:
            return {"status": "stopped", "reason": "kill_switch", "requested": 0}
        states = {item["eventId"]: item for item in self.read(now=now)["states"]}
        eligible = sorted(event_id for event_id in self._active_allowlist if (
            event_id not in states and event_id.startswith("mlb-game-")
            or event_id in states and self.polling_policy.eligible(states[event_id], self._active_allowlist)
        ))
        if not eligible:
            self._poll_stopped_reason = "no_eligible_events"
            return {"status": "stopped", "reason": "no_eligible_events", "requested": 0}
        if self._budget_used >= self.polling_policy.request_budget:
            self._poll_stopped_reason = "request_budget_exhausted"
            return {"status": "stopped", "reason": "request_budget_exhausted", "requested": 0}
        if not self._poll_lock.acquire(blocking=False):
            self._coalesced_requests += 1
            return {"status": "coalesced", "requested": 0}
        try:
            self._budget_used += 1; self._provider_requests += 1
            payload = fetcher(eligible)
            normalized = self.adapter.normalize(payload, self._schedule_for_payload(payload), source_mode="sample", now=now)
            result = self._accept(normalized["states"])
            self.cache.invalidate(tag="domain:event_status")
            self._poll_failures = 0; self._last_provider_error = None
            self._last_successful_update = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
            return {"status": "accepted", "requested": len(eligible), **result, "rejected": len(normalized["rejected"])}
        except (ProviderAuthenticationError, ProviderEntitlementError) as error:
            self._poll_failures += 1; self.polling_policy.enabled = False
            self._poll_stopped_reason = "authentication_or_entitlement_failure"; self._last_provider_error = error.code
            return {"status": "stopped", "reason": self._poll_stopped_reason, "requested": len(eligible), "errorCode": error.code}
        except ProviderRateLimitError as error:
            self._poll_failures += 1; self._poll_stopped_reason = "rate_limited"; self._last_provider_error = error.code
            return {"status": "backoff", "reason": "rate_limited", "requested": len(eligible),
                    "retryAfterSeconds": error.retry_after or min(300, 2 ** self._poll_failures)}
        except ProviderError as error:
            self._poll_failures += 1; self._last_provider_error = error.code
            return {"status": "backoff", "reason": "provider_error", "requested": len(eligible),
                    "retryAfterSeconds": min(300, 2 ** self._poll_failures), "errorCode": error.code}
        finally:
            self._poll_lock.release()

    def run_shadow_validation(self, *, selected_date: str, event_ids: list[str] | None = None) -> dict[str, Any]:
        if self.rollout.get("mlb")["rolloutState"] != "shadow":
            raise ValidationError("MLB live-state validation requires shadow rollout state.")
        if self.shadow_validator is None:
            raise ValidationError("No MLB live-state shadow provider is configured.")
        candidate, endpoints, error = self.shadow_validator(selected_date=selected_date, event_ids=event_ids or [])
        if candidate is None:
            report = {"provider": "sportsdataio", "exposedAsPrimary": False, "endpoints": endpoints,
                      "normalization": {"accepted": False}, "errorCode": error.code if error else "provider_error",
                      "limitations": ["Unentitled or unavailable live state remains fixture-backed; no state is fabricated."]}
            self._last_shadow_report = report; return copy.deepcopy(report)
        normalized = self.adapter.normalize(candidate, self._schedule_for_payload(candidate), source_mode="sample")
        fixture = self.read()
        current_candidate = {"states": list({item["eventId"]: item for item in normalized["states"]}.values())}
        discrepancies = compare_mlb_live_shadow(fixture, current_candidate)
        self.shadow.record("mlb", "event_status", MLB_LIVE_STATE_FIXTURE_PROVIDER, normalized["provider"], discrepancies)
        report = {"provider": normalized["provider"], "exposedAsPrimary": False,
                  "candidateMode": "discovery_lab_shadow", "endpoints": endpoints,
                  "normalization": {"accepted": True, "states": len(normalized["states"]), "rejected": len(normalized["rejected"])},
                  "discrepancies": {"total": len(discrepancies), "categories": dict(Counter(item["category"] for item in discrepancies))},
                  "limitations": ["SportsDataIO Discovery Lab live state remains shadow-only and may be scrambled."]}
        self._last_shadow_report = copy.deepcopy(report); return report

    def _schedule_for_payload(self, payload: dict[str, Any]) -> dict[str, Any]:
        contract = payload.get("scheduleContract")
        if isinstance(contract, dict):
            from .mlb_schedule_entities import MlbScheduleEntityAdapter
            return MlbScheduleEntityAdapter().normalize(contract, source_mode="sample")
        return self.schedule_service.read()

    def poll_shadow_once(self, *, selected_date: str) -> dict[str, Any]:
        if self.shadow_validator is None:
            raise ValidationError("No MLB live-state shadow provider is configured.")
        def fetch(event_ids: list[str]) -> dict[str, Any]:
            candidate, _endpoints, error = self.shadow_validator(selected_date=selected_date, event_ids=event_ids)
            if candidate is None:
                raise error or ProviderValidationError("MLB live-state shadow candidate is unavailable.")
            return candidate
        return self.poll_once(fetch)

    def diagnostics(self) -> dict[str, Any]:
        states = [items[-1] for items in self._history.values() if items]
        provider = getattr(self.shadow_validator, "__self__", None) if self.shadow_validator else None
        return {
            "capabilities": ["event_status", "live_scores", "inning_state", "live_participants", "inning_linescore"],
            "activeEvents": sorted(self._active_allowlist),
            "currentlyPolledEvents": sorted(item["eventId"] for item in states if self.polling_policy.eligible(item, self._active_allowlist)),
            "pollIntervalsByState": dict(self.polling_policy.intervals),
            "requestBudget": {"limit": self.polling_policy.request_budget, "used": self._budget_used, "remaining": max(0, self.polling_policy.request_budget - self._budget_used)},
            "lastSuccessfulUpdate": self._last_successful_update, "lastProviderError": self._last_provider_error,
            "staleEvents": sorted(item["eventId"] for item in states if item["freshness"]["state"] == "stale"),
            "stateTransitionCount": len(self._transitions),
            "invalidTransitionCount": sum(not item["valid"] for item in self._transitions),
            "correctedStateCount": len(self._corrections),
            "unresolvedParticipantCount": sum(any("unresolved" in warning for warning in item["warnings"]) for item in states),
            "shadowDiscrepancies": copy.deepcopy((self._last_shadow_report or {}).get("discrepancies", {"total": 0, "categories": {}})),
            "cache": self.cache.diagnostics(), "providerRequests": self._provider_requests,
            "providerHealth": provider.health_status() if provider and hasattr(provider, "health_status") else {"state": "not_configured", "liveVerified": False},
            "coalescedRequests": self._coalesced_requests, "pollFailures": self._poll_failures,
            "killSwitchEnabled": not self.polling_policy.enabled, "stoppedReason": self._poll_stopped_reason,
            "backgroundLoopActive": False, "candidateExposedAsPrimary": False,
        }
