"""Cleanup for the restyled sprites (PixelLab create_image_pro, concept shape + old sprite's rendering).

PixelLab draws; this only:
  1. keys out anything not fully opaque and the pale halo (light, low-saturation pixels on the
     silhouette edge that are not part of the art),
  2. cuts the palette only when PixelLab used more than `TONES` colours (no dither), and gives a lone
     pixel (no same-colour neighbour) the majority colour of its 3 x 3 neighbourhood,
  3. snaps PixelLab's own dark outline to the game ink (#1a1020), adds ink only where the edge has a
     gap (never a second line, which would eat thin blades), and puts the light rim outside it
     (card items: the rarity window colour mixed 30% to white, as the game's items, plus the old
     counterpart's free-floating plus sparkles; coins: the tier
     colour; medals and icons: white),
  4. prints footprint / flatness numbers next to the old counterpart (footprint.py).

Usage: py design/pixel/concept-sheet-1-new/restyle.py <raw.png> <out.png> <kind> [<old.png> [<gem shape>]]
  kind: item-<rarity> | coin-<tier> | sticker. A generation smaller than the old sprite is padded to
  its canvas (drawn smaller on purpose to match the old footprint).
"""
from __future__ import annotations

import importlib.util
import sys
from collections import Counter
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location("sheet1_post", HERE.parent / "concept-sheet-1" / "post.py")
P = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(P)
_fp = importlib.util.spec_from_file_location("footprint", HERE / "footprint.py")
F = importlib.util.module_from_spec(_fp)
_fp.loader.exec_module(F)

TONES = {"item": 24, "coin": 20, "sticker": 20}  # kept high enough that small accents (a gold guard) survive


def ink_edge(a: np.ndarray) -> np.ndarray:
    """PixelLab pro already draws a dark outline: snap its dark edge pixels to the game's ink, and add
    ink only where the silhouette edge is a light colour (a gap), never a second ink line."""
    out = a.copy()
    h, w = a.shape[:2]
    op = a[..., 3] > 0
    lum = (a[..., :3].astype(float) @ [0.3, 0.59, 0.11]) / 255
    for y in range(h):
        for x in range(w):
            if not op[y, x]:
                continue
            edge = any(not (0 <= y + dy < h and 0 <= x + dx < w) or not op[y + dy, x + dx]
                       for dx, dy in P.N4)
            if edge and lum[y, x] < 0.3:
                out[y, x, :3] = P.INK
    op2 = out[..., 3] > 0
    add = out.copy()
    for y in range(h):
        for x in range(w):
            if op2[y, x]:
                continue
            for dx, dy in P.N4:
                yy, xx = y + dy, x + dx
                if 0 <= yy < h and 0 <= xx < w and op2[yy, xx] and tuple(out[yy, xx, :3]) != P.INK                         and not (out[yy, xx, :3] == 255).all():
                    add[y, x] = (*P.INK, 255)
                    break
    return add


def unhalo(a: np.ndarray) -> np.ndarray:
    """Removes a pale, washed-out ring on the silhouette (light, grey-lavender, low saturation)."""
    out = a.copy()
    for _ in range(2):
        op = out[..., 3] > 0
        edge = op & ~(np.roll(op, 1, 0) & np.roll(op, -1, 0) & np.roll(op, 1, 1) & np.roll(op, -1, 1))
        rgb = out[..., :3].astype(int)
        mx, mn = rgb.max(-1), rgb.min(-1)
        pale = (mx > 150) & (mx - mn < 40) & ~(rgb == 255).all(-1)
        out[edge & pale] = 0
    return out


def majority(a: np.ndarray, passes: int = 2) -> np.ndarray:
    """A pixel whose colour holds 2 or fewer of its 3 x 3 cells takes the majority colour there."""
    h, w = a.shape[:2]
    for _ in range(passes):
        out = a.copy()
        for y in range(h):
            for x in range(w):
                c = P.colour_at(a, x, y)
                if c is None or c == P.INK or c == (255, 255, 255):
                    continue
                cells = [P.colour_at(a, x + dx, y + dy) for dy in (-1, 0, 1) for dx in (-1, 0, 1)]
                cells = [q for q in cells if q is not None and q != P.INK]
                cnt = Counter(cells)
                if cnt[c] <= 1:
                    best, k = cnt.most_common(1)[0]
                    if k >= 4 and best != c:
                        out[y, x, :3] = best
        a = out
    return a


def pad_to(a: np.ndarray, size: tuple[int, int], centre: tuple[float, float]) -> np.ndarray:
    """Places a smaller generation on the game canvas (transparent padding, never a rescale), with
    its content centred where the old sprite's content sits."""
    W, H = size
    ys, xs = np.nonzero(a[..., 3] > 0)
    cx, cy = (xs.min() + xs.max() + 1) / 2, (ys.min() + ys.max() + 1) / 2
    ox, oy = round(centre[0] - cx), round(centre[1] - cy)
    out = np.zeros((H, W, 4), np.uint8)
    for y, x in zip(ys, xs):
        if 0 <= y + oy < H and 0 <= x + ox < W:
            out[y + oy, x + ox] = a[y, x]
    return out


def clean(raw: np.ndarray, kind: str, gem: str | None = None, old: np.ndarray | None = None) -> np.ndarray:
    a = raw.copy()
    a[a[..., 3] < 200] = 0
    a[..., 3] = np.where(a[..., 3] > 0, 255, 0)
    a = unhalo(a)
    a = P.drop_specks(a, 6)
    base = kind.split("-")[0]
    a = P.quantize(a, TONES[base])
    a = majority(a, 2)
    if base == "coin":
        # the round silhouette of the old coins (44 px with the ring), and the resource's gem back
        # in the centre (DESIGN Ã‚Â§12 "Resources are carved gems")
        a = P.disc(a, 20.5)
        a = ink_edge(a)
        if gem:
            a = P.over(a, P.gem_layer(gem, kind.endswith("locked")))
        return P.ring(a, P.hexrgb(P.COIN_RING["stone" if kind.endswith("locked") else kind.split("-", 1)[1]]))
    # the ink outline (PixelLab's own, snapped to the game ink, gaps filled); then one rim pixel outside
    a = ink_edge(a)
    if base == "item" and old is not None and not kind.endswith("common"):
        # the old counterpart's plus sparkles, where they float free of the new item
        a = P.add_sparkles(a, P.free_sparkles(old))
    if base == "item":
        return P.ring(a, P.mix(P.RARITY_WINDOW[kind.split("-", 1)[1]], "#ffffff", 0.3), skip_white=True)
    return P.ring(a, P.WHITE)


def main() -> None:
    raw = np.array(Image.open(sys.argv[1]).convert("RGBA"), dtype=np.uint8)
    kind = sys.argv[3]
    old_a = None
    if len(sys.argv) > 4:
        old = Image.open(sys.argv[4]).convert("RGBA")
        old_a = np.array(old, dtype=np.uint8)
        if raw.shape[:2] != (old.height, old.width):
            b = old.getbbox()
            raw = pad_to(raw, old.size, ((b[0] + b[2]) / 2, (b[1] + b[3]) / 2))
    out = clean(raw, kind, sys.argv[5] if len(sys.argv) > 5 else None, old_a)
    Image.fromarray(out, "RGBA").save(sys.argv[2])
    print("fixed", F.metrics(sys.argv[2]))
    if len(sys.argv) > 4:
        print("old  ", F.metrics(sys.argv[4]))


if __name__ == "__main__":
    main()
