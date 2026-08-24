#!/usr/bin/env python3
"""Create delivery-ready WebP portraits beside source PNGs.

This is an optional development-time tool. Pillow is deliberately not a
runtime dependency of EdgeBoard's standard-library-only sample server.
"""

from __future__ import annotations

import argparse
from pathlib import Path

try:
    from PIL import Image
except ImportError as error:  # pragma: no cover - depends on local tooling
    raise SystemExit(
        "Pillow is required for this development tool. Install it with "
        "`python3 -m pip install Pillow`."
    ) from error


ROOT = Path(__file__).resolve().parents[1]
PORTRAIT_ROOT = ROOT / "assets" / "illustrations"
MAX_SIZE = (640, 800)
WEBP_QUALITY = 82
MAX_BYTES = 180_000


def format_size(size: int) -> str:
    return f"{size / (1024 * 1024):.2f} MiB"


def optimize_portrait(source: Path, *, quality: int) -> tuple[Path, int]:
    destination = source.with_suffix(".webp")
    with Image.open(source) as image:
        image.load()
        image.thumbnail(MAX_SIZE, Image.Resampling.LANCZOS)
        if image.mode not in {"RGB", "RGBA"}:
            image = image.convert("RGBA" if "transparency" in image.info else "RGB")
        selected_quality = quality
        while True:
            image.save(destination, "WEBP", quality=selected_quality, method=4, exact=True)
            if destination.stat().st_size <= MAX_BYTES or selected_quality <= 60:
                break
            selected_quality -= 2
    return destination, selected_quality


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--quality", type=int, default=WEBP_QUALITY, choices=range(1, 101), metavar="1-100")
    args = parser.parse_args()

    sources = sorted(PORTRAIT_ROOT.rglob("*.png"))
    if not sources:
        raise SystemExit(f"No PNG portraits found under {PORTRAIT_ROOT}")

    before = sum(path.stat().st_size for path in sources)
    results = [optimize_portrait(path, quality=args.quality) for path in sources]
    outputs = [path for path, _ in results]
    adjusted = [selected for _, selected in results if selected < args.quality]
    after = sum(path.stat().st_size for path in outputs)
    reduction = (1 - after / before) * 100 if before else 0

    print(f"Optimized {len(outputs)} portraits at WebP quality {args.quality} (max {MAX_SIZE[0]}x{MAX_SIZE[1]}).")
    if adjusted:
        print(f"Adjusted {len(adjusted)} oversized portrait(s) as low as quality {min(adjusted)} to meet the {MAX_BYTES}-byte budget.")
    print(f"Before: {before} bytes ({format_size(before)})")
    print(f"After:  {after} bytes ({format_size(after)})")
    print(f"Saved:  {before - after} bytes ({reduction:.1f}% reduction)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
