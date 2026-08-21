#!/usr/bin/env python3
"""Deterministic Ticket 10 certification check. Never promotes a domain."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from server.mlb_certification import CRITERIA, MlbCertificationService
from server.runtime import build_runtime


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate the MLB domain-certification report.")
    parser.add_argument("--json", action="store_true", help="Print the complete machine-readable report.")
    args = parser.parse_args()
    runtime = build_runtime()
    try:
        report = runtime.mlb_certification.report(public=False)
        for domain in report["domains"]:
            MlbCertificationService.validate_definition(domain)
        valid = bool(report["domains"]) and all(len(domain["criteria"]) == len(CRITERIA) for domain in report["domains"])
        summary = {
            "check": "PASS" if valid else "FAIL",
            "leagueId": "mlb",
            "certificationVersion": report["certificationVersion"],
            "domainCount": len(report["domains"]),
            "stateCounts": report["stateCounts"],
            "ownerActivationReady": report["ownerActivationReady"],
            "automaticPromotion": report["automaticPromotion"],
            "promotion": "requires explicit owner approval",
            "productionBlockerCount": len(report["productionBlockers"]),
        }
        print(json.dumps(report if args.json else summary, indent=2, sort_keys=True))
        return 0 if valid else 1
    finally:
        runtime.close()


if __name__ == "__main__":
    raise SystemExit(main())
