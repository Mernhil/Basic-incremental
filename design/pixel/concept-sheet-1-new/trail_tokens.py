"""Attack colour tokens for the elemental trail hues, read off the PixelLab trail swatches.

Attack cosmetics carry their colours as three tokens (cosmetics.json `levels[].tokens`):
`attack-edge` (the stroke, a hex), `attack-glow` (the soft glow behind it, an rgba) and
`attack-particle` (sparks, a hex). For each swatch: edge = its most common mid-bright tone, particle
= its brightest tone, glow = the edge at 0.9 alpha, as the game's own attack entries do. Swatches are
grouped into five hue families by the edge colour's hue.

Usage: py design/pixel/concept-sheet-1-new/trail_tokens.py
Writes drafts/trails/tokens.json and contact-trail-tokens.png.
"""
from __future__ import annotations

import colorsys
import json
from collections import Counter
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
D = HERE / "drafts/trails"
INK = (0x1A, 0x10, 0x20)
FAMILIES = [  # hue ranges in degrees (wrapping), checked in order
    ("rose", (330, 20)),
    ("ember", (20, 62)),
    ("verdant", (62, 165)),
    ("tide", (165, 250)),
    ("arcane", (250, 330)),
]


def hx(c) -> str:
    return "#%02x%02x%02x" % tuple(c[:3])


def family(c) -> str:
    h, l, s = colorsys.rgb_to_hls(*(v / 255 for v in c[:3]))
    deg = h * 360
    for name, (a, b) in FAMILIES:
        if (a <= deg < b) if a < b else (deg >= a or deg < b):
            return name
    return "rose"


def tokens(path: Path) -> dict:
    im = Image.open(path).convert("RGBA")
    px = [p[:3] for p in im.getdata() if p[3] and p[:3] not in (INK, (255, 255, 255))]
    lum = lambda c: 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]  # noqa: E731
    ranked = sorted(set(px), key=lum)
    mid = ranked[2 * len(ranked) // 5 : 4 * len(ranked) // 5 + 1]
    count = Counter(px)
    edge = max(mid, key=lambda c: count[c])
    particle = ranked[-1]
    return {
        "family": family(edge),
        "attack-edge": hx(edge),
        "attack-glow": "rgba(%d, %d, %d, 0.9)" % edge,
        "attack-particle": hx(particle),
    }


def main() -> None:
    out = {p.stem: tokens(p) for p in sorted(D.glob("trail-*.png"))}
    (D / "tokens.json").write_text(json.dumps(out, indent=2) + "\n")
    # a swatch sheet: per family, each swatch at 2x with its three token colours
    fams = [f for f, _ in FAMILIES]
    f = ImageFont.truetype("segoeui.ttf", 13)
    rows = [[k for k, v in out.items() if v["family"] == fam] for fam in fams]
    W = 140 + max(len(r) for r in rows) * 130
    img = Image.new("RGB", (W, 20 + len(fams) * 130), (30, 33, 46))
    d = ImageDraw.Draw(img)
    for r, (fam, names) in enumerate(zip(fams, rows)):
        y = 10 + r * 130
        d.text((12, y + 40), f"{fam} ({len(names)})", font=f, fill=(226, 230, 240))
        for i, n in enumerate(names):
            x = 140 + i * 130
            sw = Image.open(D / f"{n}.png").convert("RGBA").resize((96, 96), Image.NEAREST)
            img.paste(sw, (x, y), sw)
            t = out[n]
            for k, key in enumerate(("attack-edge", "attack-glow", "attack-particle")):
                c = t[key] if key != "attack-glow" else t["attack-edge"]
                d.rectangle([x + k * 32, y + 100, x + k * 32 + 28, y + 114], fill=c, outline=(0, 0, 0))
            d.text((x, y + 114), n, font=f, fill=(150, 156, 176))
    img.save(HERE / "contact-trail-tokens.png")


if __name__ == "__main__":
    main()
