"""Animation previews for the attack drafts, at the game's timing for baked slashes (attackSheet in
art/cosmetics.ts: snap 50 ms, held hit 130, thin 90, break 110).

For each drafts/attacks/atk-<style>.png strip it runs the pixel-art skill's sheet.py (sheet + GIF at
4x on the dark panel colour) and also writes an APNG that keeps the transparency.

Usage: py design/pixel/concept-sheet-1-new/previews.py
Writes design/pixel/concept-sheet-1-new/previews/<style>_sheet.png, _preview.gif, .apng.
"""
from __future__ import annotations

import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
SHEET = ROOT / ".claude/skills/pixel-art/scripts/sheet.py"
DUR = [50, 130, 90, 110]
OUT = HERE / "previews"


def main() -> None:
    OUT.mkdir(exist_ok=True)
    for strip in sorted((HERE / "drafts/attacks").glob("atk-*.png")):
        style = strip.stem[4:]
        im = Image.open(strip).convert("RGBA")
        frames = [im.crop((64 * i, 0, 64 * i + 64, 64)) for i in range(4)]
        with tempfile.TemporaryDirectory() as tmp:
            for i, f in enumerate(frames):
                f.save(Path(tmp) / f"frame_{i:02d}.png")
            subprocess.run(
                [sys.executable, str(SHEET), tmp, "--durations", ",".join(map(str, DUR)), "--scale", "4",
                 "--bg", "#1e212e", "--out", str(OUT / style)],
                check=True,
            )
        big = [f.resize((256, 256), Image.NEAREST) for f in frames]
        big[0].save(OUT / f"{style}.apng", save_all=True, append_images=big[1:], duration=DUR, loop=0,
                    disposal=1, format="PNG")


if __name__ == "__main__":
    main()
