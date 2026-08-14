#!/usr/bin/env python3
"""Validate and report EdgeBoard Illustration Showcase Batch 3 combat coverage."""

from __future__ import annotations

from collections import Counter, defaultdict
import json
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def extract_json(path: Path, start: str, end: str):
    text = path.read_text(encoding="utf-8")
    match = re.search(rf"{re.escape(start)}\s*(\[.*?\])\s*{re.escape(end)}", text, re.DOTALL)
    if not match:
        raise ValueError(f"Missing JSON marker block in {path.relative_to(ROOT)}")
    return json.loads(match.group(1))


def canonical_fighters() -> dict[str, tuple[str, str, str]]:
    text = (ROOT / "src/data/canonical-entities.js").read_text(encoding="utf-8")
    pattern = re.compile(
        r'athlete\("([^"]+)",\s*"[^"]+",\s*"([^"]+)",\s*"([^"]+)".*?weightClass:\s*"([^"]+)".*?\),'
    )
    return {fighter_id: (sport_id, league_id, weight_class) for fighter_id, sport_id, league_id, weight_class in pattern.findall(text)}


def main() -> int:
    manifest = extract_json(
        ROOT / "src/config/combat-illustration-showcase-batch-3.js",
        "/* combat-showcase-json-start */", "/* combat-showcase-json-end */",
    )
    assignments = extract_json(
        ROOT / "src/config/showcase-illustration-registry.js",
        "/* assignments-json-start */", "/* assignments-json-end */",
    )
    registry = extract_json(
        ROOT / "src/config/illustration-registry.js",
        "/* registry-json-start */", "/* registry-json-end */",
    )
    canonical = canonical_fighters()
    registry_ids = {item["id"] for item in registry}
    exact_ids = {item["canonicalEntityId"] for item in registry if item.get("entityType") == "fighter"}
    errors: list[str] = []
    ids: set[str] = set()
    class_counts: dict[str, Counter[str]] = defaultdict(Counter)

    if len(manifest) != 38:
        errors.append(f"expected 38 fighter slots; found {len(manifest)}")
    for item in manifest:
        fighter_id = item["canonicalFighterId"]
        expected = (item["sportId"], item["leagueId"], item["weightClass"])
        if fighter_id in ids:
            errors.append(f"duplicate fighter assignment: {fighter_id}")
        ids.add(fighter_id)
        class_counts[item["leagueId"]][item["weightClass"]] += 1
        if canonical.get(fighter_id) != expected:
            errors.append(f"missing or inconsistent canonical fighter: {fighter_id} -> {expected}")
        slug = re.sub(r"(^-|-$)", "", re.sub(r"[^a-z0-9]+", "-", item["weightClass"].lower()))
        for fallback_id in (f"art-weight-{item['sportId']}-{slug}", f"art-generic-{item['sportId']}", "art-placeholder-neutral"):
            if fallback_id not in registry_ids:
                errors.append(f"missing fallback {fallback_id}: {fighter_id}")
        required = ("displayName", "weightClass", "showcaseRole", "portraitPose", "physicalCharacteristics", "uniformColorContext", "actionDescription")
        if not all(item.get(field) for field in required):
            errors.append(f"incomplete production description: {fighter_id}")

    required_classes = {
        "ufc": ["Flyweight", "Bantamweight", "Featherweight", "Lightweight", "Welterweight", "Middleweight", "Light Heavyweight", "Heavyweight", "Women's Strawweight", "Women's Flyweight", "Women's Bantamweight"],
        "boxing": ["Flyweight", "Bantamweight", "Featherweight", "Lightweight", "Welterweight", "Middleweight", "Light Heavyweight", "Heavyweight"],
    }
    expected_classes = {league: len(classes) for league, classes in required_classes.items()}
    expected_fighters = {"ufc": 22, "boxing": 16}
    for league, expected in expected_classes.items():
        if len(class_counts[league]) != expected:
            errors.append(f"expected {expected} {league} weight classes; found {len(class_counts[league])}")
        for weight_class in required_classes[league]:
            if weight_class not in class_counts[league]:
                errors.append(f"missing required {league} weight class: {weight_class}")
        for weight_class in class_counts[league]:
            if weight_class not in required_classes[league]:
                errors.append(f"unsupported {league} weight class assignment: {weight_class}")
        if sum(class_counts[league].values()) != expected_fighters[league]:
            errors.append(f"expected {expected_fighters[league]} {league} fighters; found {sum(class_counts[league].values())}")
        for weight_class, count in class_counts[league].items():
            if count != 2:
                errors.append(f"expected two {league} {weight_class} representatives; found {count}")

    combat_assignments = [item for item in assignments if item.get("active") and item.get("league") in {"ufc", "boxing"}]
    assignment_rows = {(item["canonicalEntityId"], item["league"], item["weightClass"], item["showcaseRole"]) for item in combat_assignments}
    manifest_rows = {(item["canonicalFighterId"], item["leagueId"], item["weightClass"], item["showcaseRole"]) for item in manifest}
    if assignment_rows != manifest_rows:
        errors.append("active combat showcase assignments do not exactly match the Batch 3 manifest")

    print("EdgeBoard Illustration Showcase · Batch 3 — Combat Sports")
    print(f"Fighters: {len(ids)}/38 · UFC/MMA: {sum(class_counts['ufc'].values())}/22 · Boxing: {sum(class_counts['boxing'].values())}/16")
    print(f"Weight classes: UFC/MMA {len(class_counts['ufc'])}/11 · Boxing {len(class_counts['boxing'])}/8")
    print(f"Portrait prompts: {len(manifest)}/38 · fighting-stance action prompts: {len(manifest)}/38")
    print(f"Exact fighter artwork active: {len(ids & exact_ids)}/38 · planned registry entries: {len(manifest)}/38")
    print("Fallback: fighter → weight class → MMA/boxing → neutral")
    print("\nWeight-class coverage:")
    for league in ("ufc", "boxing"):
        for weight_class in class_counts[league]:
            names = [item["displayName"] for item in manifest if item["leagueId"] == league and item["weightClass"] == weight_class]
            print(f"- {league.upper()} · {weight_class}: {', '.join(names)}")
    print("\nMissing coverage:")
    missing = [f"{league} {weight_class}" for league, weight_classes in required_classes.items()
               for weight_class in weight_classes if weight_class not in class_counts[league]]
    print("None" if not missing else "\n".join(f"- {item}" for item in missing))
    print("\nValidation:")
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1
    print("PASS · canonical mappings, division coverage, prompts, registry drafts, assignments, and fallback chains are ready")
    print("No portrait or action asset was generated, downloaded, or activated.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
