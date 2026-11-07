#!/usr/bin/env python3
"""Turn a folder of animation frames into a sprite sheet and an integer-scaled GIF preview.

Usage:
  python3 sheet.py <frames folder> [--durations 120,80,80,200 | --fps 12] [--scale 4] [--bg #2a2233] [--out NAME]

Frames are the folder's PNGs in name order (frame_00.png, frame_01.png, ...), all the same size.
Writes <out>_sheet.png (native size, one row, transparent) and <out>_preview.gif
(nearest-neighbour scaled on a solid background, per-frame durations, looping).
Judge timing on the GIF at real speed. Needs Pillow (pip install pillow).
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from PIL import Image


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("folder")
    ap.add_argument("--durations", help="comma-separated ms per frame (last value repeats)")
    ap.add_argument("--fps", type=float, default=12)
    ap.add_argument("--scale", type=int, default=4)
    ap.add_argument("--bg", default="#2a2233", help="preview background (GIF has no partial alpha)")
    ap.add_argument("--out", help="output name prefix (default: folder path)")
    a = ap.parse_args()

    folder = Path(a.folder)
    files = sorted(folder.glob("*.png"))
    if not files:
        sys.exit(f"no PNG frames in {folder}")
    frames = [Image.open(f).convert("RGBA") for f in files]
    size = frames[0].size
    if any(f.size != size for f in frames):
        sys.exit("all frames must be the same size")

    if a.durations:
        d = [int(x) for x in a.durations.split(",")]
        durations = (d + [d[-1]] * len(frames))[: len(frames)]
    else:
        durations = [round(1000 / a.fps)] * len(frames)

    out = Path(a.out) if a.out else folder
    w, h = size
    sheet = Image.new("RGBA", (w * len(frames), h), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        sheet.paste(f, (i * w, 0))
    sheet_path = out.with_name(out.name + "_sheet.png")
    sheet.save(sheet_path)

    s = max(1, a.scale)
    previews = []
    for f in frames:
        bg = Image.new("RGBA", size, a.bg)
        bg.alpha_composite(f)
        previews.append(bg.convert("RGB").resize((w * s, h * s), Image.NEAREST))
    gif_path = out.with_name(out.name + "_preview.gif")
    previews[0].save(gif_path, save_all=True, append_images=previews[1:], duration=durations, loop=0, optimize=False, disposal=2)

    total = sum(durations)
    print(f"{len(frames)} frames {w}x{h}, loop {total} ms -> {sheet_path}, {gif_path} ({s}x)")


if __name__ == "__main__":
    main()
