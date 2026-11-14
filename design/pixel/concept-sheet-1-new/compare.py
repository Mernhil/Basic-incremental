"""Pilot comparison: for each sprite, the old in-game counterpart, the current version and the fixed
(restyled) one, at 1x and 4x on the card window colour, with footprint / flatness numbers.

Usage: py design/pixel/concept-sheet-1-new/compare.py
Writes design/pixel/concept-sheet-1-new/pilot/compare-<name>.png and pilot/numbers.md.
"""
from __future__ import annotations

import importlib.util
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
SPR = ROOT / "src/renderer/src/art/pixel/sprites"
OLD = HERE.parent / "concept-sheet-1" / "old"
_fp = importlib.util.spec_from_file_location("footprint", HERE / "footprint.py")
F = importlib.util.module_from_spec(_fp)
_fp.loader.exec_module(F)

# name: (old counterpart, current version, window colour)
PILOT = {
    "item-katana-epic": (SPR / "item-sword-epic.png", HERE / "drafts/items/item-katana-epic.png", "#2c1a4f"),
    "item-staff-epic": (SPR / "item-staff-epic.png", HERE / "drafts/items/item-staff-epic.png", "#2c1a4f"),
    "item-book-epic": (SPR / "item-shield-epic.png", HERE / "drafts/items/item-book-epic.png", "#2c1a4f"),
    "item-maul-epic": (OLD / "item-maul-epic.png", SPR / "item-maul-epic.png", "#2c1a4f"),
    "evo-bronze_hammer": (OLD / "evo-soul_reaper.png", HERE / "drafts/uniques/evo-bronze_hammer.png", "#4a2b0d"),
    "coin-round-gold": (OLD / "coin-round-gold.png", SPR / "coin-round-gold.png", "#1e212e"),
}
BG = (30, 33, 46)
TEXT = (226, 230, 240)
DIM = (150, 156, 176)


def font(size: int):
    try:
        return ImageFont.truetype("segoeui.ttf", size)
    except OSError:
        return ImageFont.load_default()


def tile(p: Path, s: int, win: str) -> Image.Image:
    im = Image.open(p).convert("RGBA")
    t = Image.new("RGBA", (im.width * s, im.height * s), win)
    t.alpha_composite(im.resize((im.width * s, im.height * s), Image.NEAREST))
    return t


def main() -> None:
    f, fs = font(15), font(12)
    lines = ["| Sprite | Version | bbox | mass | tones | isolated % | patches/100 |", "|---|---|---|---|---|---|---|"]
    for name, (old, cur, win) in PILOT.items():
        fixed = HERE / "pilot" / f"{name}.png"
        cols = [("old (in game before)", old), ("current", cur), ("fixed", fixed)]
        w0, h0 = Image.open(fixed).size
        cw = w0 * 4 + w0 + 40
        img = Image.new("RGB", (cw * 3 + 20, h0 * 4 + 110), BG)
        d = ImageDraw.Draw(img)
        d.text((12, 6), name, font=f, fill=TEXT)
        for i, (label, p) in enumerate(cols):
            x = 12 + i * cw
            m = F.metrics(p)
            d.text((x, 28), label, font=f, fill=TEXT)
            d.text((x, 48), f"{m['bbox']}  mass {m['mass']}  tones {m['tones']}  patches {m['patches/100']}", font=fs, fill=DIM)
            img.paste(tile(p, 4, win), (x, 70))
            img.paste(tile(p, 1, win), (x + w0 * 4 + 12, 70))
            lines.append(f"| {name} | {label} | {m['bbox']} | {m['mass']} | {m['tones']} | {m['isolated%']} | {m['patches/100']} |")
        img.save(HERE / "pilot" / f"compare-{name}.png")
    (HERE / "pilot" / "numbers.md").write_text("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
