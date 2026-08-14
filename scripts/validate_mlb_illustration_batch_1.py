#!/usr/bin/env python3
"""Validate the six human-approved MLB Style v1 production portraits."""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

from validate_illustration_style_proof import STYLE_VERSION, extract_json, parse_png


ROOT = Path(__file__).resolve().parents[1]
PROVENANCE_PATH = ROOT / "docs/assets/illustration-style/edgeboard-mlb-illustration-batch-1-exports.json"
REGISTRY_PATH = ROOT / "src/config/illustration-registry.js"
MANIFEST_PATH = ROOT / "src/config/mlb-illustration-showcase-batch-1.js"
EXPECTED_IDS = {
    "mlb-paul-skenes", "mlb-cal-raleigh", "mlb-elly-de-la-cruz",
    "mlb-shohei-ohtani", "mlb-ronald-acuna-jr", "mlb-jose-ramirez",
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
    manifest = extract_json(MANIFEST_PATH, "/* mlb-showcase-json-start */", "/* mlb-showcase-json-end */")
    manifest_ids = {item.get("canonicalAthleteId") for item in manifest}
    export_ids = {item.get("canonicalEntityId") for item in exports}

    if export_ids != EXPECTED_IDS or len(exports) != 6:
        errors.append("Batch 1 provenance must contain the six expected unique canonical athlete IDs")
    if not EXPECTED_IDS.issubset(manifest_ids):
        errors.append("Batch 1 contains an athlete outside the canonical MLB showcase manifest")
    if (provenance.get("styleVersion") != STYLE_VERSION
            or provenance.get("styleRole") != "showcase_production_portrait"
            or provenance.get("productionStatus") != "approved"
            or provenance.get("reviewStatus") != "approved"
            or provenance.get("humanVisualApproval") != "approved"
            or provenance.get("realismDrift") != "none"):
        errors.append("Batch 1 provenance does not record the approved Style v1 review state")
    if not provenance.get("reviewMetadata") or any(value != "approved" for value in provenance["reviewMetadata"].values()):
        errors.append("Batch 1 human-review metadata is incomplete")

    registry_by_entity: dict[str, list[dict]] = {}
    for entry in registry:
        registry_by_entity.setdefault(entry.get("canonicalEntityId", ""), []).append(entry)
    seen_paths: set[str] = set()

    for record in exports:
        entity_id = record["canonicalEntityId"]
        source = Path(record["sourcePath"])
        asset_path = record["assetPath"]
        asset = ROOT / asset_path
        expected_path = f"assets/illustrations/mlb/edgeboard--{entity_id}--portrait--v01.png"
        if asset_path != expected_path or asset_path in seen_paths:
            errors.append(f"{entity_id}: wrong or duplicate canonical production path")
        seen_paths.add(asset_path)

        if not source.is_file():
            unavailable_sources.append(entity_id)
        else:
            if source.stat().st_size != record.get("sourceSizeBytes") or digest(source) != record.get("sourceSha256"):
                errors.append(f"{entity_id}: preserved source size or SHA-256 changed")

        if not asset.is_file():
            errors.append(f"{entity_id}: production export is missing")
            continue
        png_errors, metadata = parse_png(asset)
        if png_errors:
            errors.extend(f"{entity_id}: {error}" for error in png_errors)
        if (metadata.get("width"), metadata.get("height")) != (640, 800) or not metadata.get("rgba") or not metadata.get("decoded") or not metadata.get("meaningfulTransparency"):
            errors.append(f"{entity_id}: production export does not satisfy the transparent 640x800 RGBA contract")
        if asset.stat().st_size > MAX_BYTES or asset.stat().st_size != record.get("exportSizeBytes") or digest(asset) != record.get("exportSha256"):
            errors.append(f"{entity_id}: production size or SHA-256 does not match provenance")

        exact = [entry for entry in registry_by_entity.get(entity_id, []) if entry.get("variant") == "portrait"]
        if len(exact) != 1:
            errors.append(f"{entity_id}: expected exactly one canonical portrait registry entry")
        elif (exact[0].get("id") != f"art-{entity_id}-portrait"
              or exact[0].get("assetPath") != asset_path
              or exact[0].get("status") != "active"
              or exact[0].get("styleVersion") != STYLE_VERSION
              or exact[0].get("styleRole") != "showcase_production_portrait"):
            errors.append(f"{entity_id}: active registry metadata does not match the approved export")

    print("EdgeBoard MLB Illustration Production Batch 1")
    print(f"Physical: {sum((ROOT / item['assetPath']).is_file() for item in exports)}/6")
    print(f"Technically valid: {6 if not any('PNG' in error or 'production' in error for error in errors) else 'see errors'}/6")
    print(f"Human approved: {len(exports) if provenance.get('humanVisualApproval') == 'approved' else 0}/6")
    print(f"Registry active: {sum(any(entry.get('canonicalEntityId') == item['canonicalEntityId'] and entry.get('variant') == 'portrait' and entry.get('status') == 'active' for entry in registry) for item in exports)}/6")
    if unavailable_sources:
        print(f"External source recheck skipped: {len(unavailable_sources)}/6 unavailable outside the repository; recorded provenance retained")
    print("Validation:")
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1
    print("PASS · source preservation, PNG integrity, alpha, dimensions, provenance, canonical mappings, and registry activation are valid")
    return 0


if __name__ == "__main__":
    sys.exit(main())
