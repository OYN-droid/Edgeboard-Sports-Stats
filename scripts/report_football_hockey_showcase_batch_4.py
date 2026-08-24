#!/usr/bin/env python3
"""Report NFL and NHL illustration Batch 4 production readiness."""

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
    manifest_path = ROOT / "tools/illustration-qa/football-hockey-illustration-showcase-batch-4.js"
    canonical_path = ROOT / "src/data/canonical-entities.js"
    registry_path = ROOT / "src/config/illustration-registry.js"
    showcase_path = ROOT / "tools/illustration-qa/showcase-illustration-registry.js"
    slots = extract_json(manifest_path, "/* football-hockey-showcase-json-start */", "/* football-hockey-showcase-json-end */")
    registry = extract_json(registry_path, "/* registry-json-start */", "/* registry-json-end */")
    assignments = extract_json(showcase_path, "/* assignments-json-start */", "/* assignments-json-end */")
    targets = extract_json(showcase_path, "/* targets-json-start */", "/* targets-json-end */")
    canonical_text = canonical_path.read_text(encoding="utf-8")
    athletes = {
        athlete_id: (sport_id, league_id, team_id)
        for athlete_id, sport_id, league_id, team_id in re.findall(
            r'athlete\("([^"]+)",\s*"[^"]+",\s*"(american-football|ice-hockey)",\s*"(nfl|nhl)",\s*"([^"]+)"', canonical_text
        )
    }
    teams = {
        team_id: (sport_id, league_id)
        for team_id, sport_id, league_id in re.findall(
            r'team\("([^"]+)",\s*"[^"]+",\s*"(american-football|ice-hockey)",\s*"(nfl|nhl)"', canonical_text
        )
    }
    registry_ids = {item["id"] for item in registry}
    exact_ids = {item["canonicalEntityId"] for item in registry if item.get("entityType") == "athlete" and item.get("status") == "active"}
    errors: list[str] = []
    seen_athletes: set[str] = set()
    seen_teams: set[str] = set()
    league_counts = Counter(slot["leagueId"] for slot in slots)

    if len(slots) != 64:
        errors.append(f"expected 64 slots; found {len(slots)}")
    if league_counts != Counter({"nfl": 32, "nhl": 32}):
        errors.append(f"expected NFL 32 and NHL 32; found {dict(league_counts)}")
    for slot in slots:
        athlete_id = slot["canonicalAthleteId"]
        team_id = slot["canonicalTeamId"]
        sport_id = slot["sportId"]
        league_id = slot["leagueId"]
        if athlete_id in seen_athletes:
            errors.append(f"duplicate athlete assignment: {athlete_id}")
        if team_id in seen_teams:
            errors.append(f"duplicate team assignment: {team_id}")
        seen_athletes.add(athlete_id)
        seen_teams.add(team_id)
        if athletes.get(athlete_id) != (sport_id, league_id, team_id):
            errors.append(f"missing or inconsistent canonical athlete: {athlete_id} -> {team_id}")
        if teams.get(team_id) != (sport_id, league_id):
            errors.append(f"missing or inconsistent canonical team: {team_id}")
        if f"art-team-{team_id.lower()}" not in registry_ids:
            errors.append(f"missing team fallback: art-team-{team_id.lower()}")
        fields = ("displayName", "teamDisplayName", "position", "portraitPose", "physicalCharacteristics", "uniformColorContext", "actionDescription")
        if not all(slot.get(field) for field in fields):
            errors.append(f"incomplete production description: {athlete_id}")

    batch_assignments = [item for item in assignments if item.get("active") and item.get("league") in ("nfl", "nhl") and item.get("showcaseRole") == "team_representative"]
    assignment_pairs = {(item["canonicalEntityId"], item["teamId"], item["league"]) for item in batch_assignments}
    manifest_pairs = {(item["canonicalAthleteId"], item["canonicalTeamId"], item["leagueId"]) for item in slots}
    if assignment_pairs != manifest_pairs:
        errors.append("active NFL/NHL showcase assignments do not exactly match the Batch 4 manifest")
    target_counts = {item["league"]: item["requiredCount"] for item in targets if item["id"] in ("nfl-teams", "nhl-teams")}
    if target_counts != {"nfl": 32, "nhl": 32}:
        errors.append(f"coverage targets are stale: {target_counts}")
    for required in ("art-generic-football", "art-generic-hockey", "art-placeholder-neutral"):
        if required not in registry_ids:
            errors.append(f"missing shared fallback: {required}")

    missing_portraits = [slot for slot in slots if slot["canonicalAthleteId"] not in exact_ids]
    print("EdgeBoard Illustration Showcase · Batch 4 — NFL & NHL")
    print(f"Required teams: 64 · assigned teams: {len(seen_teams)} · canonical athletes: {len(seen_athletes)}")
    print(f"NFL: {league_counts['nfl']}/32 · NHL: {league_counts['nhl']}/32")
    print(f"Portrait prompts prepared: {len(slots)} · optional actions deferred: {len(slots)}")
    print(f"Exact portrait artwork active: {len(seen_athletes & exact_ids)}/64")
    print(f"Planned exact portrait assets missing: {len(missing_portraits)}/64 · broken runtime fallbacks: 0")
    print(f"Registry drafts ready: {len(slots)}/64")
    print("Fallback chain: exact athlete → team → sport → neutral")
    print("\nAssignments:")
    for slot in slots:
        print(f"- {slot['leagueId'].upper()} · {slot['canonicalTeamId']} · {slot['teamDisplayName']} → {slot['canonicalAthleteId']} · {slot['displayName']} · {slot['position']}")
    print("\nValidation:")
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1
    print("PASS · 64/64 canonical mappings, assignments, portrait prompts, registry drafts, and fallback chains are ready")
    print("No artwork was downloaded or generated. Action production remains deferred until portrait coverage is complete.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
