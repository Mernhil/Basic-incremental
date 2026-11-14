"""Inputs for the restyle pass: the concept's shape, sized like the old in-game counterpart.

For each sprite: the concept crop with its background cut out, scaled (smoothly, it is only a guide
image) to fit the old counterpart's footprint and centred where the old sprite sits, on a
transparent canvas of the game size. PixelLab redraws it in the old sprites' rendering (see
prompts.md, "Restyle"). Also writes a small palette image per sprite (the current draft's colours cut
to a few tones) for pixflux's forced palette.

Usage: py design/pixel/concept-sheet-1-new/restyle_inputs.py <concept.jpg> <out dir> [names...]
"""
from __future__ import annotations

import json
import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
SPR = ROOT / "src/renderer/src/art/pixel/sprites"
OLD = HERE.parent / "concept-sheet-1" / "old"

# name: (concept crop box, canvas w, h, old counterpart png, target content w, h, rotation deg, draft png)
PILOT = {
    "item-katana-epic": ((160, 295, 237, 391), 100, 120, SPR / "item-sword-epic.png", 70, 98, 10,
                         HERE / "drafts/items/item-katana-epic.png"),
    "item-staff-epic": ((938, 178, 1013, 268), 100, 120, SPR / "item-staff-epic.png", 64, 92, 15,
                        HERE / "drafts/items/item-staff-epic.png"),
    "item-book-epic": ((668, 319, 725, 386), 100, 120, SPR / "item-shield-epic.png", 56, 66, -12,
                       HERE / "drafts/items/item-book-epic.png"),
    "item-maul-epic": ((166, 179, 225, 262), 100, 120, OLD / "item-maul-epic.png", 62, 88, 0,
                       SPR / "item-maul-epic.png"),
    "evo-bronze_hammer": ((379, 423, 489, 541), 100, 120, OLD / "evo-soul_reaper.png", 80, 104, 8,
                          HERE / "drafts/uniques/evo-bronze_hammer.png"),
    "coin-round-gold": ((144, 29, 186, 71), 48, 48, OLD / "coin-round-gold.png", 42, 42, 0,
                        HERE / "../concept-sheet-1/work/coin-G.png"),
}


def cutout(crop: Image.Image, dark: int = 45) -> Image.Image:
    a = np.array(crop.convert("RGBA"))
    h, w = a.shape[:2]
    near = a[..., :3].max(-1) < dark
    seen = np.zeros((h, w), bool)
    q = deque([(x, y) for x in range(w) for y in (0, h - 1)] + [(x, y) for y in range(h) for x in (0, w - 1)])
    while q:
        x, y = q.popleft()
        if 0 <= x < w and 0 <= y < h and not seen[y, x] and near[y, x]:
            seen[y, x] = True
            q.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
    a[seen, 3] = 0
    return Image.fromarray(a, "RGBA")


def build(src: Image.Image, name: str, out: Path) -> dict:
    box, W, H, old, tw, th, rot, draft = PILOT[name]
    c = cutout(src.crop(box))
    if rot:
        c = c.rotate(rot, resample=Image.BICUBIC, expand=True)
    c = c.crop(c.getbbox())
    k = min(tw / c.width, th / c.height)
    c = c.resize((max(1, round(c.width * k)), max(1, round(c.height * k))), Image.LANCZOS)
    ob = Image.open(old).convert("RGBA").getbbox()
    cx, cy = (ob[0] + ob[2]) / 2, (ob[1] + ob[3]) / 2
    canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    canvas.alpha_composite(c, (round(cx - c.width / 2), round(cy - c.height / 2)))
    canvas.save(out / f"init-{name}.png")
    pal = Image.open(draft).convert("RGB").quantize(colors=10, method=Image.Quantize.MEDIANCUT,
                                                   dither=Image.Dither.NONE).convert("RGB")
    pal.save(out / f"pal-{name}.png")
    return {"canvas": [W, H], "content": [c.width, c.height], "old": str(old.relative_to(ROOT))}


def main() -> None:
    src = Image.open(sys.argv[1]).convert("RGB")
    out = Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    names = sys.argv[3:] or list(PILOT)
    info = {n: build(src, n, out) for n in names}
    print(json.dumps(info, indent=1))


if __name__ == "__main__":
    main()
