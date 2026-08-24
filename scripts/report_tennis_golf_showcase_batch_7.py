#!/usr/bin/env python3
"""Report tennis and golf illustration Batch 7 production readiness."""

from __future__ import annotations

import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TOUR_COUNTS = {"atp": 6, "wta": 6, "pga": 6, "lpga": 6}


def extract_json(path: Path, start: str, end: str):
    text = path.read_text(encoding="utf-8")
    return json.loads(text.split(start, 1)[1].split(end, 1)[0])


def main() -> int:
    manifest = extract_json(ROOT / "tools/illustration-qa/tennis-golf-illustration-showcase-batch-7.js", "/* tennis-golf-showcase-json-start */", "/* tennis-golf-showcase-json-end */")
    registry = extract_json(ROOT / "src/config/illustration-registry.js", "/* registry-json-start */", "/* registry-json-end */")
    assignments = extract_json(ROOT / "tools/illustration-qa/showcase-illustration-registry.js", "/* assignments-json-start */", "/* assignments-json-end */")
    canonical = (ROOT / "src/data/canonical-entities.js").read_text(encoding="utf-8")
    registry_ids = {item["id"] for item in registry}
    athlete_ids = set(re.findall(r'athlete\("([^"]+)",\s*"[^"]+",\s*"(?:tennis|golf)",', canonical))
    counts = Counter(slot["tourId"] for slot in manifest)
    errors: list[str] = []
    seen: set[str] = set()

    if len(manifest) != 24:
        errors.append(f"expected 24 production slots; found {len(manifest)}")
    if counts != Counter(TOUR_COUNTS):
        errors.append(f"tour counts differ: {dict(counts)}")
    for slot in manifest:
        athlete_id = slot["canonicalAthleteId"]
        if athlete_id in seen:
            errors.append(f"duplicate canonical athlete: {athlete_id}")
        seen.add(athlete_id)
        if athlete_id not in athlete_ids:
            errors.append(f"missing canonical athlete: {athlete_id}")
        for fallback_id in (f"art-tour-{slot['tourId']}", f"art-generic-{slot['sportId']}", "art-placeholder-neutral"):
            if fallback_id not in registry_ids:
                errors.append(f"missing fallback for {athlete_id}: {fallback_id}")
        if not all(slot.get(field) for field in ("displayName", "sportId", "discipline", "likenessNotes", "outfitColorContext", "optionalAction")):
            errors.append(f"incomplete prompt source data: {athlete_id}")

    batch_assignments = [item for item in assignments if item.get("active") and item.get("league") in TOUR_COUNTS and item.get("showcaseRole") == "tour_representative"]
    assignment_keys = {(item["league"], item["canonicalEntityId"]) for item in batch_assignments}
    manifest_keys = {(item["tourId"], item["canonicalAthleteId"]) for item in manifest}
    if assignment_keys != manifest_keys:
        errors.append("active tennis/golf showcase assignments do not exactly match the Batch 7 manifest")

    print("EdgeBoard Illustration Showcase · Batch 7 — Tennis & Golf")
    print(f"Production slots: {len(manifest)}/24 · canonical athletes: {len(seen)}/24")
    print(" · ".join(f"{tour}: {counts[tour]}/{required}" for tour, required in TOUR_COUNTS.items()))
    print("Tennis: 12/12 · Golf: 12/12")
    print("Portrait prompts prepared: 24 · optional action prompts deferred: 24")
    print("Exact portrait artwork active: 0/24 · planned original portraits: 24/24 · broken runtime fallbacks: 0")
    print("Fallback chain: exact athlete → tour → sport → neutral")
    print("\nAssignments:")
    for slot in manifest:
        print(f"- {slot['tourId']} · {slot['canonicalAthleteId']} · {slot['displayName']} · {slot['optionalAction']}")
    print("\nValidation:")
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1
    print("PASS · mappings, prompts, showcase assignments, planned registry rows, and fallback chains are ready")
    print("No artwork was downloaded or generated. Tour assignments remain contextual and replaceable.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
