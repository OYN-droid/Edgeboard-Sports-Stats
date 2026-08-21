#!/usr/bin/env python3
"""Validate the five human-approved featured NFL Style v1 portraits."""

from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path

from validate_illustration_style_proof import STYLE_VERSION, extract_json, parse_png


ROOT = Path(__file__).resolve().parents[1]
PROVENANCE_PATH = ROOT / "docs/assets/illustration-style/edgeboard-nfl-featured-portrait-exports.json"
MANIFEST_PATH = ROOT / "src/config/football-hockey-illustration-showcase-batch-4.js"
REGISTRY_PATH = ROOT / "src/config/illustration-registry.js"
CANONICAL_PATH = ROOT / "src/data/canonical-entities.js"
REFERENCE_PATH = ROOT / "docs/assets/illustration-style/edgeboard-illustration-style-v1-reference.png"
REFERENCE_SHA256 = "223ff10408d12be286a9311d5c9d4f8dce73a7b6f8881bc034737b635ced8ae6"
EXPECTED = {
    "nfl-patrick-mahomes": ("KC", "15"),
    "nfl-josh-allen": ("BUF", "17"),
    "nfl-justin-jefferson": ("NFL-MIN", "18"),
    "nfl-bijan-robinson": ("NFL-ATL", "7"),
    "nfl-lamar-jackson": ("NFL-BAL", "8"),
}
MAX_BYTES = 5_000_000


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> int:
    errors: list[str] = []
    provenance = json.loads(PROVENANCE_PATH.read_text(encoding="utf-8"))
    exports = provenance.get("exports", [])
    slots = extract_json(MANIFEST_PATH, "/* football-hockey-showcase-json-start */", "/* football-hockey-showcase-json-end */")
    registry = extract_json(REGISTRY_PATH, "/* registry-json-start */", "/* registry-json-end */")
    slot_by_id = {slot["canonicalAthleteId"]: slot for slot in slots if slot.get("leagueId") == "nfl"}
    registry_by_entity: dict[str, list[dict]] = {}
    for entry in registry:
        registry_by_entity.setdefault(entry.get("canonicalEntityId"), []).append(entry)
    canonical_text = CANONICAL_PATH.read_text(encoding="utf-8")
    canonical = dict(re.findall(r'athlete\("([^"]+)",\s*"[^"]+",\s*"american-football",\s*"nfl",\s*"([^"]+)"', canonical_text))

    export_ids = {record.get("canonicalEntityId") for record in exports}
    if len(exports) != 5 or export_ids != set(EXPECTED):
        errors.append("NFL featured provenance must contain exactly the five expected unique athlete IDs")
    disclosure = provenance.get("coverageDisclosure", "").lower()
    if provenance.get("coverageType") != "featured_partial" or "5 of 32" not in disclosure or "not complete" not in disclosure:
        errors.append("NFL production coverage must explicitly remain partial 5-of-32 featured coverage")
    if any(provenance.get(key) != "approved" for key in ("productionStatus", "reviewStatus", "humanVisualApproval")):
        errors.append("NFL featured provenance does not record explicit human approval")
    if provenance.get("styleVersion") != STYLE_VERSION or provenance.get("portraitMode") != "standard":
        errors.append("NFL featured style version or portrait mode is invalid")
    if any(value != "approved" for value in provenance.get("reviewMetadata", {}).values()):
        errors.append("NFL featured human-review metadata is incomplete")
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
        if not source.is_file():
            errors.append(f"{entity_id}: preserved source is missing")
        else:
            source_errors, source_metadata = parse_png(source)
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
        if (record.get("exportDimensions") != {"width": 640, "height": 800}
                or record.get("scaleFactor") != 0.570409982 or record.get("offset") != {"x": 0.0, "y": 0.143}
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

    active_nfl = {entry.get("canonicalEntityId") for entry in registry if entry.get("entityType") == "athlete" and entry.get("league") == "nfl" and entry.get("variant") == "portrait" and entry.get("status") == "active"}
    if not set(EXPECTED).issubset(active_nfl):
        errors.append("All five approved featured NFL portraits must be active")

    generic_football = [entry for entry in registry if entry.get("id") == "art-generic-football"]
    neutral = [entry for entry in registry if entry.get("id") == "art-placeholder-neutral"]
    if len(generic_football) != 1 or generic_football[0].get("status") != "active" or generic_football[0].get("assetType") != "generic_sport":
        errors.append("The active generic American-football fallback is missing or invalid")
    if len(neutral) != 1 or neutral[0].get("status") != "active" or neutral[0].get("assetType") != "placeholder":
        errors.append("The active neutral fallback is missing or invalid")
    for entity_id, (team_id, _) in EXPECTED.items():
        expected_fallback_id = f"art-team-{team_id.lower()}"
        team_fallback = [entry for entry in registry if entry.get("id") == expected_fallback_id]
        if (len(team_fallback) != 1 or team_fallback[0].get("status") != "active"
                or team_fallback[0].get("assetType") != "team_fallback"
                or team_fallback[0].get("teamId") != team_id):
            errors.append(f"{entity_id}: active team fallback {expected_fallback_id} is missing or invalid")

    print("EdgeBoard NFL Featured Illustration Production Batch 1")
    print(f"Physical: {sum((ROOT / item['assetPath']).is_file() for item in exports)}/5")
    print(f"Human approved: {len(exports) if provenance.get('humanVisualApproval') == 'approved' else 0}/5")
    print(f"Featured registry active: {len(set(EXPECTED) & active_nfl)}/5")
    print("Coverage: 5 of 32 teams · featured partial · not complete league coverage")
    print("Validation:")
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1
    print("PASS · source preservation, PNG integrity, alpha, deterministic export, provenance, canonical mappings, activation, and fallback registry coverage are valid")
    return 0


if __name__ == "__main__":
    sys.exit(main())
