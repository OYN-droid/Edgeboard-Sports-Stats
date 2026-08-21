#!/usr/bin/env python3
"""Validate EdgeBoard illustration provenance and print deterministic coverage gaps."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REGISTRY_PATH = ROOT / "src/config/illustration-registry.js"
SHOWCASE_PATH = ROOT / "src/config/showcase-illustration-registry.js"
PROOF_PATH = ROOT / "src/config/illustration-style-proof-batch.js"
BOXING_FEATURED_PROVENANCE_PATH = ROOT / "docs/assets/illustration-style/edgeboard-boxing-featured-portrait-exports.json"
ASSET_ROOT = ROOT / "assets/illustrations"


def extract_json(path: Path, start: str, end: str):
    text = path.read_text(encoding="utf-8")
    match = re.search(rf"{re.escape(start)}\s*(\[.*?\])\s*{re.escape(end)}", text, re.DOTALL)
    if not match:
        raise ValueError(f"Missing JSON marker block in {path.relative_to(ROOT)}: {start}")
    return json.loads(match.group(1))


def main() -> int:
    entries = extract_json(REGISTRY_PATH, "/* registry-json-start */", "/* registry-json-end */")
    archived_assets = extract_json(REGISTRY_PATH, "/* archived-assets-json-start */", "/* archived-assets-json-end */")
    targets = extract_json(SHOWCASE_PATH, "/* targets-json-start */", "/* targets-json-end */")
    assignments = extract_json(SHOWCASE_PATH, "/* assignments-json-start */", "/* assignments-json-end */")
    proof_slots = extract_json(PROOF_PATH, "/* illustration-proof-json-start */", "/* illustration-proof-json-end */")
    boxing_featured = json.loads(BOXING_FEATURED_PROVENANCE_PATH.read_text(encoding="utf-8"))
    errors: list[str] = []
    seen_ids: set[str] = set()
    seen_variants: set[tuple[str, str]] = set()
    registered_paths: set[str] = set()
    valid_types = {"original_generated", "original_manual", "generic_sport", "team_fallback", "competition_fallback", "weight_class_fallback", "series_fallback", "tour_fallback", "placeholder"}
    valid_variants = {"portrait", "action", "celebration", "profile", "story", "compact"}

    for entry in entries:
        entry_id = entry.get("id", "<missing>")
        if entry_id in seen_ids or entry_id == "<missing>":
            errors.append(f"duplicate or missing registry ID: {entry_id}")
        seen_ids.add(entry_id)
        key = (entry.get("canonicalEntityId", ""), entry.get("variant", ""))
        if key in seen_variants:
            errors.append(f"duplicate canonical variant: {key[0]} / {key[1]}")
        seen_variants.add(key)
        if entry.get("assetType") not in valid_types:
            errors.append(f"invalid asset type: {entry_id}")
        if entry.get("variant") not in valid_variants:
            errors.append(f"invalid variant: {entry_id}")
        if entry.get("source") != "edgeboard_original":
            errors.append(f"unapproved or missing provenance: {entry_id}")
        asset_path = entry.get("assetPath", "")
        registered_paths.add(asset_path)
        if not asset_path or not (ROOT / asset_path).is_file():
            errors.append(f"missing asset: {entry_id} -> {asset_path or '<none>'}")

    archived_paths: set[str] = set()
    for item in archived_assets:
        asset_path = item.get("assetPath", "")
        if not asset_path or not (ROOT / asset_path).is_file():
            errors.append(f"missing archived provenance asset: {asset_path or '<none>'}")
            continue
        if item.get("status") != "archived_provenance" or not item.get("supersededBy"):
            errors.append(f"invalid archived provenance metadata: {asset_path}")
        archived_paths.add(asset_path)

    asset_files = {str(path.relative_to(ROOT)) for path in ASSET_ROOT.rglob("*") if path.is_file()}
    proof_paths = {item["assetPath"] for item in proof_slots}
    orphans = sorted(asset_files - registered_paths - archived_paths - proof_paths)
    if orphans:
        errors.extend(f"orphaned asset: {path}" for path in orphans)

    exact_ids = {entry["canonicalEntityId"] for entry in entries if entry.get("entityType") in {"athlete", "fighter", "driver"}}
    queue = sorted(
        ({**item, "illustrated": item["canonicalEntityId"] in exact_ids} for item in assignments if item.get("active")),
        key=lambda item: (item["illustrated"], -item.get("displayPriority", 0), item["canonicalEntityId"]),
    )

    print("EdgeBoard Illustration Coverage")
    print(f"Registry: {len(entries)} entries · {len(asset_files)} unique files · {len(exact_ids)} exact showcase entities")
    physical_proof_files = sum((ROOT / path).is_file() for path in proof_paths)
    approved_proofs = sum(item.get("productionStatus") == "approved" and item.get("reviewStatus") == "approved" for item in proof_slots)
    active_proofs = sum(any(entry.get("canonicalEntityId") == item["canonicalEntityId"] and entry.get("variant") == "portrait" and entry.get("status") == "active" for entry in entries) for item in proof_slots)
    print(f"Style proof: {physical_proof_files}/{len(proof_slots)} physical · {approved_proofs}/{len(proof_slots)} human approved · {active_proofs}/{len(proof_slots)} active")
    boxing_active = {
        entry["canonicalEntityId"] for entry in entries
        if entry.get("entityType") == "fighter" and entry.get("league") == "boxing"
        and entry.get("variant") == "portrait" and entry.get("status") == "active"
    }
    boxing_records = boxing_featured.get("exports", [])
    boxing_approved = {item.get("canonicalEntityId") for item in boxing_records if item.get("registryEligible")}
    boxing_needs_revision = [item for item in boxing_records if item.get("technicalStatus") == "needs_revision"]
    if boxing_active != boxing_approved or len(boxing_records) != 13 or boxing_needs_revision:
        errors.append("Boxing featured portrait coverage does not match its provenance and active registry state")
    print(f"Boxing featured exact portraits: {len(boxing_active)} active · {len(boxing_needs_revision)} needs revision · featured_partial · not complete boxing coverage")
    print("\nCoverage targets (art production plan; fallbacks remain available):")
    for target in targets:
        seeded = [item for item in assignments if item.get("active") and item.get("sport") == target["sport"]
                  and (item.get("league") == target["league"] or target["league"] in {"soccer", "atp-wta", "pga-lpga"})]
        if target["grouping"] == "weightClass":
            assigned_groups = {item.get("weightClass") for item in seeded if item.get("weightClass")}
            illustrated_groups = {item.get("weightClass") for item in seeded if item["canonicalEntityId"] in exact_ids and item.get("weightClass")}
            print(f"- {target['label']}: {len(illustrated_groups)}/{target['requiredCount']} weight classes with exact art; "
                  f"{len(assigned_groups)}/{target['requiredCount']} assigned; {len(seeded)} fighter assignments")
            continue
        illustrated = sum(item["canonicalEntityId"] in exact_ids for item in seeded)
        if target["league"] == "mlb":
            team_fallback_ids = {
                entry["canonicalEntityId"]
                for entry in entries
                if entry.get("assetType") == "team_fallback" and entry.get("status") == "active"
            }
            fallback_covered = sum(item.get("teamId") in team_fallback_ids for item in seeded)
            print(f"- {target['label']}: {illustrated}/{target['requiredCount']} exact art; "
                  f"{target['requiredCount'] - illustrated} pending or needs revision; "
                  f"{fallback_covered}/{target['requiredCount']} team fallbacks; "
                  f"{len(seeded)} showcase assignments")
            continue
        print(f"- {target['label']}: {illustrated}/{target['requiredCount']} exact art; {len(seeded)} showcase assignments; {target['requiredCount'] - illustrated} planned")

    print("\nNext illustration priority queue:")
    pending = [item for item in queue if not item["illustrated"]]
    for index, item in enumerate(pending[:10], 1):
        print(f"{index}. {item['canonicalEntityId']} · {item['league']} · priority {item['displayPriority']} · {item['showcaseRole']}")
    if not pending:
        print("No seeded showcase assignment is missing exact art.")

    print("\nValidation:")
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1
    print("PASS · paths, uniqueness, provenance, variants, types, and orphan checks are valid")
    return 0


if __name__ == "__main__":
    sys.exit(main())
