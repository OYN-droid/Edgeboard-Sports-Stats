#!/usr/bin/env python3
"""Validate the eight human-approved featured WNBA Style v1 portraits."""

from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path

from validate_illustration_style_proof import STYLE_VERSION, extract_json, parse_png


ROOT = Path(__file__).resolve().parents[1]
PROVENANCE_PATH = ROOT / "docs/assets/illustration-style/edgeboard-wnba-featured-portrait-exports.json"
MANIFEST_PATH = ROOT / "src/config/basketball-illustration-showcase-batch-2.js"
REGISTRY_PATH = ROOT / "src/config/illustration-registry.js"
CANONICAL_PATH = ROOT / "src/data/canonical-entities.js"
REFERENCE_PATH = ROOT / "docs/assets/illustration-style/edgeboard-illustration-style-v1-reference.png"
REFERENCE_SHA256 = "223ff10408d12be286a9311d5c9d4f8dce73a7b6f8881bc034737b635ced8ae6"
EXPECTED = {
    "wnba-aja-wilson": ("LVA", "22"),
    "wnba-sabrina-ionescu": ("NYL", "20"),
    "wnba-paige-bueckers": ("WNBA-DAL", "5"),
    "wnba-angel-reese": ("WNBA-ATL", "5"),
    "wnba-caitlin-clark": ("IND-W", "22"),
    "wnba-olivia-miles": ("WNBA-MIN", "5"),
    "wnba-cameron-brink": ("WNBA-LAS", "22"),
    "wnba-gabby-williams": ("WNBA-GSV", "22"),
}
MAX_BYTES = 5_000_000


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> int:
    errors: list[str] = []
    unavailable_sources: list[str] = []
    provenance = json.loads(PROVENANCE_PATH.read_text(encoding="utf-8"))
    exports = provenance.get("exports", [])
    slots = extract_json(MANIFEST_PATH, "/* basketball-showcase-json-start */", "/* basketball-showcase-json-end */")
    registry = extract_json(REGISTRY_PATH, "/* registry-json-start */", "/* registry-json-end */")
    slot_by_id = {slot["canonicalAthleteId"]: slot for slot in slots if slot.get("leagueId") == "wnba"}
    registry_by_entity: dict[str, list[dict]] = {}
    for entry in registry:
        registry_by_entity.setdefault(entry.get("canonicalEntityId"), []).append(entry)
    canonical_text = CANONICAL_PATH.read_text(encoding="utf-8")
    canonical = dict(re.findall(r'athlete\("([^"]+)",\s*"[^"]+",\s*"basketball",\s*"wnba",\s*"([^"]+)"', canonical_text))

    export_ids = {record.get("canonicalEntityId") for record in exports}
    if len(exports) != 8 or export_ids != set(EXPECTED):
        errors.append("WNBA featured provenance must contain exactly the eight expected unique athlete IDs")
    if provenance.get("coverageType") != "featured_partial" or "not complete" not in provenance.get("coverageDisclosure", "").lower():
        errors.append("WNBA production coverage must remain explicitly partial featured coverage")
    if any(provenance.get(key) != "approved" for key in ("productionStatus", "reviewStatus", "humanVisualApproval")):
        errors.append("WNBA featured provenance does not record explicit human approval")
    if provenance.get("styleVersion") != STYLE_VERSION or provenance.get("portraitMode") != "standard":
        errors.append("WNBA featured style version or portrait mode is invalid")
    if any(value != "approved" for value in provenance.get("reviewMetadata", {}).values()):
        errors.append("WNBA featured human-review metadata is incomplete")
    if provenance.get("externalSourceArchiveStatus") != "not_distributed_with_repository":
        errors.append("WNBA provenance must identify external source archives as not distributed with the repository")
    if not REFERENCE_PATH.is_file() or digest(REFERENCE_PATH) != REFERENCE_SHA256:
        errors.append("Style v1 reference PNG is missing or changed")

    for record in exports:
        entity_id = record.get("canonicalEntityId")
        expected = EXPECTED.get(entity_id)
        slot = slot_by_id.get(entity_id)
        asset_path = record.get("assetPath", "")
        source = Path(record.get("sourcePath", ""))
        asset = ROOT / asset_path
        if not expected or record.get("canonicalTeamId") != expected[0] or record.get("jerseyNumber") != expected[1]:
            errors.append(f"{entity_id}: approved team or jersey assignment is inconsistent")
        if not slot or canonical.get(entity_id) != expected[0] or slot.get("canonicalTeamId") != expected[0]:
            errors.append(f"{entity_id}: canonical athlete/team mapping is missing or inconsistent")
        expected_path = f"assets/illustrations/athletes/edgeboard--{entity_id}--portrait--v01.png"
        if asset_path != expected_path:
            errors.append(f"{entity_id}: production target path is not canonical")
        if (not source.name or not re.fullmatch(r"[0-9a-f]{64}", str(record.get("sourceSha256", "")))
                or not isinstance(record.get("sourceSizeBytes"), int)
                or record.get("sourceSizeBytes", 0) <= 0
                or not record.get("sourceHasAlpha") or not record.get("sourceMeaningfulTransparency")):
            errors.append(f"{entity_id}: recorded external source provenance is incomplete")
        if not source.is_file():
            unavailable_sources.append(entity_id)
        else:
            source_errors, source_metadata = parse_png(source)
            # Supplied sources may be larger than the canonical export canvas;
            # all other integrity, decoding, RGBA, and alpha failures remain fatal.
            errors.extend(f"{entity_id} source: {error}" for error in source_errors if error != "PNG dimensions must be 640x800")
            if (source.stat().st_size != record.get("sourceSizeBytes") or digest(source) != record.get("sourceSha256")
                    or record.get("sourceDimensions") != {"width": source_metadata.get("width"), "height": source_metadata.get("height")}
                    or not all(source_metadata.get(key) for key in ("rgba", "decoded", "meaningfulTransparency"))
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
        expected_scale = 0.520833333 if entity_id == "wnba-gabby-williams" else 0.570409982
        expected_offset = {"x": 53.333, "y": 0.0} if entity_id == "wnba-gabby-williams" else {"x": 0.0, "y": 0.143}
        if (record.get("exportDimensions") != {"width": 640, "height": 800}
                or record.get("scaleFactor") != expected_scale or record.get("offset") != expected_offset
                or record.get("productionStatus") != "approved" or record.get("reviewStatus") != "approved"
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

    active_wnba = {entry.get("canonicalEntityId") for entry in registry if entry.get("entityType") == "athlete" and entry.get("league") == "wnba" and entry.get("variant") == "portrait" and entry.get("status") == "active"}
    if not set(EXPECTED).issubset(active_wnba):
        errors.append("All eight approved featured WNBA portraits must be active")

    print("EdgeBoard WNBA Featured Illustration Production Batch 1")
    print(f"Physical: {sum((ROOT / item['assetPath']).is_file() for item in exports)}/8")
    print(f"Human approved: {len(exports) if provenance.get('humanVisualApproval') == 'approved' else 0}/8")
    print(f"Featured registry active: {len(set(EXPECTED) & active_wnba)}/8")
    print("Coverage: featured partial · not complete league coverage")
    if unavailable_sources:
        print(f"External source recheck skipped: {len(unavailable_sources)}/8 archives are not distributed with the repository; recorded provenance retained")
    print("Validation:")
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1
    print("PASS · portable production integrity, recorded source provenance, PNG alpha, deterministic exports, canonical mappings, and activation are valid")
    return 0


if __name__ == "__main__":
    sys.exit(main())
