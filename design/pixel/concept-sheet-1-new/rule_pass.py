"""Applies the palette rule (review 2026-11-08: only to over-budget sprites, otherwise the draft is kept) to the cleaned drafts that were not regenerated with PixelLab pro (trail
swatches, debuffs, portraits, flora, hex badges, attack frames, interface and cosmetic frames):
per material at most 3 flat tones plus a white glint, specks merged (restyle.cel_palette / islands).
The magic patterns already sit on a 4-tone ramp and are copied as they are.

Usage: py design/pixel/concept-sheet-1-new/rule_pass.py
Writes restyled/<group>/*.png and restyled/rule-pass-numbers.md (colours before -> after).
"""
from __future__ import annotations

import importlib.util
import shutil
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
_s = importlib.util.spec_from_file_location("restyle", HERE / "restyle.py")
RS = importlib.util.module_from_spec(_s)
_s.loader.exec_module(RS)
_f = importlib.util.spec_from_file_location("footprint", HERE / "footprint.py")
F = importlib.util.module_from_spec(_f)
_f.loader.exec_module(F)

# group -> materials allowed
GROUPS = {"trails": 3, "debuffs": 4, "cosmetics": 5, "interface": 4, "attacks/frames": 3}
OUT = HERE / "restyled"


def main() -> None:
    lines = ["| Sprite | colours before | colours after |", "|---|---|---|"]
    for group, mats in GROUPS.items():
        dst = OUT / group
        dst.mkdir(parents=True, exist_ok=True)
        for p in sorted((HERE / "drafts" / group).glob("*.png")):
            a = np.array(Image.open(p).convert("RGBA"), dtype=np.uint8)
            b = RS.islands(a, 1, 2) if len({tuple(c) for c in a[a[..., 3] > 0][:, :3]}) <= 22 else RS.islands(RS.cel_palette(a, mats))
            Image.fromarray(b, "RGBA").save(dst / p.name)
            lines.append(f"| {group}/{p.stem} | {F.metrics(p)['tones']} | {F.metrics(dst / p.name)['tones']} |")
    shutil.copytree(HERE / "drafts/magic", OUT / "magic", dirs_exist_ok=True)
    # the attack strips from the rule-passed frames
    for style in ("cross", "crimson", "triple", "pierce", "burst"):
        strip = Image.new("RGBA", (256, 64), (0, 0, 0, 0))
        for i in range(4):
            strip.alpha_composite(Image.open(OUT / "attacks/frames" / f"atk-{style}-{i + 1}.png"), (64 * i, 0))
        strip.save(OUT / "attacks" / f"atk-{style}.png")
    (OUT / "rule-pass-numbers.md").write_text("\n".join(lines) + "\n")
    print(len(lines) - 2, "sprites")


if __name__ == "__main__":
    main()
