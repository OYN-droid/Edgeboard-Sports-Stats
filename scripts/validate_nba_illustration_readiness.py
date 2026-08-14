#!/usr/bin/env python3
"""Validate the NBA illustration production-readiness manifest without ingesting art."""

from __future__ import annotations

import json
import re
import sys
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "src/config/basketball-illustration-showcase-batch-2.js"
CANONICAL = ROOT / "src/data/canonical-entities.js"
REGISTRY = ROOT / "src/config/illustration-registry.js"
SHOWCASE = ROOT / "src/config/showcase-illustration-registry.js"
CURRY_ID = "nba-stephen-curry"
CURRY_PATH = "assets/illustrations/proof/edgeboard--nba-stephen-curry--portrait--v01.png"
STYLE_VERSION = "edgeboard-illustration-v1"
APPROVED_BATCH_1_IDS = {
    "nba-jayson-tatum", "nba-nikola-jokic", "nba-anthony-edwards",
    "nba-victor-wembanyama", "nba-jalen-brunson", "nba-keegan-murray",
}
APPROVED_BATCH_2_IDS = {
    "nba-jalen-johnson", "nba-julius-randle", "nba-brandon-miller",
    "nba-donovan-mitchell", "nba-cooper-flagg", "nba-bam-adebayo",
}
APPROVED_BATCH_3_IDS = {
    "nba-josh-giddey", "nba-cade-cunningham", "nba-kevin-durant",
    "nba-kawhi-leonard", "nba-ja-morant", "nba-paolo-banchero",
}
APPROVED_BATCH_4_IDS = {
    "nba-tyrese-haliburton", "nba-luka-doncic", "nba-tyler-herro",
    "nba-zion-williamson", "nba-shai-gilgeous-alexander", "nba-devin-booker",
}
APPROVED_BATCH_5_IDS = {
    "nba-tyrese-maxey", "nba-damian-lillard", "nba-scottie-barnes",
    "nba-lauri-markkanen", "nba-trae-young",
}
EXPECTED_ACTIVE_IDS = APPROVED_BATCH_1_IDS | APPROVED_BATCH_2_IDS | APPROVED_BATCH_3_IDS | APPROVED_BATCH_4_IDS | APPROVED_BATCH_5_IDS | {CURRY_ID}


def extract_json(path: Path, start: str, end: str):
    text = path.read_text(encoding="utf-8")
    match = re.search(rf"{re.escape(start)}\s*(\[.*?\])\s*{re.escape(end)}", text, re.DOTALL)
    if not match:
        raise ValueError(f"missing JSON marker block: {path.relative_to(ROOT)} / {start}")
    return json.loads(match.group(1))


def main() -> int:
    text = MANIFEST.read_text(encoding="utf-8")
    slots = [slot for slot in extract_json(MANIFEST, "/* basketball-showcase-json-start */", "/* basketball-showcase-json-end */") if slot["leagueId"] == "nba"]
    batches = extract_json(MANIFEST, "/* nba-production-batches-json-start */", "/* nba-production-batches-json-end */")
    registry = extract_json(REGISTRY, "/* registry-json-start */", "/* registry-json-end */")
    assignments = extract_json(SHOWCASE, "/* assignments-json-start */", "/* assignments-json-end */")
    canonical_text = CANONICAL.read_text(encoding="utf-8")
    athletes = {
        athlete_id: (league_id, team_id)
        for athlete_id, league_id, team_id in re.findall(
            r'athlete\("([^"]+)",\s*"[^"]+",\s*"basketball",\s*"(nba|wnba)",\s*"([^"]+)"', canonical_text
        )
    }
    teams = {
        team_id: league_id
        for team_id, league_id in re.findall(
            r'team\("([^"]+)",\s*"[^"]+",\s*"basketball",\s*"(nba|wnba)"', canonical_text
        )
    }
    errors: list[str] = []
    athlete_ids = [slot["canonicalAthleteId"] for slot in slots]
    team_ids = [slot["canonicalTeamId"] for slot in slots]
    active_nba = {
        item["canonicalEntityId"]: item
        for item in registry
        if item.get("entityType") == "athlete" and item.get("league") == "nba" and item.get("variant") == "portrait" and item.get("status") == "active"
    }
    registry_ids = {item["id"] for item in registry}
    assigned_pairs = {
        (item["canonicalEntityId"], item["teamId"])
        for item in assignments
        if item.get("active") and item.get("league") == "nba" and item.get("showcaseRole") == "team_representative"
    }
    manifest_pairs = {(slot["canonicalAthleteId"], slot["canonicalTeamId"]) for slot in slots}
    batched_ids = [athlete_id for batch in batches for athlete_id in batch["athleteIds"]]
    expected_paths = {
        slot["canonicalAthleteId"]: CURRY_PATH if slot["canonicalAthleteId"] == CURRY_ID else f"assets/illustrations/nba/edgeboard--{slot['canonicalAthleteId']}--portrait--v01.png"
        for slot in slots
    }

    if len(slots) != 30:
        errors.append(f"expected 30 NBA representatives; found {len(slots)}")
    if len(set(athlete_ids)) != 30:
        errors.append("NBA representative athlete IDs are not unique")
    if len(set(team_ids)) != 30:
        errors.append("NBA representative team IDs are not unique")
    if len([team for team, league in teams.items() if league == "nba"]) != 30:
        errors.append("canonical registry does not contain exactly 30 NBA teams")
    if assigned_pairs != manifest_pairs:
        errors.append("active NBA showcase assignments do not exactly match the NBA manifest")
    if [len(batch["athleteIds"]) for batch in batches] != [6, 6, 6, 6, 5]:
        errors.append("production batch sizes must be 6, 6, 6, 6, 5")
    if len(batched_ids) != 29 or len(set(batched_ids)) != 29 or CURRY_ID in batched_ids:
        errors.append("batches must contain 29 unique pending athletes and exclude Stephen Curry")
    if set(batched_ids) != set(athlete_ids) - {CURRY_ID}:
        errors.append("batch membership does not match the pending NBA roster")
    if set(active_nba) != EXPECTED_ACTIVE_IDS:
        errors.append(f"NBA exact portraits must be Curry plus all twenty-nine approved production-batch athletes; found {sorted(active_nba)}")
    elif active_nba[CURRY_ID].get("assetPath") != CURRY_PATH or active_nba[CURRY_ID].get("styleVersion") != STYLE_VERSION:
        errors.append("Stephen Curry registry path or style version changed")

    for slot in slots:
        athlete_id = slot["canonicalAthleteId"]
        team_id = slot["canonicalTeamId"]
        if athletes.get(athlete_id) != ("nba", team_id):
            errors.append(f"canonical athlete mapping missing or inconsistent: {athlete_id} -> {team_id}")
        if teams.get(team_id) != "nba":
            errors.append(f"canonical NBA team missing: {team_id}")
        if f"art-team-{team_id.lower()}" not in registry_ids:
            errors.append(f"team fallback missing: {team_id}")
        for required in ("displayName", "teamDisplayName", "position", "physicalCharacteristics", "uniformColorContext"):
            if not slot.get(required):
                errors.append(f"prompt source field missing for {athlete_id}: {required}")
        expected = expected_paths[athlete_id]
        if athlete_id == CURRY_ID and CURRY_PATH not in text:
            errors.append("Stephen Curry target path is not represented by the manifest builder")
        if athlete_id != CURRY_ID and not re.fullmatch(r"assets/illustrations/nba/edgeboard--nba-[a-z0-9-]+--portrait--v01\.png", expected):
            errors.append(f"invalid pending target path: {expected}")

    for required_literal in (
        "640 × 800", "8-bit RGBA", "meaningful genuine alpha transparency", "non-photorealistic",
        "No action pose", "no basketball in hand", "no arena", "productionStatus", "awaiting_asset",
    ):
        if required_literal not in text:
            errors.append(f"final prompt/readiness contract is missing: {required_literal}")
    for required_fallback in ("art-generic-basketball", "art-placeholder-neutral"):
        if required_fallback not in registry_ids:
            errors.append(f"shared fallback missing: {required_fallback}")

    print("EdgeBoard NBA Illustration Production Readiness")
    print(f"NBA teams: {len(set(team_ids))}/30")
    print(f"Representatives: {len(slots)}/30 · unique athlete IDs: {len(set(athlete_ids))}/30")
    print(f"Approved exact portraits: {len(active_nba)}/30 · pending: {30 - len(active_nba)}/30")
    print(f"Fallback coverage: {sum(f'art-team-{team.lower()}' in registry_ids for team in team_ids)}/30")
    print(f"Production batches: {len(batches)} · sizes: {', '.join(str(len(batch['athleteIds'])) for batch in batches)}")
    print(f"Production prompts: {len(batched_ids)}/29 · unique target paths: {len(set(expected_paths.values()))}/30")
    print("Stephen Curry: approved, active, excluded from production batches")
    if errors:
        print("\nValidation: FAIL")
        for error in errors:
            print(f"ERROR: {error}")
        return 1
    print("Validation: PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
