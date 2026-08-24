#!/usr/bin/env python3
"""Validate the six human-approved NBA Style v1 production portraits."""

from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path

from validate_illustration_style_proof import STYLE_VERSION, extract_json, parse_png


ROOT = Path(__file__).resolve().parents[1]
PROVENANCE_PATH = ROOT / "docs/assets/illustration-style/edgeboard-nba-illustration-batch-1-exports.json"
REGISTRY_PATH = ROOT / "src/config/illustration-registry.js"
MANIFEST_PATH = ROOT / "tools/illustration-qa/basketball-illustration-showcase-batch-2.js"
CANONICAL_PATH = ROOT / "src/data/canonical-entities.js"
EXPECTED_IDS = {
    "nba-jayson-tatum", "nba-nikola-jokic", "nba-anthony-edwards",
    "nba-victor-wembanyama", "nba-jalen-brunson", "nba-keegan-murray",
}
MAX_BYTES = 5_000_000


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> int:
    errors: list[str] = []
    unavailable_sources: list[str] = []
    provenance = json.loads(PROVENANCE_PATH.read_text(encoding="utf-8"))
    exports = provenance.get("exports", [])
    registry = extract_json(REGISTRY_PATH, "/* registry-json-start */", "/* registry-json-end */")
    manifest = extract_json(MANIFEST_PATH, "/* basketball-showcase-json-start */", "/* basketball-showcase-json-end */")
    manifest_ids = {item.get("canonicalAthleteId") for item in manifest if item.get("leagueId") == "nba"}
    export_ids = {item.get("canonicalEntityId") for item in exports}
    canonical_text = CANONICAL_PATH.read_text(encoding="utf-8")
    canonical = dict(re.findall(r'athlete\("([^"]+)",\s*"[^"]+",\s*"basketball",\s*"nba",\s*"([^"]+)"', canonical_text))

    if export_ids != EXPECTED_IDS or len(exports) != 6:
        errors.append("NBA Batch 1 provenance must contain the six expected unique canonical athlete IDs")
    if not EXPECTED_IDS.issubset(manifest_ids):
        errors.append("NBA Batch 1 includes an athlete outside the canonical NBA showcase manifest")
    if (provenance.get("styleVersion") != STYLE_VERSION
            or provenance.get("styleRole") != "showcase_production_portrait"
            or provenance.get("portraitMode") != "standard"
            or provenance.get("variant") != "portrait"
            or provenance.get("productionStatus") != "approved"
            or provenance.get("reviewStatus") != "approved"
            or provenance.get("humanVisualApproval") != "approved"):
        errors.append("NBA Batch 1 provenance does not record the approved Style v1 state")
    if not provenance.get("reviewMetadata") or any(value != "approved" for value in provenance["reviewMetadata"].values()):
        errors.append("NBA Batch 1 human-review metadata is incomplete")

    registry_by_entity: dict[str, list[dict]] = {}
    for entry in registry:
        registry_by_entity.setdefault(entry.get("canonicalEntityId", ""), []).append(entry)
    seen_paths: set[str] = set()

    for record in exports:
        entity_id = record["canonicalEntityId"]
        source = Path(record["sourcePath"])
        asset_path = record["assetPath"]
        asset = ROOT / asset_path
        expected_path = f"assets/illustrations/nba/edgeboard--{entity_id}--portrait--v01.png"
        if canonical.get(entity_id) != record.get("canonicalTeamId"):
            errors.append(f"{entity_id}: canonical team mapping is inconsistent")
        if asset_path != expected_path or asset_path in seen_paths:
            errors.append(f"{entity_id}: wrong or duplicate canonical production path")
        seen_paths.add(asset_path)
        if not source.is_file():
            unavailable_sources.append(entity_id)
        elif (source.stat().st_size != record.get("sourceSizeBytes")
              or digest(source) != record.get("sourceSha256")
              or record.get("sourceDimensions") != {"width": 1024, "height": 1536}
              or record.get("sourceColorMode") != "8-bit RGBA"
              or not record.get("sourceHasAlpha")
              or not record.get("sourceMeaningfulTransparency")):
            errors.append(f"{entity_id}: preserved source metadata, size, or SHA-256 changed")

        if not asset.is_file():
            errors.append(f"{entity_id}: production export is missing")
            continue
        png_errors, metadata = parse_png(asset)
        if png_errors:
            errors.extend(f"{entity_id}: {error}" for error in png_errors)
        if ((metadata.get("width"), metadata.get("height")) != (640, 800)
                or not metadata.get("rgba") or not metadata.get("decoded")
                or not metadata.get("meaningfulTransparency")):
            errors.append(f"{entity_id}: export does not satisfy the transparent 640x800 RGBA contract")
        if (asset.stat().st_size > MAX_BYTES or asset.stat().st_size != record.get("exportSizeBytes")
                or digest(asset) != record.get("exportSha256")):
            errors.append(f"{entity_id}: production size or SHA-256 does not match provenance")
        if (record.get("exportDimensions") != {"width": 640, "height": 800}
                or record.get("scaleFactor") != 0.520833333
                or record.get("offset") != {"x": 53.333, "y": 0.0}
                or record.get("productionStatus") != "approved"
                or record.get("reviewStatus") != "approved"
                or not record.get("registryEligible")):
            errors.append(f"{entity_id}: deterministic export or approval metadata is incomplete")

        exact = [entry for entry in registry_by_entity.get(entity_id, []) if entry.get("variant") == "portrait"]
        if len(exact) != 1:
            errors.append(f"{entity_id}: expected exactly one canonical portrait registry entry")
        elif (exact[0].get("id") != f"art-{entity_id}-portrait"
              or exact[0].get("assetPath") != Path(asset_path).with_suffix(".webp").as_posix()
              or exact[0].get("status") != "active"
              or exact[0].get("styleVersion") != STYLE_VERSION
              or exact[0].get("styleRole") != "showcase_production_portrait"
              or exact[0].get("assetType") != "original_generated"):
            errors.append(f"{entity_id}: active registry metadata does not match the approved export")

    active_nba = {
        entry.get("canonicalEntityId") for entry in registry
        if entry.get("entityType") == "athlete" and entry.get("league") == "nba"
        and entry.get("variant") == "portrait" and entry.get("status") == "active"
    }
    if not (EXPECTED_IDS | {"nba-stephen-curry"}).issubset(active_nba):
        errors.append("NBA active portrait coverage must retain Curry plus every approved Batch 1 athlete")
    pending_batch_ids = {
        item.get("canonicalAthleteId") for item in manifest
        if item.get("leagueId") == "nba" and item.get("canonicalAthleteId") not in active_nba
    }
    if pending_batch_ids & active_nba:
        errors.append("NBA pending and active portrait states overlap")

    print("EdgeBoard NBA Illustration Production Batch 1")
    print(f"Physical: {sum((ROOT / item['assetPath']).is_file() for item in exports)}/6")
    print(f"Human approved: {len(exports) if provenance.get('humanVisualApproval') == 'approved' else 0}/6")
    print(f"Registry active: {len(active_nba)}/30 · pending: {len(pending_batch_ids)}/30")
    if unavailable_sources:
        print(f"External source recheck skipped: {len(unavailable_sources)}/6 unavailable outside the repository; recorded provenance retained")
    print("Validation:")
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1
    print("PASS · source preservation, PNG integrity, alpha, deterministic export, provenance, canonical mappings, and activation are valid")
    return 0


if __name__ == "__main__":
    sys.exit(main())
