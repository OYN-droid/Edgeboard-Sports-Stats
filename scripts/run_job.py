from __future__ import annotations

import argparse
import json
import sys
from dataclasses import asdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from server.runtime import build_runtime


def main() -> None:
    parser = argparse.ArgumentParser(description="Run one EdgeBoard ingestion job.")
    parser.add_argument("job_type")
    parser.add_argument("--league", default="")
    parser.add_argument("--sport", default="")
    parser.add_argument("--date-scope", default="")
    args = parser.parse_args()
    runtime = build_runtime()
    try:
        result = runtime.ingestion.run(
            args.job_type, league_id=args.league, sport_id=args.sport, date_scope=args.date_scope,
        )
        print(json.dumps(asdict(result), indent=2))
        if result.status == "failed":
            raise SystemExit(1)
    finally:
        runtime.close()


if __name__ == "__main__":
    main()
