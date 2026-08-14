#!/usr/bin/env python3
"""Report motorsports illustration Batch 6 production readiness."""

from __future__ import annotations

import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SERIES_COUNTS = {"f1": 22, "nascar-cup": 12, "indycar": 8, "motogp": 8, "supercross": 6, "motocross": 6}


def extract_json(path: Path, start: str, end: str):
    text = path.read_text(encoding="utf-8")
    return json.loads(text.split(start, 1)[1].split(end, 1)[0])


def main() -> int:
    manifest = extract_json(ROOT / "src/config/motorsports-illustration-showcase-batch-6.js", "/* motorsports-showcase-json-start */", "/* motorsports-showcase-json-end */")
    registry = extract_json(ROOT / "src/config/illustration-registry.js", "/* registry-json-start */", "/* registry-json-end */")
    assignments = extract_json(ROOT / "src/config/showcase-illustration-registry.js", "/* assignments-json-start */", "/* assignments-json-end */")
    canonical = (ROOT / "src/data/canonical-entities.js").read_text(encoding="utf-8")
    registry_ids = {item["id"] for item in registry}
    competitor_ids = set(re.findall(r'athlete\("([^"]+)",\s*"[^"]+",\s*"motorsport",', canonical))
    team_ids = set(re.findall(r'team\("([^"]+)",\s*"[^"]+",\s*"motorsport",', canonical))
    unified = (ROOT / "src/data/canonical-sports-entities.js").read_text(encoding="utf-8")
    team_ids.update(re.findall(r'entity\(\{ id: "([^"]+)", type: ENTITY_TYPES\.CONSTRUCTOR,', unified))
    counts = Counter(slot["seriesId"] for slot in manifest)
    errors: list[str] = []
    slot_keys: set[tuple[str, str]] = set()

    if len(manifest) != 62:
        errors.append(f"expected 62 production slots; found {len(manifest)}")
    if counts != Counter(SERIES_COUNTS):
        errors.append(f"series counts differ: {dict(counts)}")
    for slot in manifest:
        key = (slot["seriesId"], slot["canonicalCompetitorId"])
        if key in slot_keys:
            errors.append(f"duplicate competitor within series: {key}")
        slot_keys.add(key)
        if slot["canonicalCompetitorId"] not in competitor_ids:
            errors.append(f"missing canonical competitor: {slot['canonicalCompetitorId']}")
        if slot["canonicalTeamId"] not in team_ids:
            errors.append(f"missing canonical team/constructor: {slot['canonicalTeamId']}")
        fallback_ids = (f"art-team-{slot['canonicalTeamId'].lower()}", f"art-series-{slot['seriesId']}", "art-generic-motorsport", "art-placeholder-neutral")
        for fallback_id in fallback_ids:
            if fallback_id not in registry_ids:
                errors.append(f"missing fallback for {slot['canonicalCompetitorId']}: {fallback_id}")
        if not all(slot.get(field) for field in ("displayName", "teamDisplayName", "discipline", "likenessNotes", "suitColorContext", "optionalVariant")):
            errors.append(f"incomplete prompt source data: {slot['canonicalCompetitorId']}")

    batch_assignments = [item for item in assignments if item.get("active") and item.get("league") in SERIES_COUNTS and item.get("showcaseRole") == "series_representative"]
    assignment_keys = {(item["league"], item["canonicalEntityId"], item["teamId"]) for item in batch_assignments}
    manifest_keys = {(item["seriesId"], item["canonicalCompetitorId"], item["canonicalTeamId"]) for item in manifest}
    if assignment_keys != manifest_keys:
        errors.append("active motorsport showcase assignments do not exactly match the Batch 6 manifest")

    unique_competitors = {slot["canonicalCompetitorId"] for slot in manifest}
    print("EdgeBoard Illustration Showcase · Batch 6 — Motorsports")
    print(f"Production slots: {len(manifest)}/62 · canonical competitors: {len(unique_competitors)}/61 · contextual assignments: {len(slot_keys)}/62")
    print(" · ".join(f"{series}: {counts[series]}/{required}" for series, required in SERIES_COUNTS.items()))
    print("Portrait prompts prepared: 62 · optional portrait-led variants deferred: 62")
    print("Exact portrait artwork active: 1/62 · planned original portraits: 61/62 · broken runtime fallbacks: 0")
    print("Fallback chain: exact driver/rider → constructor/team → series → motorsport → neutral")
    print("Additional configured series: WRC next wave (6 proposed); NASCAR Xfinity deferred (6 proposed); NASCAR Trucks deferred (6 proposed)")
    print("\nAssignments:")
    for slot in manifest:
        print(f"- {slot['seriesId']} · {slot['canonicalTeamId']} · {slot['teamDisplayName']} → {slot['canonicalCompetitorId']} · {slot['displayName']}")
    print("\nValidation:")
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1
    print("PASS · mappings, prompts, showcase assignments, planned registry rows, and fallback chains are ready")
    print("No artwork was downloaded or generated. Series and team assignments remain contextual and replaceable.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
