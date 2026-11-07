#!/usr/bin/env python3
"""Check exported pixel art PNGs against the Basic Incremental pixel rules (DESIGN.md 13).

Usage:
  python3 pixel_check.py <file.png | folder> [--scale S] [--max-colors N] [--ink #1a1020]

Errors (must fix):
  - semi-transparent pixels (anti-aliasing, soft glows, opacity fades)
  - image is not clean whole-number scaling of a native grid (when --scale is given)
  - more opaque colours than --max-colors
Warnings (need a reason):
  - orphan pixels: a pixel whose colour matches none of its 8 neighbours (not a white glint)
  - edge pixels that are neither the ink colour nor a light rim/ring (outline gaps)

Exit code 1 if any file has errors. Needs Pillow (pip install pillow).
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from PIL import Image

DEFAULT_INK = "#1a1020"  # INK in src/renderer/src/art/kit.ts


def hex_rgb(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]


def lum(c: tuple[int, ...]) -> float:
    r, g, b = c[:3]
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255


def detect_scale(img: Image.Image) -> int:
    """Largest S such that the image is made of uniform S x S blocks."""
    w, h = img.size
    px = img.load()
    for s in range(min(w, h, 16), 1, -1):
        if w % s or h % s:
            continue
        if all(
            px[x, y] == px[x - x % s, y - y % s] for y in range(h) for x in range(w)
        ):
            return s
    return 1


def check(path: Path, scale: int | None, max_colors: int | None, ink: tuple[int, int, int]) -> int:
    img = Image.open(path).convert("RGBA")
    errors: list[str] = []
    warnings: list[str] = []

    found = detect_scale(img)
    if scale and scale > 1:
        if found % scale:
            errors.append(f"not clean {scale}x scaling (blurred or sub-pixel); detected {found}x")
        s = scale
    else:
        s = found
    native = img.resize((img.width // s, img.height // s), Image.NEAREST) if s > 1 else img
    w, h = native.size
    px = native.load()

    semi = [(x, y) for y in range(h) for x in range(w) if 0 < px[x, y][3] < 255]
    if semi:
        errors.append(f"{len(semi)} semi-transparent pixels, e.g. {semi[:5]} (anti-aliasing / glow / fade)")

    opaque = {px[x, y][:3] for y in range(h) for x in range(w) if px[x, y][3] == 255}
    if max_colors and len(opaque) > max_colors:
        errors.append(f"{len(opaque)} colours > max {max_colors}")

    def solid(x: int, y: int) -> bool:
        return 0 <= x < w and 0 <= y < h and px[x, y][3] == 255

    orphans, gaps = [], []
    for y in range(h):
        for x in range(w):
            if not solid(x, y):
                continue
            c = px[x, y][:3]
            neigh = [
                px[x + dx, y + dy][:3]
                for dx in (-1, 0, 1)
                for dy in (-1, 0, 1)
                if (dx or dy) and solid(x + dx, y + dy)
            ]
            if neigh and c not in neigh and lum(c) < 0.9 and c != ink:
                orphans.append((x, y))
            touches_clear = any(not solid(x + dx, y + dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))
            if touches_clear and c != ink and lum(c) < 0.75:
                gaps.append((x, y))

    if orphans:
        warnings.append(f"{len(orphans)} orphan pixels, e.g. {orphans[:6]}")
    if gaps:
        warnings.append(f"{len(gaps)} edge pixels not ink or light rim (outline gaps?), e.g. {gaps[:6]}")

    status = "FAIL" if errors else ("WARN" if warnings else "OK")
    print(f"[{status}] {path}  native {w}x{h} at {s}x, {len(opaque)} colours")
    for e in errors:
        print(f"   error: {e}")
    for wmsg in warnings:
        print(f"   warn:  {wmsg}")
    return 1 if errors else 0


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("target")
    ap.add_argument("--scale", type=int, help="expected whole-number scale of the export")
    ap.add_argument("--max-colors", type=int, help="maximum opaque colours allowed")
    ap.add_argument("--ink", default=DEFAULT_INK, help="outline ink colour (default kit.ts INK)")
    a = ap.parse_args()
    t = Path(a.target)
    files = sorted(t.rglob("*.png")) if t.is_dir() else [t]
    if not files:
        sys.exit(f"no PNG files in {t}")
    bad = sum(check(f, a.scale, a.max_colors, hex_rgb(a.ink)) for f in files)
    print(f"{len(files)} file(s), {bad} with errors")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
