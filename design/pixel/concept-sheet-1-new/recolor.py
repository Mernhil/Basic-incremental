"""Recolours the approved-look candidates (the v2 Soul Reaper and bow candidates) into distinct weapons.

No PixelLab: the shapes and shading are PixelLab's, only the hue of the coloured materials moves.
Each candidate gets a target hue (twelve hues, spread so neighbours differ); the sprite's dominant hue
is moved there and every coloured pixel follows, so multi-colour weapons keep their colour relations.
Ink, greys and white are untouched. The result is only padded to 100 x 120 and given hard alpha: no halo removal, no re-outline, no rim,
so no detail is lost (the rim and game ink can be added when a weapon is wired in).

Usage: py design/pixel/concept-sheet-1-new/recolor.py
Writes recolored/<name>.png and contact-recolored.png.
"""
from __future__ import annotations

import colorsys
import importlib.util
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
_s = importlib.util.spec_from_file_location("restyle", HERE / "restyle.py")
RS = importlib.util.module_from_spec(_s)
_s.loader.exec_module(RS)
RAW = HERE / "pixellab/rollout"
OUT = HERE / "recolored"

HUES = [("red", 0), ("orange", 24), ("gold", 46), ("lime", 78), ("green", 120), ("teal", 164),
        ("cyan", 186), ("azure", 214), ("indigo", 246), ("violet", 276), ("magenta", 310), ("rose", 342)]
SETS = {  # raw name prefix -> (count, canvas the old sprite sat on, window rarity)
    "evo-soul_reaper-v2a": 9, "evo-soul_reaper-v2b": 4,
    "item-bow-epic-v2": 9, "item-bow-legendary-v2": 9, "item-bow-mythic-v2": 9,
    "item-bow-exotic-v2": 9, "item-bow-void-v2": 9,
}
MIN_S, MIN_V = 0.15, 0.15


def dominant_hue(a: np.ndarray) -> float:
    rgb = a[..., :3].astype(float) / 255
    op = a[..., 3] > 0
    h = np.zeros(op.shape)
    s = np.zeros(op.shape)
    v = np.zeros(op.shape)
    for y, x in zip(*np.nonzero(op)):
        h[y, x], s[y, x], v[y, x] = colorsys.rgb_to_hsv(*rgb[y, x])
    m = op & (s > 0.3) & (v > 0.3)
    if m.sum() < 10:
        m = op & (s > MIN_S) & (v > MIN_V)
    if m.sum() == 0:
        return 0.0
    ang = h[m] * 2 * np.pi
    return float((np.arctan2(np.sin(ang).mean(), np.cos(ang).mean()) / (2 * np.pi)) % 1)


def recolour(a: np.ndarray, target_deg: float) -> np.ndarray:
    d = (target_deg / 360 - dominant_hue(a)) % 1
    out = a.copy()
    for y, x in zip(*np.nonzero(a[..., 3] > 0)):
        r, g, b = a[y, x, :3] / 255
        h, s, v = colorsys.rgb_to_hsv(r, g, b)
        if s > MIN_S and v > MIN_V:
            out[y, x, :3] = (np.array(colorsys.hsv_to_rgb((h + d) % 1, s, v)) * 255).round()
    return out


def main() -> None:
    OUT.mkdir(exist_ok=True)
    window = Image.open(HERE.parent / "concept-sheet-1/old/evo-soul_reaper.png").convert("RGBA")
    b = window.getbbox()
    centre = ((b[0] + b[2]) / 2, (b[1] + b[3]) / 2)
    items = []
    k = 0
    for prefix, n in SETS.items():
        for i in range(n):
            raw = np.array(Image.open(RAW / f"{prefix}-{i}.png").convert("RGBA"), dtype=np.uint8)
            name, deg = HUES[(k * 5) % 12]
            k += 1
            canvas = RS.pad_to(raw, (100, 120), centre) if raw.shape[:2] != (120, 100) else raw
            # No cleanup pass here: the halo removal and rim of RS.clean dulled the bright parts (review
            # 2026-11-08). The sprite keeps PixelLab's own outline and shading; only the alpha is made hard.
            a = recolour(canvas, deg)
            a[..., 3] = np.where(a[..., 3] >= 128, 255, 0)
            a[a[..., 3] == 0] = 0
            stem = f"{prefix.replace('-v2a', '').replace('-v2b', '-b').replace('-v2', '')}-{i}-{name}"
            Image.fromarray(a, "RGBA").save(OUT / f"{stem}.png")
            items.append((stem, OUT / f"{stem}.png"))
    # contact sheet, 2x, 10 per row
    f = ImageFont.truetype("segoeui.ttf", 10)
    cw, ch = 206, 262
    cols = 8
    rows = (len(items) + cols - 1) // cols
    sheet = Image.new("RGB", (cw * cols, ch * rows), (18, 13, 28))
    d = ImageDraw.Draw(sheet)
    for n, (stem, p) in enumerate(items):
        im = Image.open(p).convert("RGBA")
        t = im.resize((200, 240), Image.NEAREST)
        x, y = (n % cols) * cw, (n // cols) * ch
        sheet.paste(t, (x + 3, y + 3), t)
        d.text((x + 4, y + 244), stem.replace("item-", "").replace("evo-", ""), font=f, fill=(190, 190, 210))
    sheet.save(HERE / "contact-recolored.png")
    print(len(items), "recoloured")


if __name__ == "__main__":
    main()
