#!/usr/bin/env python3
"""Validate the five human-approved NBA Style v1 production Batch 5 portraits."""

from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path

from validate_illustration_style_proof import STYLE_VERSION, extract_json, parse_png


ROOT = Path(__file__).resolve().parents[1]
PROVENANCE_PATH = ROOT / "docs/assets/illustration-style/edgeboard-nba-illustration-batch-5-exports.json"
MANIFEST_PATH = ROOT / "src/config/basketball-illustration-showcase-batch-2.js"
REGISTRY_PATH = ROOT / "src/config/illustration-registry.js"
CANONICAL_PATH = ROOT / "src/data/canonical-entities.js"
EXPECTED_IDS = {"nba-tyrese-maxey", "nba-damian-lillard", "nba-scottie-barnes", "nba-lauri-markkanen", "nba-trae-young"}
MAX_BYTES = 5_000_000


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> int:
    errors: list[str] = []
    provenance = json.loads(PROVENANCE_PATH.read_text(encoding="utf-8"))
    exports = provenance.get("exports", [])
    slots = extract_json(MANIFEST_PATH, "/* basketball-showcase-json-start */", "/* basketball-showcase-json-end */")
    registry = extract_json(REGISTRY_PATH, "/* registry-json-start */", "/* registry-json-end */")
    slot_by_id = {slot["canonicalAthleteId"]: slot for slot in slots if slot.get("leagueId") == "nba"}
    registry_by_entity: dict[str, list[dict]] = {}
    for entry in registry:
        registry_by_entity.setdefault(entry.get("canonicalEntityId"), []).append(entry)
    canonical_text = CANONICAL_PATH.read_text(encoding="utf-8")
    canonical = dict(re.findall(r'athlete\("([^"]+)",\s*"[^"]+",\s*"basketball",\s*"nba",\s*"([^"]+)"', canonical_text))

    export_ids = {record.get("canonicalEntityId") for record in exports}
    if len(exports) != 5 or export_ids != EXPECTED_IDS:
        errors.append("NBA Batch 5 provenance must contain the five expected unique canonical athlete IDs")
    if any(provenance.get(key) != "approved" for key in ("productionStatus", "reviewStatus", "humanVisualApproval")):
        errors.append("NBA Batch 5 provenance does not record explicit human approval")
    if provenance.get("styleVersion") != STYLE_VERSION or provenance.get("portraitMode") != "standard":
        errors.append("NBA Batch 5 style version or portrait mode is invalid")
    if any(value != "approved" for value in provenance.get("reviewMetadata", {}).values()):
        errors.append("NBA Batch 5 human-review metadata is incomplete")

    for record in exports:
        entity_id = record.get("canonicalEntityId")
        slot = slot_by_id.get(entity_id)
        asset_path = record.get("assetPath", "")
        source = Path(record.get("sourcePath", ""))
        asset = ROOT / asset_path
        if not slot or canonical.get(entity_id) != record.get("canonicalTeamId") or slot.get("canonicalTeamId") != record.get("canonicalTeamId"):
            errors.append(f"{entity_id}: canonical athlete/team mapping is missing or inconsistent")
        expected_path = f"assets/illustrations/nba/edgeboard--{entity_id}--portrait--v01.png"
        if asset_path != expected_path:
            errors.append(f"{entity_id}: production target path is not canonical")
        if not source.is_file():
            errors.append(f"{entity_id}: preserved source is missing")
        elif (source.stat().st_size != record.get("sourceSizeBytes") or digest(source) != record.get("sourceSha256")
              or record.get("sourceDimensions") != {"width": 1122, "height": 1402}
              or not record.get("sourceHasAlpha") or not record.get("sourceMeaningfulTransparency")):
            errors.append(f"{entity_id}: preserved source metadata, size, alpha, or SHA-256 changed")
        if not asset.is_file():
            errors.append(f"{entity_id}: production portrait is missing")
        else:
            png_errors, metadata = parse_png(asset)
            errors.extend(f"{entity_id}: {error}" for error in png_errors)
            if (metadata.get("width"), metadata.get("height")) != (640, 800):
                errors.append(f"{entity_id}: production portrait is not 640x800")
            if not all(metadata.get(key) for key in ("rgba", "decoded", "meaningfulTransparency")):
                errors.append(f"{entity_id}: production portrait is not decoded meaningful-alpha RGBA")
            if asset.stat().st_size > MAX_BYTES or asset.stat().st_size != record.get("exportSizeBytes") or digest(asset) != record.get("exportSha256"):
                errors.append(f"{entity_id}: production size or SHA-256 does not match provenance")
        if (record.get("exportDimensions") != {"width": 640, "height": 800}
                or record.get("scaleFactor") != 0.570409982
                or record.get("offset") != {"x": 0.0, "y": 0.143}
                or record.get("productionStatus") != "approved"
                or record.get("reviewStatus") != "approved"
                or not record.get("registryEligible")):
            errors.append(f"{entity_id}: deterministic export or approval metadata is incomplete")
        exact = [entry for entry in registry_by_entity.get(entity_id, []) if entry.get("variant") == "portrait"]
        if len(exact) != 1:
            errors.append(f"{entity_id}: expected exactly one canonical portrait registry entry")
        elif (exact[0].get("id") != f"art-{entity_id}-portrait" or exact[0].get("assetPath") != asset_path
              or exact[0].get("status") != "active" or exact[0].get("styleVersion") != STYLE_VERSION
              or exact[0].get("styleRole") != "showcase_production_portrait"
              or exact[0].get("assetType") != "original_generated"):
            errors.append(f"{entity_id}: active registry metadata does not match the approved export")

    active_nba = {entry.get("canonicalEntityId") for entry in registry if entry.get("entityType") == "athlete" and entry.get("league") == "nba" and entry.get("variant") == "portrait" and entry.get("status") == "active"}
    if len(active_nba) != 30 or not EXPECTED_IDS.issubset(active_nba):
        errors.append("NBA Batch 5 must complete exact active portrait coverage at 30/30")
    if "nba-lebron-james" in active_nba:
        errors.append("LeBron James must remain canonical but must not retain the Philadelphia showcase portrait slot")

    print("EdgeBoard NBA Illustration Production Batch 5")
    print(f"Physical: {sum((ROOT / item['assetPath']).is_file() for item in exports)}/5")
    print(f"Human approved: {len(exports) if provenance.get('humanVisualApproval') == 'approved' else 0}/5")
    print(f"Registry active: {len(active_nba)}/30 · pending: {30 - len(active_nba)}/30")
    print("Validation:")
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1
    print("PASS · source preservation, PNG integrity, alpha, deterministic export, provenance, canonical mappings, and activation are valid")
    return 0


if __name__ == "__main__":
    sys.exit(main())
