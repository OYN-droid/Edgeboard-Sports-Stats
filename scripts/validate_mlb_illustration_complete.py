#!/usr/bin/env python3
"""Validate complete 30-team MLB Style v1 portrait and fallback coverage."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from validate_illustration_style_proof import STYLE_VERSION, extract_json, parse_png


ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = ROOT / "tools/illustration-qa/mlb-illustration-showcase-batch-1.js"
REGISTRY_PATH = ROOT / "src/config/illustration-registry.js"
CANONICAL_PATH = ROOT / "src/data/canonical-entities.js"
MAX_BYTES = 5_000_000


def main() -> int:
    errors: list[str] = []
    slots = extract_json(MANIFEST_PATH, "/* mlb-showcase-json-start */", "/* mlb-showcase-json-end */")
    registry = extract_json(REGISTRY_PATH, "/* registry-json-start */", "/* registry-json-end */")
    registry_by_id = {entry.get("id"): entry for entry in registry}
    canonical_text = CANONICAL_PATH.read_text(encoding="utf-8")
    canonical_athletes = dict(re.findall(r'athlete\("([^"]+)",\s*"[^"]+",\s*"baseball",\s*"mlb",\s*"([^"]+)"', canonical_text))
    canonical_teams = set(re.findall(r'team\("([^"]+)",\s*"[^"]+",\s*"baseball",\s*"mlb"', canonical_text))

    athlete_ids = [slot.get("canonicalAthleteId") for slot in slots]
    team_ids = [slot.get("canonicalTeamId") for slot in slots]
    if len(slots) != 30 or len(set(athlete_ids)) != 30 or len(set(team_ids)) != 30:
        errors.append("MLB manifest must contain exactly 30 unique athlete and team assignments")
    if 'portraitMode: "standard"' not in MANIFEST_PATH.read_text(encoding="utf-8"):
        errors.append("MLB production manifest does not retain standard portrait mode")

    exact_paths: set[str] = set()
    fallback_count = 0
    for slot in slots:
        athlete_id = slot["canonicalAthleteId"]
        team_id = slot["canonicalTeamId"]
        if canonical_athletes.get(athlete_id) != team_id or team_id not in canonical_teams:
            errors.append(f"{athlete_id}: canonical athlete/team mapping is missing or inconsistent")

        exact = [
            entry for entry in registry
            if entry.get("canonicalEntityId") == athlete_id
            and entry.get("variant") == "portrait"
            and entry.get("status") == "active"
        ]
        if len(exact) != 1:
            errors.append(f"{athlete_id}: expected exactly one active portrait")
            continue
        entry = exact[0]
        expected_path = (
            "assets/illustrations/proof/edgeboard--mlb-aaron-judge--portrait--v01.png"
            if athlete_id == "mlb-aaron-judge"
            else f"assets/illustrations/mlb/edgeboard--{athlete_id}--portrait--v01.png"
        )
        delivery_path = Path(expected_path).with_suffix(".webp").as_posix()
        if entry.get("assetPath") != delivery_path or delivery_path in exact_paths:
            errors.append(f"{athlete_id}: portrait path is wrong or duplicated")
        exact_paths.add(delivery_path)
        if entry.get("styleVersion") != STYLE_VERSION:
            errors.append(f"{athlete_id}: portrait is not assigned to {STYLE_VERSION}")
        if athlete_id != "mlb-aaron-judge" and entry.get("styleRole") != "showcase_production_portrait":
            errors.append(f"{athlete_id}: production style role is invalid")

        asset = ROOT / expected_path
        if not asset.is_file():
            errors.append(f"{athlete_id}: physical portrait is missing")
        else:
            png_errors, metadata = parse_png(asset)
            if png_errors:
                errors.extend(f"{athlete_id}: {error}" for error in png_errors)
            if (metadata.get("width"), metadata.get("height")) != (640, 800):
                errors.append(f"{athlete_id}: portrait dimensions are not 640x800")
            if not all(metadata.get(key) for key in ("rgba", "decoded", "meaningfulTransparency")):
                errors.append(f"{athlete_id}: portrait is not decoded meaningful-alpha RGBA")
            if asset.stat().st_size > MAX_BYTES:
                errors.append(f"{athlete_id}: portrait exceeds the configured production size gate")

        fallback_id = f"art-team-{team_id.lower()}"
        fallback = registry_by_id.get(fallback_id)
        if fallback and fallback.get("status") == "active" and fallback.get("fallbackGroup") == f"team:{team_id}":
            fallback_count += 1
        else:
            errors.append(f"{athlete_id}: active team fallback is missing")

    for fallback_id in ("art-generic-baseball", "art-placeholder-neutral"):
        if registry_by_id.get(fallback_id, {}).get("status") != "active":
            errors.append(f"shared fallback is missing or inactive: {fallback_id}")

    print("EdgeBoard MLB Illustration Completion Validator")
    print(f"Canonical assignments: {len(set(athlete_ids))}/30 athletes · {len(set(team_ids))}/30 teams")
    print(f"Exact active portraits: {len(exact_paths)}/30 · fallback covered: {fallback_count}/30")
    print(f"Style: {STYLE_VERSION} · portrait mode: standard")
    print("Validation:")
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1
    print("PASS · MLB Illustration Showcase is complete at 30/30 exact portraits and 30/30 fallback coverage")
    return 0


if __name__ == "__main__":
    sys.exit(main())
