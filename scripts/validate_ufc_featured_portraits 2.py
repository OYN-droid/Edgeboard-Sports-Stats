#!/usr/bin/env python3
"""Validate the five newly approved UFC portraits and six-fighter featured set."""

from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path

from validate_illustration_style_proof import STYLE_VERSION, extract_json, parse_png


ROOT = Path(__file__).resolve().parents[1]
PROVENANCE_PATH = ROOT / "docs/assets/illustration-style/edgeboard-ufc-featured-portrait-exports.json"
REGISTRY_PATH = ROOT / "src/config/illustration-registry.js"
CANONICAL_PATH = ROOT / "src/data/canonical-entities.js"
FEATURED_PATH = ROOT / "src/config/featured-portrait-coverage.js"
REFERENCE_PATH = ROOT / "docs/assets/illustration-style/edgeboard-illustration-style-v1-reference.png"
REFERENCE_SHA256 = "223ff10408d12be286a9311d5c9d4f8dce73a7b6f8881bc034737b635ced8ae6"
ISLAM_PATH = ROOT / "assets/illustrations/proof/edgeboard--ufc-islam-makhachev--portrait--v01.png"
ISLAM_SHA256 = "5086f7b8b858107ad08bfd60c22ac3b5199298bedf32d6d66e796593e481a3f3"
EXPECTED = {
    "ufc-joshua-van": ("Joshua Van", "Flyweight", "3fe9423d17414ab0adc1f9b00da0ef1e44804d44d83a2841a2eeb43985026dee", "ceb4c220341e91634b24924dbcf8909294657db42b8ace9f2d9f944579de2125"),
    "ufc-carlos-prates": ("Carlos Prates", "Welterweight", "f55b3e5110449cdca8ee44b9afbee437b3624b1660354a5420b8e4b542cf4638", "33fa5166cc320665efb97d948da90e8711e73f59acb3c2851b26ec1c53a1a507"),
    "ufc-michael-morales": ("Michael Morales", "Welterweight", "40c35ab76092bfd60ce7c8957ad2b65c61cc71de79d2b3255f77505f61dda143", "138cc79a513e328ca6c05b8930421497369403311560e96396a931a4a642dbf2"),
    "ufc-israel-adesanya": ("Israel Adesanya", "Middleweight", "487b688d429d582a036ed9faed1120b7b24f183fbd8f3e6d6252b4fef881cafc", "40c553ec8bb09bcefc6aafeafda206d1cfcd001b96a5e3d6e9610a6303451c54"),
    "ufc-alexander-volkanovski": ("Alexander Volkanovski", "Featherweight", "0c4f9d68282a5b600c413e79f015966eb11d32e37502efbaa6109a999ff51caf", "3010bfba8279d8aee69b54c53a4aeb5d386e92136660727d22a30c4d556153e5"),
}
MAX_BYTES = 5_000_000


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> int:
    errors: list[str] = []
    provenance = json.loads(PROVENANCE_PATH.read_text(encoding="utf-8"))
    exports = provenance.get("exports", [])
    registry = extract_json(REGISTRY_PATH, "/* registry-json-start */", "/* registry-json-end */")
    canonical_text = CANONICAL_PATH.read_text(encoding="utf-8")
    featured_text = FEATURED_PATH.read_text(encoding="utf-8")
    registry_by_entity: dict[str, list[dict]] = {}
    for entry in registry:
        registry_by_entity.setdefault(entry.get("canonicalEntityId", ""), []).append(entry)

    if len(exports) != 5 or {item.get("canonicalEntityId") for item in exports} != set(EXPECTED):
        errors.append("UFC provenance must contain exactly the five newly approved unique fighter IDs")
    disclosure = provenance.get("coverageDisclosure", "").lower()
    if (provenance.get("coverageType") != "featured_partial" or "six active" not in disclosure
            or "four modeled divisions" not in disclosure or "not complete" not in disclosure):
        errors.append("UFC coverage must explicitly remain six-fighter, four-division featured partial coverage")
    if provenance.get("approval") != "human_approved" or any(
        provenance.get(key) != "approved"
        for key in ("humanVisualApproval", "productionStatus", "reviewStatus")
    ):
        errors.append("UFC provenance does not record explicit human approval")
    if provenance.get("styleVersion") != STYLE_VERSION or provenance.get("portraitMode") != "standard":
        errors.append("UFC featured style version or portrait mode is invalid")
    if any(value != "approved" for value in provenance.get("reviewMetadata", {}).values()):
        errors.append("UFC human-review metadata is incomplete")
    if not REFERENCE_PATH.is_file() or digest(REFERENCE_PATH) != REFERENCE_SHA256:
        errors.append("Style v1 reference PNG is missing or changed")
    if not ISLAM_PATH.is_file() or digest(ISLAM_PATH) != ISLAM_SHA256:
        errors.append("Existing Islam Makhachev proof portrait is missing or changed")
    else:
        islam_errors, islam_metadata = parse_png(ISLAM_PATH)
        errors.extend(f"ufc-islam-makhachev: {error}" for error in islam_errors)
        if not all(islam_metadata.get(key) for key in ("rgba", "decoded", "meaningfulTransparency")):
            errors.append("Islam Makhachev proof portrait no longer has decoded meaningful-alpha RGBA")

    for record in exports:
        entity_id = record.get("canonicalEntityId", "")
        expected = EXPECTED.get(entity_id)
        if not expected:
            continue
        display_name, weight_class, source_sha, export_sha = expected
        expected_path = f"assets/illustrations/fighters/edgeboard--{entity_id}--portrait--v01.png"
        source = Path(record.get("sourcePath", ""))
        asset = ROOT / record.get("assetPath", "")
        if (record.get("displayName"), record.get("weightClass")) != (display_name, weight_class):
            errors.append(f"{entity_id}: display name or weight class is inconsistent")
        if record.get("assetPath") != expected_path:
            errors.append(f"{entity_id}: production target path is not canonical")
        canonical_pattern = rf'athlete\("{re.escape(entity_id)}",\s*"{re.escape(display_name)}",\s*"mma",\s*"ufc".*?weightClass:\s*"{re.escape(weight_class)}"'
        if not re.search(canonical_pattern, canonical_text):
            errors.append(f"{entity_id}: canonical fighter identity or weight class is missing")

        if not source.is_file():
            errors.append(f"{entity_id}: preserved source is missing")
        else:
            source_errors, source_metadata = parse_png(source)
            errors.extend(f"{entity_id} source: {error}" for error in source_errors if error != "PNG dimensions must be 640x800")
            if (record.get("sourceWidth"), record.get("sourceHeight"), record.get("sourceMode")) != (
                source_metadata.get("width"), source_metadata.get("height"), "RGBA"
            ):
                errors.append(f"{entity_id}: source dimensions or mode do not match provenance")
            if (source.stat().st_size != record.get("sourceSizeBytes") or digest(source) != source_sha
                    or record.get("sourceSha256") != source_sha
                    or not record.get("sourceMeaningfulTransparency")
                    or not all(source_metadata.get(key) for key in ("rgba", "decoded", "meaningfulTransparency"))):
                errors.append(f"{entity_id}: source size, SHA-256, decode, or alpha metadata changed")

        if not asset.is_file():
            errors.append(f"{entity_id}: production portrait is missing")
        else:
            png_errors, metadata = parse_png(asset)
            errors.extend(f"{entity_id}: {error}" for error in png_errors)
            if (metadata.get("width"), metadata.get("height")) != (640, 800):
                errors.append(f"{entity_id}: production portrait is not 640x800")
            if not all(metadata.get(key) for key in ("rgba", "decoded", "meaningfulTransparency")):
                errors.append(f"{entity_id}: production portrait is not decoded meaningful-alpha RGBA")
            if (asset.stat().st_size != record.get("exportSizeBytes") or asset.stat().st_size > MAX_BYTES
                    or digest(asset) != export_sha or record.get("exportSha256") != export_sha):
                errors.append(f"{entity_id}: production size or SHA-256 does not match provenance")
        if ((record.get("exportWidth"), record.get("exportHeight"), record.get("exportMode")) != (640, 800, "RGBA")
                or not record.get("exportMeaningfulTransparency")
                or record.get("scale") != 0.570409982 or record.get("offsetX") != 0.0
                or record.get("offsetY") != 0.143 or record.get("exportMethod") != "contain_fit_centered_no_crop"
                or record.get("productionStatus") != "approved" or record.get("reviewStatus") != "approved"
                or not record.get("registryEligible")):
            errors.append(f"{entity_id}: deterministic export or approval metadata is incomplete")

        exact = [entry for entry in registry_by_entity.get(entity_id, []) if entry.get("variant") == "portrait"]
        if len(exact) != 1:
            errors.append(f"{entity_id}: expected exactly one canonical portrait registry entry")
        else:
            entry = exact[0]
            if (entry.get("id") != f"art-{entity_id}-portrait" or entry.get("assetPath") != expected_path
                    or entry.get("entityType") != "fighter" or entry.get("league") != "ufc"
                    or entry.get("weightClass") != weight_class or entry.get("status") != "active"
                    or entry.get("assetType") != "original_generated" or entry.get("portraitMode") != "standard"
                    or entry.get("styleVersion") != STYLE_VERSION or entry.get("styleRole") != "showcase_production_portrait"
                    or entry.get("productionStatus") != "approved" or entry.get("reviewStatus") != "approved"
                    or not entry.get("registryEligible") or entry.get("altText") != f"{display_name} editorial illustration"):
                errors.append(f"{entity_id}: active registry metadata does not match the approved export")

    active_ufc = {
        entry.get("canonicalEntityId") for entry in registry
        if entry.get("entityType") == "fighter" and entry.get("league") == "ufc"
        and entry.get("variant") == "portrait" and entry.get("status") == "active"
    }
    expected_active = set(EXPECTED) | {"ufc-islam-makhachev"}
    if active_ufc != expected_active:
        errors.append("The active featured UFC portrait set must contain exactly the six intended fighters")
    if 'ufc: 6' not in featured_text or not expected_active.issubset(set(re.findall(r'id:\s*"([^"]+)"', featured_text))):
        errors.append("Featured portrait coverage does not select all six UFC fighters with a target of six")

    generic = [entry for entry in registry if entry.get("id") == "art-generic-mma"]
    neutral = [entry for entry in registry if entry.get("id") == "art-placeholder-neutral"]
    if len(generic) != 1 or generic[0].get("status") != "active" or generic[0].get("assetType") != "generic_sport":
        errors.append("The active generic MMA fallback is missing or invalid")
    if len(neutral) != 1 or neutral[0].get("status") != "active" or neutral[0].get("assetType") != "placeholder":
        errors.append("The active neutral fallback is missing or invalid")
    if any(entry.get("canonicalEntityId") == "ufc-sample-fighter-a" and entry.get("variant") == "portrait" for entry in registry):
        errors.append("Sample Fighter A must remain on the generic MMA fallback")

    active_entries = [
        entry for entry in registry
        if entry.get("status") == "active" and entry.get("canonicalEntityId") in expected_active
    ]
    paths = [entry.get("assetPath") for entry in active_entries if entry.get("assetPath")]
    variants = [(entry.get("canonicalEntityId"), entry.get("variant")) for entry in active_entries]
    if len(paths) != len(set(paths)):
        errors.append("Active illustration registry contains a duplicate asset path")
    if len(variants) != len(set(variants)):
        errors.append("Active illustration registry contains a duplicate canonical entity/variant")

    print("EdgeBoard UFC Featured Illustration Production Batch")
    print(f"New physical exports: {sum((ROOT / item['assetPath']).is_file() for item in exports)}/5")
    print(f"Human approved: {len(exports) if provenance.get('humanVisualApproval') == 'approved' else 0}/5")
    print(f"Featured registry active: {len(expected_active & active_ufc)}/6")
    print("Division coverage: Flyweight, Featherweight, Welterweight, Middleweight")
    print("Coverage: featured partial · 6 fighters · not complete UFC roster coverage")
    print("Validation:")
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1
    print("PASS · sources, deterministic PNG exports, alpha, hashes, provenance, canonical mappings, approvals, active registry entries, and fallback coverage are valid")
    return 0


if __name__ == "__main__":
    sys.exit(main())
