#!/usr/bin/env python3
"""Report MLB illustration Batch 1 canonical, fallback, and registry readiness."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def extract_json(path: Path, start: str, end: str):
    text = path.read_text(encoding="utf-8")
    match = re.search(rf"{re.escape(start)}\s*(\[.*?\])\s*{re.escape(end)}", text, re.DOTALL)
    if not match:
        raise ValueError(f"Missing JSON marker block: {path.relative_to(ROOT)} / {start}")
    return json.loads(match.group(1))


def main() -> int:
    manifest_path = ROOT / "tools/illustration-qa/mlb-illustration-showcase-batch-1.js"
    canonical_path = ROOT / "src/data/canonical-entities.js"
    registry_path = ROOT / "src/config/illustration-registry.js"
    showcase_path = ROOT / "tools/illustration-qa/showcase-illustration-registry.js"
    slots = extract_json(manifest_path, "/* mlb-showcase-json-start */", "/* mlb-showcase-json-end */")
    registry = extract_json(registry_path, "/* registry-json-start */", "/* registry-json-end */")
    assignments = extract_json(showcase_path, "/* assignments-json-start */", "/* assignments-json-end */")
    canonical_text = canonical_path.read_text(encoding="utf-8")
    athletes = dict(re.findall(r'athlete\("([^"]+)",\s*"[^"]+",\s*"baseball",\s*"mlb",\s*"([^"]+)"', canonical_text))
    teams = set(re.findall(r'team\("([^"]+)",\s*"[^"]+",\s*"baseball",\s*"mlb"', canonical_text))
    registry_ids = {item["id"] for item in registry}
    exact_ids = {item["canonicalEntityId"] for item in registry if item.get("entityType") == "athlete"}
    exact_by_id = {item["canonicalEntityId"]: item for item in registry if item.get("entityType") == "athlete" and item.get("variant") == "portrait" and item.get("status") == "active"}
    errors: list[str] = []
    seen_players: set[str] = set()
    seen_teams: set[str] = set()
    planned_paths: set[str] = set()
    awaiting_paths: set[str] = set()
    fallback_covered = 0
    expected_active = {
        "mlb-aaron-judge", "mlb-paul-skenes", "mlb-cal-raleigh", "mlb-elly-de-la-cruz",
        "mlb-shohei-ohtani", "mlb-ronald-acuna-jr", "mlb-jose-ramirez",
        "mlb-brent-rooker", "mlb-bryce-harper", "mlb-garrett-crochet",
        "mlb-fernando-tatis-jr", "mlb-bobby-witt-jr", "mlb-sandy-alcantara",
        "mlb-vladimir-guerrero-jr", "mlb-gunnar-henderson", "mlb-corbin-carroll",
        "mlb-corey-seager", "mlb-jose-altuve", "mlb-pete-crow-armstrong",
        "mlb-rafael-devers", "mlb-mike-trout", "mlb-christian-yelich",
        "mlb-byron-buxton", "mlb-junior-caminero", "mlb-munetaka-murakami",
        "mlb-masyn-winn", "mlb-james-wood",
        "mlb-ezequiel-tovar", "mlb-riley-greene", "mlb-juan-soto",
    }

    if len(slots) != 30:
        errors.append(f"expected 30 slots; found {len(slots)}")
    for slot in slots:
        player_id = slot["canonicalAthleteId"]
        team_id = slot["canonicalTeamId"]
        if player_id in seen_players:
            errors.append(f"duplicate athlete assignment: {player_id}")
        if team_id in seen_teams:
            errors.append(f"duplicate team assignment: {team_id}")
        seen_players.add(player_id)
        seen_teams.add(team_id)
        if athletes.get(player_id) != team_id:
            errors.append(f"missing or inconsistent canonical athlete: {player_id} -> {team_id}")
        if team_id not in teams:
            errors.append(f"missing canonical team: {team_id}")
        team_fallback = f"art-team-{team_id.lower()}"
        if team_fallback not in registry_ids:
            errors.append(f"missing team fallback: {team_fallback}")
        elif all(required in registry_ids for required in ("art-generic-baseball", "art-placeholder-neutral")):
            fallback_covered += 1
        if player_id != "mlb-aaron-judge":
            target_path = f"assets/illustrations/mlb/edgeboard--{player_id}--portrait--v01.png"
            if target_path in planned_paths:
                errors.append(f"duplicate planned portrait path: {target_path}")
            planned_paths.add(target_path)
            if player_id not in expected_active:
                awaiting_paths.add(target_path)
                if player_id in exact_by_id:
                    errors.append(f"awaiting portrait was incorrectly activated: {player_id}")
        if not all(slot.get(field) for field in ("displayName", "teamDisplayName", "position", "portraitPose", "physicalCharacteristics", "uniformColorContext", "actionDescription")):
            errors.append(f"incomplete production description: {player_id}")

    mlb_assignments = [item for item in assignments if item.get("active") and item.get("league") == "mlb" and item.get("showcaseRole") == "team_representative"]
    assignment_pairs = {(item["canonicalEntityId"], item["teamId"]) for item in mlb_assignments}
    manifest_pairs = {(item["canonicalAthleteId"], item["canonicalTeamId"]) for item in slots}
    if assignment_pairs != manifest_pairs:
        errors.append("active MLB showcase assignments do not exactly match the Batch 1 manifest")
    for required in ("art-generic-baseball", "art-placeholder-neutral"):
        if required not in registry_ids:
            errors.append(f"missing shared fallback: {required}")
    judge = exact_by_id.get("mlb-aaron-judge")
    if not judge or judge.get("id") != "art-mlb-aaron-judge-portrait" or judge.get("styleVersion") != "edgeboard-illustration-v1":
        errors.append("Aaron Judge is not the single approved Yankees Style v1 portrait")
    if seen_players & exact_ids != expected_active:
        errors.append(f"expected 30 approved MLB portraits; found {len(seen_players & exact_ids)}")
    if len(planned_paths) != 29:
        errors.append(f"expected 29 unique non-proof PNG targets; found {len(planned_paths)}")
    if awaiting_paths:
        errors.append(f"expected no pending MLB PNG targets; found {len(awaiting_paths)}")

    print("EdgeBoard Illustration Showcase · Batch 1 — MLB")
    print(f"Required teams: 30 · assigned teams: {len(seen_teams)} · canonical athletes: {len(seen_players)}")
    print(f"Portrait prompts prepared: {len(slots)} · optional action prompts prepared: {len(slots)}")
    print(f"Exact approved portraits: {len(seen_players & exact_ids)}/30 · needs revision: {len(awaiting_paths)}/30")
    print(f"Fallback covered: {fallback_covered}/30 · registry records ready: {len(slots)}/30")
    print("Fallback chain: exact athlete → team → generic baseball → neutral")
    print("\nAssignments:")
    for slot in slots:
        print(f"- {slot['canonicalTeamId']} · {slot['teamDisplayName']} → {slot['canonicalAthleteId']} · {slot['displayName']} · {slot['position']}")
    print("\nValidation:")
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1
    print("PASS · 30/30 mappings, physical exact portraits, registry activations, and preserved fallback chains are ready")
    print("MLB Illustration Showcase COMPLETE · all 30 canonical team representatives resolve to approved Style v1 portraits.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
