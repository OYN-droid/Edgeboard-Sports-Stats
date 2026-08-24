#!/usr/bin/env python3
"""Validate the human-approved Boxing featured portrait production ingestion."""

from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path

from validate_illustration_style_proof import STYLE_VERSION, extract_json, parse_png


ROOT = Path(__file__).resolve().parents[1]
PROVENANCE_PATH = ROOT / "docs/assets/illustration-style/edgeboard-boxing-featured-portrait-exports.json"
REGISTRY_PATH = ROOT / "src/config/illustration-registry.js"
CANONICAL_PATH = ROOT / "src/data/canonical-entities.js"
FEATURED_PATH = ROOT / "src/config/featured-portrait-coverage.js"
MAX_BYTES = 5_000_000

EXPECTED = {
    "boxing-oleksandr-usyk": ("Oleksandr Usyk", "Heavyweight", "8abb006f217e1f637c7a87816f0ef58fec79fb6057c12c74eb69a6bd0471500d", "29f44c73b7aa27883afbbac54748153b876d679583866017b15868bad0d53730"),
    "boxing-tyson-fury": ("Tyson Fury", "Heavyweight", "8016be800777741f6c127dbe7bad8b2a3a9d7e7f3c4dac60410f5f39fc92d317", "1a2b612c37c95c76d930823fab8f34cecf8d62aa5ac0722f28cca791937f5a1a"),
    "boxing-anthony-joshua": ("Anthony Joshua", "Heavyweight", "0fba5359eec4c890aad17fba3afec8fc1f146af6416f1edcf3dbce264e594729", "5e8b4407c2362c0a025cf8b7fb8e8e08d91df36c00094bf087e1e297ba0b1a7b"),
    "boxing-dmitry-bivol": ("Dmitry Bivol", "Light Heavyweight", "d78d9f6af72bc5a5282768368176280bc12177ecf69dff3a2078bb558bc680e0", "9d98509886714ea0ed91dda6fdbc8dacbd65139e96b66f420b95e2a0b4b09a39"),
    "boxing-canelo-alvarez": ("Canelo Álvarez", "Super Middleweight", "532e0bfec3e01d30a74a190fd422cb85217969a51a2c04cd3b7667168243f0e0", "eeec5a24b5e23928fc4842a6ee1c07aa680f19570ae63591f2ea0e03470c9be7"),
    "boxing-naoya-inoue": ("Naoya Inoue", "Super Bantamweight", "b6d1495fe9562f64f99c01a71064abd10a61a1a26deed2716caf1ca42521fa86", "8389395ebb36f538f61097493f8dc2951b78e70ee726587d3bd16c4a4ab89c0f"),
    "boxing-gervonta-davis": ("Gervonta Davis", "Lightweight", "8d5816dd389b6531767df3a83d248e371ada138a8c102d9729a5bc06485cae2c", "8819f1ce93f064c6fa200a3016158f40ff3ddbff4868b8f2ec00acee26757e17"),
    "boxing-jaron-ennis": ("Jaron Ennis", "Super Welterweight", "289ce601d8c9f742629b21c585c64158185c18109d17c148745cddbcc8eb9b00", "93b2eda530ceb204342beaa855097d09b4fe4ae6598af793ed4b622fcf197da9"),
    "boxing-teofimo-lopez": ("Teofimo Lopez", "Welterweight", "8173ab9e05653805ddc02e05ede87c22c51446fd1bd4d62af977a3efe832f4a4", "4b5a8bd246fe0a881a098f63d791cb8ba8cbc68e9eb329417b4cbe1d4917b5b0"),
    "boxing-jesse-rodriguez": ("Jesse Rodriguez", "Bantamweight", "46d6a8b70ff3a58e74ec907ee95adadeb3856b2e04dec7f4cfa4138b889fa80e", "f29a55db485ff615b51af2d848ddaf791247eb33ef6c3c4110f9bfcea74ce3d4"),
    "boxing-abdullah-mason": ("Abdullah Mason", "Lightweight", "a0668c84f425478432ad82e49283683ed000ef100aea3cfa8acfcb19d363eb9c", "38b5894a0e007d57c67ada4f805a034fa8e3c9d7943e72d64fa2c501facf90df"),
    "boxing-bruce-carrington": ("Bruce Carrington", "Featherweight", "47eb78c806c4a4dd5f225ae542260933ada35a3d9316cce55b8e8f42340b7a38", "f71f5dff35ffcde616c55df6e0e15c1f471e941e60eaed7694c162c2a1de8335"),
    "boxing-shakur-stevenson": ("Shakur Stevenson", "Super Lightweight", "dd7f08e2b5c7504f3d7c1864ef3bde24f177a882fc6481a4c1c03509d9febea6", "6a80cad032da4bc176d1a690235bf5456ef687dbf8bcdd12832e68e729af7bc2"),
}


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> int:
    errors: list[str] = []
    unavailable_sources: list[str] = []
    provenance = json.loads(PROVENANCE_PATH.read_text(encoding="utf-8"))
    records = provenance.get("exports", [])
    registry = extract_json(REGISTRY_PATH, "/* registry-json-start */", "/* registry-json-end */")
    registry_by_entity = {entry.get("canonicalEntityId"): entry for entry in registry if entry.get("variant") == "portrait"}
    canonical_text = CANONICAL_PATH.read_text(encoding="utf-8")
    featured_text = FEATURED_PATH.read_text(encoding="utf-8")

    if len(records) != 13 or {record.get("canonicalEntityId") for record in records} != set(EXPECTED):
        errors.append("Boxing provenance must contain exactly the thirteen authoritative unique boxer identities")
    if (provenance.get("coverageType") != "featured_partial"
            or "13 active" not in provenance.get("coverageDisclosure", "")
            or "not complete boxing coverage" not in provenance.get("coverageDisclosure", "").lower()):
        errors.append("Boxing coverage must remain featured_partial with explicit non-complete disclosure")
    if (provenance.get("styleVersion"), provenance.get("portraitMode"), provenance.get("variant")) != (STYLE_VERSION, "standard", "portrait"):
        errors.append("Boxing style, portrait mode, or variant metadata is invalid")
    if (provenance.get("approval") != "human_approved" or provenance.get("humanVisualApproval") != "approved"
            or provenance.get("activeCount") != 13 or provenance.get("needsRevisionCount") != 0):
        errors.append("Boxing approval or technical result counts are invalid")
    if "decoded-pixel scan" not in provenance.get("sourceAlphaAuditMethod", ""):
        errors.append("Boxing provenance does not record the pixel-level source alpha audit")
    if provenance.get("externalSourceArchiveStatus") != "not_distributed_with_repository":
        errors.append("Boxing provenance must identify external source archives as not distributed with the repository")
    rejected_teofimo = next((record for record in provenance.get("rejectedSources", [])
                             if record.get("canonicalEntityId") == "boxing-teofimo-lopez"), None)
    if (not rejected_teofimo
            or rejected_teofimo.get("sourceSha256") != "d3ae3a9166934ba9e4601ade7aec8d9f1fd765d9697e2518174c576116ee0a11"
            or rejected_teofimo.get("technicalStatus") != "needs_revision"
            or rejected_teofimo.get("visualIsolation") is not False
            or "gradient" not in rejected_teofimo.get("rejectionReason", "").lower()
            or rejected_teofimo.get("supersededBySha256") != EXPECTED["boxing-teofimo-lopez"][2]):
        errors.append("Teofimo Lopez's superseded gradient-backed source rejection history is incomplete")

    for record in records:
        entity_id = record.get("canonicalEntityId", "")
        expected = EXPECTED.get(entity_id)
        if not expected:
            continue
        display_name, division, source_sha, export_sha = expected
        source = Path(record.get("sourcePath", ""))
        expected_asset_path = f"assets/illustrations/fighters/edgeboard--{entity_id}--portrait--v01.png"
        asset = ROOT / expected_asset_path
        if (record.get("displayName"), record.get("division"), record.get("assetPath")) != (display_name, division, expected_asset_path):
            errors.append(f"{entity_id}: identity, division, or target path does not match the approved mapping")
        canonical_pattern = rf'athlete\("{re.escape(entity_id)}",\s*"{re.escape(display_name)}",\s*"boxing",\s*"boxing".*?weightClass:\s*"{re.escape(division)}"'
        if not re.search(canonical_pattern, canonical_text):
            errors.append(f"{entity_id}: canonical boxer identity or division is missing")
        if (not source.name or record.get("sourceSha256") != source_sha
                or not isinstance(record.get("sourceSizeBytes"), int) or record.get("sourceSizeBytes", 0) <= 0):
            errors.append(f"{entity_id}: recorded external source provenance is incomplete")
        if not source.is_file():
            unavailable_sources.append(entity_id)
        elif digest(source) != source_sha or source.stat().st_size != record.get("sourceSizeBytes"):
            errors.append(f"{entity_id}: available authoritative source size or SHA-256 changed")
        if not record.get("sourcePhysicalAlpha") or not record.get("sourceMeaningfulTransparency"):
            errors.append(f"{entity_id}: source alpha audit metadata is incomplete")

        if not asset.is_file():
            errors.append(f"{entity_id}: approved production portrait is missing")
            continue
        png_errors, metadata = parse_png(asset)
        errors.extend(f"{entity_id}: {error}" for error in png_errors)
        if not all(metadata.get(key) for key in ("rgba", "decoded", "meaningfulTransparency")):
            errors.append(f"{entity_id}: production portrait is not decoded meaningful-alpha RGBA")
        if (asset.stat().st_size != record.get("exportSizeBytes") or asset.stat().st_size > MAX_BYTES
                or digest(asset) != export_sha or record.get("exportSha256") != export_sha):
            errors.append(f"{entity_id}: production size or SHA-256 does not match locked provenance")
        if ((record.get("exportWidth"), record.get("exportHeight"), record.get("exportMode")) != (640, 800, "RGBA")
                or record.get("exportMethod") != "contain_fit_centered_no_crop"
                or record.get("technicalStatus") != "passed" or record.get("productionStatus") != "approved"
                or record.get("reviewStatus") != "approved" or not record.get("registryEligible")):
            errors.append(f"{entity_id}: deterministic export or approval metadata is incomplete")
        entry = registry_by_entity.get(entity_id)
        if not entry or (entry.get("id") != f"art-{entity_id}-portrait" or entry.get("entityType") != "fighter"
                or entry.get("sport") != "boxing" or entry.get("league") != "boxing" or entry.get("weightClass") != division
                or entry.get("assetPath") != Path(expected_asset_path).with_suffix(".webp").as_posix() or entry.get("assetType") != "original_generated"
                or entry.get("portraitMode") != "standard" or entry.get("status") != "active"
                or entry.get("productionStatus") != "approved" or entry.get("reviewStatus") != "approved"
                or not entry.get("registryEligible") or entry.get("styleVersion") != STYLE_VERSION
                or entry.get("altText") != f"{display_name} editorial illustration"):
            errors.append(f"{entity_id}: active exact registry entry does not match approved provenance")

    active_boxing = [entry for entry in registry if entry.get("entityType") == "fighter" and entry.get("league") == "boxing"
                     and entry.get("variant") == "portrait" and entry.get("status") == "active"]
    if {entry.get("canonicalEntityId") for entry in active_boxing} != {entity_id for entity_id, values in EXPECTED.items() if values[3]}:
        errors.append("Active Boxing exact portrait set must contain exactly all thirteen featured fighters")
    if "boxing: 13" not in featured_text or not set(EXPECTED).issubset(set(re.findall(r'id:\s*"([^"]+)"', featured_text))):
        errors.append("Featured coverage must select all thirteen Boxing identities with target thirteen")
    if "Boxing featured exact portraits:" not in featured_text or "not complete boxing coverage" not in featured_text:
        errors.append("Featured coverage summary uses invalid Boxing completion semantics")
    generic = [entry for entry in registry if entry.get("id") == "art-generic-boxing" and entry.get("status") == "active"]
    neutral = [entry for entry in registry if entry.get("id") == "art-placeholder-neutral" and entry.get("status") == "active"]
    if len(generic) != 1 or generic[0].get("assetType") != "generic_sport" or len(neutral) != 1:
        errors.append("Boxing or neutral fallback is missing")
    if any(entry.get("canonicalEntityId") == "boxing-sample-boxer-a" and entry.get("variant") == "portrait" for entry in registry):
        errors.append("Sample Boxer A must remain fallback-driven")
    paths = [entry.get("assetPath") for entry in active_boxing]
    variants = [(entry.get("canonicalEntityId"), entry.get("variant")) for entry in active_boxing]
    if len(paths) != len(set(paths)) or len(variants) != len(set(variants)):
        errors.append("Active Boxing registry contains a duplicate path or canonical variant")

    print("EdgeBoard Boxing Featured Portrait Production Ingestion")
    print("Authoritative sources reviewed: 13")
    print(f"Boxing featured exact portraits: {len(active_boxing)} active")
    print("Needs revision: 0 · prior Teofimo Lopez rejection retained as superseded provenance")
    print("Coverage: featured_partial · not complete boxing coverage")
    if unavailable_sources:
        print(f"External source recheck skipped: {len(unavailable_sources)}/13 archives are not distributed with the repository; recorded provenance retained")
    print("Validation:")
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1
    print("PASS · portable production integrity, recorded sources, alpha audits, deterministic exports, hashes, approvals, canonical identities, registry, and fallbacks are valid")
    return 0


if __name__ == "__main__":
    sys.exit(main())
