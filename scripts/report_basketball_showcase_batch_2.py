#!/usr/bin/env python3
"""Report NBA and WNBA illustration Batch 2 production readiness."""

from __future__ import annotations

import json
import re
import sys
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def extract_json(path: Path, start: str, end: str):
    text = path.read_text(encoding="utf-8")
    match = re.search(rf"{re.escape(start)}\s*(\[.*?\])\s*{re.escape(end)}", text, re.DOTALL)
    if not match:
        raise ValueError(f"Missing JSON marker block: {path.relative_to(ROOT)} / {start}")
    return json.loads(match.group(1))


def main() -> int:
    manifest_path = ROOT / "tools/illustration-qa/basketball-illustration-showcase-batch-2.js"
    canonical_path = ROOT / "src/data/canonical-entities.js"
    registry_path = ROOT / "src/config/illustration-registry.js"
    showcase_path = ROOT / "tools/illustration-qa/showcase-illustration-registry.js"
    slots = extract_json(manifest_path, "/* basketball-showcase-json-start */", "/* basketball-showcase-json-end */")
    registry = extract_json(registry_path, "/* registry-json-start */", "/* registry-json-end */")
    assignments = extract_json(showcase_path, "/* assignments-json-start */", "/* assignments-json-end */")
    targets = extract_json(showcase_path, "/* targets-json-start */", "/* targets-json-end */")
    canonical_text = canonical_path.read_text(encoding="utf-8")
    athletes = {
        athlete_id: (league_id, team_id)
        for athlete_id, league_id, team_id in re.findall(
            r'athlete\("([^"]+)",\s*"[^"]+",\s*"basketball",\s*"(nba|wnba)",\s*"([^"]+)"', canonical_text
        )
    }
    teams = {
        team_id: league_id
        for team_id, league_id in re.findall(
            r'team\("([^"]+)",\s*"[^"]+",\s*"basketball",\s*"(nba|wnba)"', canonical_text
        )
    }
    registry_ids = {item["id"] for item in registry}
    exact_ids = {item["canonicalEntityId"] for item in registry if item.get("entityType") == "athlete" and item.get("status") == "active"}
    errors: list[str] = []
    seen_players: set[str] = set()
    seen_teams: set[str] = set()
    league_counts = Counter(slot["leagueId"] for slot in slots)

    if len(slots) != 45:
        errors.append(f"expected 45 slots; found {len(slots)}")
    if league_counts != Counter({"nba": 30, "wnba": 15}):
        errors.append(f"expected NBA 30 and WNBA 15; found {dict(league_counts)}")
    for slot in slots:
        player_id = slot["canonicalAthleteId"]
        team_id = slot["canonicalTeamId"]
        league_id = slot["leagueId"]
        if player_id in seen_players:
            errors.append(f"duplicate athlete assignment: {player_id}")
        if team_id in seen_teams:
            errors.append(f"duplicate team assignment: {team_id}")
        seen_players.add(player_id)
        seen_teams.add(team_id)
        if athletes.get(player_id) != (league_id, team_id):
            errors.append(f"missing or inconsistent canonical athlete: {player_id} -> {team_id}")
        if teams.get(team_id) != league_id:
            errors.append(f"missing or inconsistent canonical team: {team_id}")
        team_fallback = f"art-team-{team_id.lower()}"
        if team_fallback not in registry_ids:
            errors.append(f"missing team fallback: {team_fallback}")
        fields = ("displayName", "teamDisplayName", "position", "portraitPose", "physicalCharacteristics", "uniformColorContext", "actionDescription")
        if not all(slot.get(field) for field in fields):
            errors.append(f"incomplete production description: {player_id}")

    basketball_assignments = [item for item in assignments if item.get("active") and item.get("league") in ("nba", "wnba") and item.get("showcaseRole") == "team_representative"]
    assignment_pairs = {(item["canonicalEntityId"], item["teamId"], item["league"]) for item in basketball_assignments}
    manifest_pairs = {(item["canonicalAthleteId"], item["canonicalTeamId"], item["leagueId"]) for item in slots}
    if assignment_pairs != manifest_pairs:
        errors.append("active basketball showcase assignments do not exactly match the Batch 2 manifest")
    target_counts = {item["league"]: item["requiredCount"] for item in targets if item["id"] in ("nba-teams", "wnba-teams")}
    if target_counts != {"nba": 30, "wnba": 15}:
        errors.append(f"coverage targets are stale: {target_counts}")
    for required in ("art-generic-basketball", "art-placeholder-neutral"):
        if required not in registry_ids:
            errors.append(f"missing shared fallback: {required}")

    print("EdgeBoard Illustration Showcase · Batch 2 — Basketball")
    print(f"Required teams: 45 · assigned teams: {len(seen_teams)} · canonical athletes: {len(seen_players)}")
    print(f"NBA: {league_counts['nba']}/30 · WNBA: {league_counts['wnba']}/15")
    print(f"Portrait prompts prepared: {len(slots)} · optional actions deferred: {len(slots)}")
    print(f"Exact portrait artwork active: {len(seen_players & exact_ids)}/45")
    print(f"Registry entries ready: {len(slots)}/45")
    print("Fallback chain: exact athlete → team → generic basketball → neutral")
    print("\nAssignments:")
    for slot in slots:
        print(f"- {slot['leagueId'].upper()} · {slot['canonicalTeamId']} · {slot['teamDisplayName']} → {slot['canonicalAthleteId']} · {slot['displayName']} · {slot['position']}")
    print("\nValidation:")
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1
    print("PASS · 45/45 mappings, assignments, portrait descriptions, registry rows, and fallback chains are ready")
    print("Action production remains deferred until portrait coverage is complete; planned portraits remain inactive until reviewed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
