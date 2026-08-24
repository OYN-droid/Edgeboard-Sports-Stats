#!/usr/bin/env python3
"""Validate Illustration Style Proof metadata and future source PNG assets."""

from __future__ import annotations

import json
import hashlib
import re
import struct
import sys
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXPECTED_COUNT = 6
EXPECTED_WIDTH = 640
EXPECTED_HEIGHT = 800
MAX_BYTES = 5_000_000
MAX_DELIVERY_BYTES = 180_000
STYLE_VERSION = "edgeboard-illustration-v1"
SHOWCASE_FILES = (
    "mlb-illustration-showcase-batch-1.js", "basketball-illustration-showcase-batch-2.js",
    "combat-illustration-showcase-batch-3.js", "football-hockey-illustration-showcase-batch-4.js",
    "soccer-illustration-showcase-batch-5.js", "motorsports-illustration-showcase-batch-6.js",
    "tennis-golf-illustration-showcase-batch-7.js",
)


def extract_json(path: Path, start: str, end: str):
    text = path.read_text(encoding="utf-8")
    return json.loads(text.split(start, 1)[1].split(end, 1)[0])


PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


def _paeth(left: int, above: int, upper_left: int) -> int:
    estimate = left + above - upper_left
    distances = (abs(estimate - left), abs(estimate - above), abs(estimate - upper_left))
    return (left, above, upper_left)[distances.index(min(distances))]


def parse_png(path: Path) -> tuple[list[str], dict[str, object]]:
    errors: list[str] = []
    try:
        data = path.read_bytes()
    except OSError as exc:
        return [f"PNG could not be read: {exc}"], {}
    if not data.startswith(PNG_SIGNATURE):
        return ["invalid PNG signature"], {}

    offset = len(PNG_SIGNATURE)
    ihdr: tuple[int, int, int, int, int, int, int] | None = None
    idat: list[bytes] = []
    saw_iend = False
    chunk_index = 0
    while offset < len(data):
        if offset + 12 > len(data):
            errors.append("truncated PNG chunk")
            break
        length = struct.unpack(">I", data[offset:offset + 4])[0]
        chunk_type = data[offset + 4:offset + 8]
        chunk_end = offset + 12 + length
        if chunk_end > len(data):
            errors.append("PNG chunk length exceeds file size")
            break
        payload = data[offset + 8:offset + 8 + length]
        expected_crc = struct.unpack(">I", data[offset + 8 + length:chunk_end])[0]
        actual_crc = zlib.crc32(chunk_type + payload) & 0xFFFFFFFF
        if actual_crc != expected_crc:
            errors.append(f"invalid PNG CRC for {chunk_type.decode('ascii', 'replace')} chunk")
        if chunk_index == 0 and chunk_type != b"IHDR":
            errors.append("IHDR must be the first PNG chunk")
        if chunk_type == b"IHDR":
            if ihdr is not None or length != 13:
                errors.append("PNG must contain one valid IHDR chunk")
            else:
                ihdr = struct.unpack(">IIBBBBB", payload)
        elif chunk_type == b"IDAT":
            idat.append(payload)
        elif chunk_type == b"IEND":
            if length != 0:
                errors.append("IEND chunk must be empty")
            saw_iend = True
            offset = chunk_end
            if offset != len(data):
                errors.append("unexpected data follows PNG IEND")
            break
        offset = chunk_end
        chunk_index += 1

    if ihdr is None:
        errors.append("PNG IHDR is missing")
        return errors, {}
    if not idat:
        errors.append("PNG pixel data is missing")
    if not saw_iend:
        errors.append("PNG IEND is missing")

    width, height, bit_depth, color_type, compression, filter_method, interlace = ihdr
    if (width, height) != (EXPECTED_WIDTH, EXPECTED_HEIGHT):
        errors.append(f"PNG dimensions must be {EXPECTED_WIDTH}x{EXPECTED_HEIGHT}")
    if bit_depth != 8 or color_type != 6:
        errors.append("proof PNG must use 8-bit RGBA color data")
    if compression != 0 or filter_method != 0 or interlace != 0:
        errors.append("proof PNG must use standard compression/filtering and non-interlaced rows")

    meaningful_transparency = False
    decoded = False
    if idat and bit_depth == 8 and color_type == 6 and compression == 0 and filter_method == 0 and interlace == 0:
        stride = width * 4
        expected_decoded = height * (stride + 1)
        try:
            decoder = zlib.decompressobj()
            raw = decoder.decompress(b"".join(idat), expected_decoded + 1)
            if len(raw) > expected_decoded or decoder.unconsumed_tail or not decoder.eof:
                raise ValueError("decoded PNG data exceeds or does not match the expected canvas")
            if len(raw) != expected_decoded:
                raise ValueError("decoded PNG row data has an invalid length")
            previous = bytearray(stride)
            transparent_pixels = 0
            fully_transparent_pixels = 0
            cursor = 0
            for _ in range(height):
                filter_type = raw[cursor]
                cursor += 1
                encoded = raw[cursor:cursor + stride]
                cursor += stride
                if filter_type > 4:
                    raise ValueError(f"unsupported PNG row filter {filter_type}")
                reconstructed = bytearray(stride)
                for index, value in enumerate(encoded):
                    left = reconstructed[index - 4] if index >= 4 else 0
                    above = previous[index]
                    upper_left = previous[index - 4] if index >= 4 else 0
                    predictor = (0, left, above, (left + above) // 2, _paeth(left, above, upper_left))[filter_type]
                    reconstructed[index] = (value + predictor) & 0xFF
                alphas = reconstructed[3::4]
                transparent_pixels += sum(alpha < 250 for alpha in alphas)
                fully_transparent_pixels += sum(alpha == 0 for alpha in alphas)
                previous = reconstructed
            minimum_transparent_pixels = max(1, width * height // 100)
            meaningful_transparency = transparent_pixels >= minimum_transparent_pixels and fully_transparent_pixels > 0
            decoded = True
            if not meaningful_transparency:
                errors.append("PNG lacks meaningful alpha transparency and appears to have an opaque rectangular background")
        except (ValueError, zlib.error) as exc:
            errors.append(f"PNG pixel decoding failed: {exc}")

    return errors, {
        "width": width, "height": height, "rgba": bit_depth == 8 and color_type == 6,
        "decoded": decoded, "meaningfulTransparency": meaningful_transparency,
    }


def main() -> int:
    manifest_path = ROOT / "tools/illustration-qa/illustration-style-proof-batch.js"
    registry_path = ROOT / "src/config/illustration-registry.js"
    canonical_path = ROOT / "src/data/canonical-entities.js"
    manifest = extract_json(manifest_path, "/* illustration-proof-json-start */", "/* illustration-proof-json-end */")
    manifest_text = manifest_path.read_text(encoding="utf-8")
    registry = extract_json(registry_path, "/* registry-json-start */", "/* registry-json-end */")
    style_config_path = ROOT / "src/config/illustration-style-v1.js"
    style_config_text = style_config_path.read_text(encoding="utf-8")
    style_reference = extract_json(style_config_path, "/* style-reference-json-start */", "/* style-reference-json-end */")
    style_reference_record = json.loads((ROOT / "docs/assets/illustration-style/edgeboard-illustration-style-v1-reference.json").read_text(encoding="utf-8"))
    export_record = json.loads((ROOT / "docs/assets/illustration-style/edgeboard-illustration-proof-exports.json").read_text(encoding="utf-8"))
    exports_by_id = {entry["canonicalEntityId"]: entry for entry in export_record.get("exports", [])}
    canonical_text = canonical_path.read_text(encoding="utf-8")
    canonical_ids = set(re.findall(r'(?:athlete|team)\("([^"]+)"', canonical_text))
    registry_by_id = {entry["id"]: entry for entry in registry}
    errors: list[str] = []
    warnings: list[str] = []
    entity_ids: set[str] = set()
    asset_paths: set[str] = set()
    allowed_asset_paths: set[str] = set()
    inspected = 0

    for required_brief_token in (
        "AARON_JUDGE_PROOF_PRODUCTION_BRIEF", "mlb-aaron-judge",
        "assets/illustrations/proof/edgeboard--mlb-aaron-judge--portrait--v01.png",
        "EdgeBoard Illustration Style v1", 'productionStatus: "submitted"', 'reviewStatus: "needs_review"',
    ):
        if required_brief_token not in manifest_text:
            errors.append(f"Aaron Judge production brief is missing required contract: {required_brief_token}")
    for required_brief_token in (
        "STEPHEN_CURRY_PROOF_PRODUCTION_BRIEF", "nba-stephen-curry",
        "assets/illustrations/proof/edgeboard--nba-stephen-curry--portrait--v01.png",
        "EdgeBoard Illustration Style v1", "art-team-gsw",
    ):
        if required_brief_token not in manifest_text:
            errors.append(f"Stephen Curry production brief is missing required contract: {required_brief_token}")
    for required_brief_token in (
        "ISLAM_MAKHACHEV_PROOF_PRODUCTION_BRIEF", "ufc-islam-makhachev",
        "assets/illustrations/proof/edgeboard--ufc-islam-makhachev--portrait--v01.png",
        "EdgeBoard Illustration Style v1", "art-weight-mma-welterweight",
    ):
        if required_brief_token not in manifest_text:
            errors.append(f"Islam Makhachev production brief is missing required contract: {required_brief_token}")
    for required_brief_token in (
        "AUSTON_MATTHEWS_PROOF_PRODUCTION_BRIEF", "nhl-auston-matthews",
        "assets/illustrations/proof/edgeboard--nhl-auston-matthews--portrait--v01.png",
        "EdgeBoard Illustration Style v1", "art-team-tor",
    ):
        if required_brief_token not in manifest_text:
            errors.append(f"Auston Matthews production brief is missing required contract: {required_brief_token}")
    for required_brief_token in (
        "LANDO_NORRIS_PROOF_PRODUCTION_BRIEF", "f1-lando-norris",
        "assets/illustrations/proof/edgeboard--f1-lando-norris--portrait--v01.png",
        "EdgeBoard Illustration Style v1", "art-team-mcl",
    ):
        if required_brief_token not in manifest_text:
            errors.append(f"Lando Norris production brief is missing required contract: {required_brief_token}")
    for required_brief_token in (
        "COCO_GAUFF_PROOF_PRODUCTION_BRIEF", "wta-coco-gauff",
        "assets/illustrations/proof/edgeboard--wta-coco-gauff--portrait--v01.png",
        "EdgeBoard Illustration Style v1", "art-tour-wta",
    ):
        if required_brief_token not in manifest_text:
            errors.append(f"Coco Gauff production brief is missing required contract: {required_brief_token}")
    for consolidation_token in (
        "ILLUSTRATION_PROOF_PRODUCTION_SPEC", "ILLUSTRATION_PROOF_HUMAN_REVIEW_CHECKLIST",
        "ILLUSTRATION_PROOF_PRODUCTION_BRIEFS", "collection_consistency",
    ):
        if consolidation_token not in manifest_text:
            errors.append(f"proof-batch consolidation contract is missing: {consolidation_token}")
    if manifest_text.count("productionPrompt:") != EXPECTED_COUNT:
        errors.append(f"expected exactly {EXPECTED_COUNT} final production prompts")

    reference_path = ROOT / style_reference["assetPath"]
    if style_reference.get("assetType") != "style_reference" or style_reference.get("productionAsset") or style_reference.get("fallbackEligible") or style_reference.get("registryEligible"):
        errors.append("approved composite classification permits production, fallback, or registry use")
    if any(entry.get("assetPath") == style_reference["assetPath"] for entry in registry):
        errors.append("approved composite is incorrectly present in the active illustration registry")
    if reference_path.exists() and style_reference.get("ingestionStatus") != "ingested":
        errors.append("style-reference image exists but metadata is not marked ingested")
    if not reference_path.exists():
        if style_reference.get("ingestionStatus") != "awaiting_source_file":
            errors.append("style-reference image is missing without an awaiting_source_file status")
        warnings.append(f"style reference source file must be attached byte-for-byte: {style_reference['assetPath']}")
    else:
        reference_bytes = reference_path.read_bytes()
        digest = hashlib.sha256(reference_bytes).hexdigest()
        if len(reference_bytes) != style_reference.get("fileSizeBytes") or digest != style_reference.get("sha256"):
            errors.append("style-reference bytes do not match recorded size or SHA-256")
        if reference_bytes[:8] != b"\x89PNG\r\n\x1a\n" or reference_bytes[12:16] != b"IHDR":
            errors.append("style-reference file is not a structurally recognizable PNG")
        else:
            width, height = struct.unpack(">II", reference_bytes[16:24])
            if width != style_reference.get("width") or height != style_reference.get("height"):
                errors.append("style-reference PNG dimensions do not match recorded metadata")
        if style_reference_record.get("repositoryPath") != style_reference["assetPath"] or style_reference_record.get("ingestionStatus") != "ingested":
            errors.append("style-reference sidecar does not record the ingested repository path")
        for field in ("assetType", "fileSizeBytes", "width", "height", "sha256", "productionAsset", "fallbackEligible", "registryEligible"):
            if style_reference_record.get(field) != style_reference.get(field):
                errors.append(f"style-reference config and sidecar disagree on {field}")
    if STYLE_VERSION not in style_config_text or "human_approved" not in style_config_text:
        errors.append("Style v1 identifier or human approval is missing")
    for filename in SHOWCASE_FILES:
        showcase_text = (ROOT / "tools/illustration-qa" / filename).read_text(encoding="utf-8")
        if "EDGEBOARD_ILLUSTRATION_STYLE_VERSION" not in showcase_text or "EDGEBOARD_ILLUSTRATION_V1_PROMPT" not in showcase_text:
            errors.append(f"showcase manifest does not inherit Style v1: {filename}")

    if len(manifest) != EXPECTED_COUNT:
        errors.append(f"expected {EXPECTED_COUNT} proof slots; found {len(manifest)}")
    if (export_record.get("styleVersion") != STYLE_VERSION
            or export_record.get("productionStatus") != "approved"
            or export_record.get("reviewStatus") != "approved"
            or export_record.get("humanVisualApproval") != "approved"
            or export_record.get("styleRole") != "production_proof_exemplar"):
        errors.append("proof export record must retain Style v1 human-approved exemplar state")
    if len(exports_by_id) != EXPECTED_COUNT:
        errors.append(f"expected {EXPECTED_COUNT} proof export provenance records")
    for slot in manifest:
        entity_id = slot.get("canonicalEntityId", "")
        asset_path = slot.get("assetPath", "")
        delivery_path = str(Path(asset_path).with_suffix(".webp"))
        if entity_id in entity_ids:
            errors.append(f"duplicate canonical identity: {entity_id}")
        entity_ids.add(entity_id)
        if entity_id not in canonical_ids:
            errors.append(f"canonical identity is not seeded: {entity_id}")
        if asset_path in asset_paths:
            errors.append(f"duplicate asset path: {asset_path}")
        asset_paths.add(asset_path)
        allowed_asset_paths.add(asset_path)
        expected_name = f"edgeboard--{entity_id}--portrait--v01.png"
        if Path(asset_path).name != expected_name or Path(asset_path).parent.as_posix() != "assets/illustrations/proof":
            errors.append(f"locked path mismatch for {entity_id}: {asset_path}")
        fallback = registry_by_id.get(slot.get("fallbackRegistryId"))
        if not fallback or fallback.get("status") != "active":
            errors.append(f"active fallback is missing for {entity_id}")
        exact = [entry for entry in registry if entry.get("canonicalEntityId") == entity_id and entry.get("variant") == "portrait"]
        if len(exact) != 1:
            errors.append(f"approved proof identity must have exactly one active portrait: {entity_id}")
        elif (exact[0].get("assetPath") != delivery_path or exact[0].get("status") != "active"
              or exact[0].get("styleVersion") != STYLE_VERSION
              or exact[0].get("styleRole") != "production_proof_exemplar"):
            errors.append(f"active proof registry entry does not match approved exemplar metadata: {entity_id}")
        if slot.get("productionStatus") != "approved" or slot.get("reviewStatus") != "approved":
            errors.append(f"proof export does not retain approved state: {entity_id}")

        provenance = exports_by_id.get(entity_id, {})
        if provenance.get("assetPath") != asset_path:
            errors.append(f"proof export provenance path mismatch for {entity_id}")
        source_path = Path(provenance.get("sourcePath", ""))
        if source_path.is_file():
            source_digest = hashlib.sha256(source_path.read_bytes()).hexdigest()
            if source_digest != provenance.get("sourceSha256"):
                errors.append(f"original source hash changed for {entity_id}")

        candidate = ROOT / asset_path
        if not candidate.exists():
            errors.append(f"approved proof asset is missing: {entity_id} ({asset_path})")
            continue
        inspected += 1
        if candidate.suffix.lower() != ".png":
            errors.append(f"unsupported file type for {entity_id}: {candidate.suffix}")
            continue
        size = candidate.stat().st_size
        if size <= 0 or size > MAX_BYTES:
            errors.append(f"file size outside 1..{MAX_BYTES} bytes for {entity_id}: {size}")
        png_errors, _ = parse_png(candidate)
        errors.extend(f"{entity_id}: {error}" for error in png_errors)
        if hashlib.sha256(candidate.read_bytes()).hexdigest() != provenance.get("exportSha256"):
            errors.append(f"proof export hash does not match provenance for {entity_id}")

        delivery_candidate = ROOT / delivery_path
        if not delivery_candidate.is_file():
            errors.append(f"optimized proof delivery asset is missing: {entity_id} ({delivery_path})")
        else:
            delivery_bytes = delivery_candidate.read_bytes()
            if len(delivery_bytes) > MAX_DELIVERY_BYTES:
                errors.append(f"optimized proof delivery asset exceeds {MAX_DELIVERY_BYTES} bytes: {entity_id}")
            if not (delivery_bytes.startswith(b"RIFF") and delivery_bytes[8:12] == b"WEBP"):
                errors.append(f"optimized proof delivery asset is not WebP: {entity_id}")
            allowed_asset_paths.add(delivery_path)

    proof_dir = ROOT / "assets/illustrations/proof"
    if proof_dir.exists():
        for candidate in proof_dir.iterdir():
            relative = candidate.relative_to(ROOT).as_posix()
            if candidate.is_file() and relative not in allowed_asset_paths:
                errors.append(f"orphan proof asset is not mapped by canonical identity: {relative}")

    print("EdgeBoard Illustration Style Proof · Asset Ingestion Readiness")
    print(f"Proof slots: {len(manifest)}/{EXPECTED_COUNT} · canonical IDs: {len(entity_ids)}/{EXPECTED_COUNT} · unique paths: {len(asset_paths)}/{EXPECTED_COUNT}")
    print(f"Physical files: {inspected}/{EXPECTED_COUNT} · technically valid: {inspected if not errors else 'see validation'}/{EXPECTED_COUNT}")
    print(f"Style contract: {STYLE_VERSION} · human approved · reference binary: {'present' if reference_path.exists() else 'awaiting source file'}")
    print(f"Export review state: human approved {inspected}/{EXPECTED_COUNT} · active registry portraits {sum(1 for slot in manifest if any(entry.get('canonicalEntityId') == slot.get('canonicalEntityId') and entry.get('variant') == 'portrait' and entry.get('status') == 'active' for entry in registry))}/{EXPECTED_COUNT}")
    print("Consolidation: 6/6 final prompts · one shared production spec · one shared human-review checklist")
    print(f"Specification: lossless PNG · 8-bit RGBA · {EXPECTED_WIDTH}x{EXPECTED_HEIGHT} · meaningful alpha transparency · <= {MAX_BYTES} bytes")
    print("Identity mapping: manifest-only; filenames are validated after canonical assignment and never used to infer identity")
    print("Review gate: filesystem validation -> needs_review -> manual style QA -> approved -> active registry")
    if warnings:
        print("\nAsset status:")
        for warning in warnings:
            print(f"- {warning}")
    print("\nValidation:")
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1
    print("PASS · six human-approved Style v1 proof exemplars, canonical mappings, fallbacks, paths, hashes, and activation controls are valid")
    print("PNG integrity, decoding, dimensions, alpha transparency, export hashes, and active registry mappings passed; subjective approval is recorded from the explicit human review.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
