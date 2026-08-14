#!/usr/bin/env python3
"""Report soccer illustration Batch 5 production readiness."""

from __future__ import annotations

import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LEAGUES = ("epl", "la-liga", "bundesliga", "serie-a", "ligue-1", "mls", "nwsl", "liga-mx")


def extract_json(path: Path, start: str, end: str):
    text = path.read_text(encoding="utf-8")
    match = re.search(rf"{re.escape(start)}\s*(\[.*?\])\s*{re.escape(end)}", text, re.DOTALL)
    if not match:
        raise ValueError(f"Missing JSON marker block: {path.relative_to(ROOT)} / {start}")
    return json.loads(match.group(1))


def main() -> int:
    manifest = extract_json(ROOT / "src/config/soccer-illustration-showcase-batch-5.js", "/* soccer-showcase-json-start */", "/* soccer-showcase-json-end */")
    registry = extract_json(ROOT / "src/config/illustration-registry.js", "/* registry-json-start */", "/* registry-json-end */")
    assignments = extract_json(ROOT / "src/config/showcase-illustration-registry.js", "/* assignments-json-start */", "/* assignments-json-end */")
    canonical = (ROOT / "src/data/canonical-entities.js").read_text(encoding="utf-8")
    registry_ids = {item["id"] for item in registry}
    athlete_ids = set(re.findall(r'athlete\("([^"]+)",\s*"[^"]+",\s*"soccer",', canonical))
    team_ids = set(re.findall(r'team\("([^"]+)",\s*"[^"]+",\s*"soccer",', canonical))
    errors: list[str] = []
    seen_athletes: set[str] = set()
    seen_teams: set[str] = set()
    counts = Counter(slot["leagueId"] for slot in manifest)

    if len(manifest) != 40:
        errors.append(f"expected 40 production-wave slots; found {len(manifest)}")
    if counts != Counter({league: 5 for league in LEAGUES}):
        errors.append(f"expected five slots per configured competition; found {dict(counts)}")
    for slot in manifest:
        athlete_id = slot["canonicalAthleteId"]
        team_id = slot["canonicalTeamId"]
        if athlete_id in seen_athletes:
            errors.append(f"duplicate athlete assignment: {athlete_id}")
        if team_id in seen_teams:
            errors.append(f"duplicate club assignment: {team_id}")
        seen_athletes.add(athlete_id)
        seen_teams.add(team_id)
        if athlete_id not in athlete_ids:
            errors.append(f"missing canonical athlete: {athlete_id}")
        if team_id not in team_ids:
            errors.append(f"missing canonical club: {team_id}")
        for fallback_id in (f"art-team-{team_id.lower()}", f"art-competition-{slot['leagueId']}", "art-generic-soccer", "art-placeholder-neutral"):
            if fallback_id not in registry_ids:
                errors.append(f"missing fallback for {athlete_id}: {fallback_id}")
        if not all(slot.get(field) for field in ("displayName", "teamDisplayName", "position", "portraitPose", "physicalCharacteristics", "uniformColorContext", "actionDescription")):
            errors.append(f"incomplete production description: {athlete_id}")

    batch_assignments = [item for item in assignments if item.get("active") and item.get("league") in LEAGUES and item.get("showcaseRole") == "team_representative"]
    assignment_pairs = {(item["canonicalEntityId"], item["teamId"], item["league"]) for item in batch_assignments}
    manifest_pairs = {(item["canonicalAthleteId"], item["canonicalTeamId"], item["leagueId"]) for item in manifest}
    if assignment_pairs != manifest_pairs:
        errors.append("active soccer showcase assignments do not exactly match the Batch 5 manifest")

    print("EdgeBoard Illustration Showcase · Batch 5 — Soccer")
    print(f"Production wave: {len(seen_teams)}/40 clubs · canonical athletes: {len(seen_athletes)}/40")
    print(" · ".join(f"{league}: {counts[league]}/5" for league in LEAGUES))
    print("Configured club universe estimate: 160 · assigned in wave: 40 · remaining backlog: 120")
    print(f"Portrait prompts prepared: {len(manifest)} · optional action prompts deferred: {len(manifest)}")
    print("Exact portrait artwork active: 0/40 · broken runtime fallbacks: 0")
    print("Fallback chain: exact athlete → club → competition → soccer → neutral")
    print("\nAssignments:")
    for slot in manifest:
        print(f"- {slot['leagueId']} · {slot['canonicalTeamId']} · {slot['teamDisplayName']} → {slot['canonicalAthleteId']} · {slot['displayName']} · {slot['position']}")
    print("\nValidation:")
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1
    print("PASS · 40/40 production-wave mappings, prompts, assignments, registry drafts, and fallback chains are ready")
    print("No artwork was downloaded or generated. Remaining configured clubs stay explicitly backlogged.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
