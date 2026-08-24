#!/usr/bin/env python3
"""Validate the five human-approved MLB Style v1 Batch 5 portraits."""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

from validate_illustration_style_proof import STYLE_VERSION, extract_json, parse_png


ROOT = Path(__file__).resolve().parents[1]
PROVENANCE_PATH = ROOT / "docs/assets/illustration-style/edgeboard-mlb-illustration-batch-5-exports.json"
REGISTRY_PATH = ROOT / "src/config/illustration-registry.js"
MANIFEST_PATH = ROOT / "tools/illustration-qa/mlb-illustration-showcase-batch-1.js"
EXPECTED_IDS = {"mlb-masyn-winn", "mlb-ezequiel-tovar", "mlb-riley-greene", "mlb-james-wood", "mlb-juan-soto"}
VALID_IDS = EXPECTED_IDS
REMEDIATION_SOURCE_IDS = {"mlb-ezequiel-tovar", "mlb-riley-greene", "mlb-juan-soto"}
BLOCKED_IDS = EXPECTED_IDS - VALID_IDS
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
    records_by_id = {item.get("canonicalEntityId"): item for item in exports}
    registry_by_entity: dict[str, list[dict]] = {}
    for entry in registry:
        registry_by_entity.setdefault(entry.get("canonicalEntityId", ""), []).append(entry)

    if set(records_by_id) != EXPECTED_IDS or len(exports) != 5:
        errors.append("Batch 5 provenance must contain five unique expected canonical athlete IDs")
    if not EXPECTED_IDS.issubset(manifest_ids):
        errors.append("Batch 5 contains an athlete outside the canonical MLB showcase manifest")
    if (provenance.get("styleVersion") != STYLE_VERSION
            or provenance.get("styleRole") != "showcase_production_portrait"
            or provenance.get("portraitMode") != "standard"
            or provenance.get("productionStatus") != "approved"
            or provenance.get("reviewStatus") != "approved"
            or provenance.get("humanVisualApproval") != "approved"):
        errors.append("Batch 5 provenance does not record the approved Style v1 state")

    seen_paths: set[str] = set()
    for entity_id, record in records_by_id.items():
        source = Path(record["sourcePath"])
        asset_path = record["assetPath"]
        asset = ROOT / asset_path
        expected_path = f"assets/illustrations/mlb/edgeboard--{entity_id}--portrait--v01.png"
        if asset_path != expected_path or asset_path in seen_paths:
            errors.append(f"{entity_id}: wrong or duplicate canonical production path")
        seen_paths.add(asset_path)
        source_errors: list[str] = []
        source_metadata: dict = {}
        if not source.is_file():
            unavailable_sources.append(entity_id)
        else:
            if source.stat().st_size != record.get("sourceSizeBytes") or digest(source) != record.get("sourceSha256"):
                errors.append(f"{entity_id}: preserved source size or SHA-256 changed")
            source_errors, source_metadata = parse_png(source)

        exact = [entry for entry in registry_by_entity.get(entity_id, []) if entry.get("variant") == "portrait"]
        if entity_id in VALID_IDS:
            if source.is_file():
                non_dimension_source_errors = [error for error in source_errors if not error.startswith("PNG dimensions must be")]
                if non_dimension_source_errors or not source_metadata.get("rgba") or not source_metadata.get("meaningfulTransparency"):
                    errors.append(f"{entity_id}: qualifying source no longer satisfies meaningful RGBA transparency")
            if record.get("technicalStatus") != "passed" or not record.get("registryEligible"):
                errors.append(f"{entity_id}: qualifying provenance state is invalid")
            if not asset.is_file():
                errors.append(f"{entity_id}: production export is missing")
                continue
            png_errors, metadata = parse_png(asset)
            if png_errors:
                errors.extend(f"{entity_id}: {error}" for error in png_errors)
            if (metadata.get("width"), metadata.get("height")) != (640, 800) or not metadata.get("rgba") or not metadata.get("decoded") or not metadata.get("meaningfulTransparency"):
                errors.append(f"{entity_id}: export does not satisfy transparent 640x800 RGBA contract")
            if asset.stat().st_size > MAX_BYTES or asset.stat().st_size != record.get("exportSizeBytes") or digest(asset) != record.get("exportSha256"):
                errors.append(f"{entity_id}: production size or SHA-256 does not match provenance")
            if len(exact) != 1 or exact[0].get("id") != f"art-{entity_id}-portrait" or exact[0].get("assetPath") != Path(asset_path).with_suffix(".webp").as_posix() or exact[0].get("status") != "active" or exact[0].get("styleVersion") != STYLE_VERSION or exact[0].get("styleRole") != "showcase_production_portrait":
                errors.append(f"{entity_id}: active registry metadata does not match the approved export")
        else:  # Retained for strict partial-failure safety if a future record is blocked.
            if source_metadata.get("rgba") or source_metadata.get("meaningfulTransparency"):
                errors.append(f"{entity_id}: blocked-source transparency state changed; re-review required")
            if record.get("technicalStatus") != "needs_revision" or record.get("productionStatus") != "needs_revision" or record.get("reviewStatus") != "needs_revision" or record.get("registryEligible"):
                errors.append(f"{entity_id}: technical-block state is invalid")
            if not record.get("blockingReasons") or asset.is_file():
                errors.append(f"{entity_id}: blocked asset must retain reasons and no production export")
            if exact:
                errors.append(f"{entity_id}: technically blocked portrait was incorrectly registered")

    active_count = sum(any(entry.get("canonicalEntityId") == entity_id and entry.get("variant") == "portrait" and entry.get("status") == "active" for entry in registry) for entity_id in EXPECTED_IDS)
    print("EdgeBoard MLB Illustration Production Batch 5")
    if unavailable_sources:
        print(f"External source recheck skipped: {len(unavailable_sources)}/5 unavailable outside the repository; recorded provenance retained")
    print(f"Technically valid exports: {sum((ROOT / records_by_id[entity_id]['assetPath']).is_file() for entity_id in VALID_IDS)}/5")
    print(f"Human visual approval recorded: {len(exports) if provenance.get('humanVisualApproval') == 'approved' else 0}/5")
    print(f"Registry active: {active_count}/5 · needs revision: {len(BLOCKED_IDS)}/5")
    print("Validation:")
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1
    print("PASS · all five transparent sources are valid, human-approved, canonically mapped, and registry-active")
    return 0


if __name__ == "__main__":
    sys.exit(main())
