#!/usr/bin/env python3
"""Validate complete 30-team NBA Style v1 portrait and fallback coverage."""

from __future__ import annotations

import re
import sys
from pathlib import Path

from validate_illustration_style_proof import STYLE_VERSION, extract_json, parse_png


ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = ROOT / "src/config/basketball-illustration-showcase-batch-2.js"
REGISTRY_PATH = ROOT / "src/config/illustration-registry.js"
CANONICAL_PATH = ROOT / "src/data/canonical-entities.js"
MAX_BYTES = 5_000_000


def main() -> int:
    errors: list[str] = []
    slots = [slot for slot in extract_json(MANIFEST_PATH, "/* basketball-showcase-json-start */", "/* basketball-showcase-json-end */") if slot.get("leagueId") == "nba"]
    registry = extract_json(REGISTRY_PATH, "/* registry-json-start */", "/* registry-json-end */")
    registry_by_id = {entry.get("id"): entry for entry in registry}
    canonical_text = CANONICAL_PATH.read_text(encoding="utf-8")
    canonical_athletes = dict(re.findall(r'athlete\("([^"]+)",\s*"[^"]+",\s*"basketball",\s*"nba",\s*"([^"]+)"', canonical_text))
    canonical_teams = set(re.findall(r'team\("([^"]+)",\s*"[^"]+",\s*"basketball",\s*"nba"', canonical_text))
    athlete_ids = [slot.get("canonicalAthleteId") for slot in slots]
    team_ids = [slot.get("canonicalTeamId") for slot in slots]
    if len(slots) != 30 or len(set(athlete_ids)) != 30 or len(set(team_ids)) != 30:
        errors.append("NBA manifest must contain exactly 30 unique athlete and team assignments")
    if ("nba-tyrese-maxey", "PHI") not in set(zip(athlete_ids, team_ids)) or ("nba-trae-young", "NBA-WAS") not in set(zip(athlete_ids, team_ids)):
        errors.append("final Philadelphia or Washington representative assignment is incorrect")

    exact_paths: set[str] = set()
    fallback_count = 0
    for slot in slots:
        athlete_id, team_id = slot["canonicalAthleteId"], slot["canonicalTeamId"]
        if canonical_athletes.get(athlete_id) != team_id or team_id not in canonical_teams:
            errors.append(f"{athlete_id}: canonical athlete/team mapping is missing or inconsistent")
        exact = [entry for entry in registry if entry.get("canonicalEntityId") == athlete_id and entry.get("variant") == "portrait" and entry.get("status") == "active"]
        if len(exact) != 1:
            errors.append(f"{athlete_id}: expected exactly one active portrait")
            continue
        entry = exact[0]
        expected_path = "assets/illustrations/proof/edgeboard--nba-stephen-curry--portrait--v01.png" if athlete_id == "nba-stephen-curry" else f"assets/illustrations/nba/edgeboard--{athlete_id}--portrait--v01.png"
        if entry.get("assetPath") != expected_path or expected_path in exact_paths:
            errors.append(f"{athlete_id}: portrait path is wrong or duplicated")
        exact_paths.add(expected_path)
        if entry.get("styleVersion") != STYLE_VERSION:
            errors.append(f"{athlete_id}: portrait style version is invalid")
        if athlete_id != "nba-stephen-curry" and entry.get("styleRole") != "showcase_production_portrait":
            errors.append(f"{athlete_id}: production style role is invalid")
        asset = ROOT / expected_path
        if not asset.is_file():
            errors.append(f"{athlete_id}: physical portrait is missing")
        else:
            png_errors, metadata = parse_png(asset)
            errors.extend(f"{athlete_id}: {error}" for error in png_errors)
            if (metadata.get("width"), metadata.get("height")) != (640, 800) or not all(metadata.get(key) for key in ("rgba", "decoded", "meaningfulTransparency")):
                errors.append(f"{athlete_id}: portrait is not 640x800 decoded meaningful-alpha RGBA")
            if asset.stat().st_size > MAX_BYTES:
                errors.append(f"{athlete_id}: portrait exceeds the configured production size gate")
        fallback = registry_by_id.get(f"art-team-{team_id.lower()}")
        if fallback and fallback.get("status") == "active" and fallback.get("fallbackGroup") == f"team:{team_id}":
            fallback_count += 1
        else:
            errors.append(f"{athlete_id}: active team fallback is missing")

    active_nba = {entry.get("canonicalEntityId") for entry in registry if entry.get("entityType") == "athlete" and entry.get("league") == "nba" and entry.get("variant") == "portrait" and entry.get("status") == "active"}
    if active_nba != set(athlete_ids):
        errors.append("active NBA portrait registry must exactly match the 30-team showcase manifest")
    if "nba-lebron-james" in active_nba:
        errors.append("LeBron James must not have an active showcase portrait after the curated representative replacement")
    for fallback_id in ("art-generic-basketball", "art-placeholder-neutral"):
        if registry_by_id.get(fallback_id, {}).get("status") != "active":
            errors.append(f"shared fallback is missing or inactive: {fallback_id}")

    print("EdgeBoard NBA Illustration Completion Validator")
    print(f"Canonical assignments: {len(set(athlete_ids))}/30 athletes · {len(set(team_ids))}/30 teams")
    print(f"Exact active portraits: {len(exact_paths)}/30 · fallback covered: {fallback_count}/30")
    print(f"Style: {STYLE_VERSION} · portrait mode: standard")
    print("Validation:")
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1
    print("PASS · NBA Illustration Showcase is complete at 30/30 exact portraits and 30/30 fallback coverage")
    return 0


if __name__ == "__main__":
    sys.exit(main())
