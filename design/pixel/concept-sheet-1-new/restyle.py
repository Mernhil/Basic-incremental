"""Cleanup for the restyled sprites (PixelLab create_image_pro, concept shape + old sprite's rendering).

PixelLab draws; this only:
  1. keys out anything not fully opaque and the pale halo (light, low-saturation pixels on the
     silhouette edge that are not part of the art),
  2. applies the palette rule (cel_palette): per material at most 3 flat tones plus a white glint,
     about 16 colours per sprite, then merges the 1-2 px specks the snapping leaves (islands),
  3. snaps PixelLab's own dark outline to the game ink (#1a1020), adds ink only where the edge has a
     gap (never a second line, which would eat thin blades), and puts the light rim outside it
     (card items: the rarity window colour mixed 30% to white, as the game's items, plus the old
     counterpart's free-floating plus sparkles; coins: the tier
     colour; medals and icons: white),
  4. prints footprint / flatness numbers next to the old counterpart (footprint.py).

Usage: py design/pixel/concept-sheet-1-new/restyle.py <raw.png> <out.png> <kind> [<old.png> [<gem shape>]]
  kind: item-<rarity> | unique-<window rarity> | coin-<tier> | sticker. A generation smaller than the old sprite is padded to
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

# The palette rule (user, 2026-11-08): per material at most 3 flat tones (shadow, base, light) plus one
# white glint; about 16 colours per sprite with ink and rim, about 20 for the busiest Uniques; hard
# steps only (no blend tones, dithering, gradients or noise). MATERIALS is how many materials a sprite
# may have: 3 tones each + ink + white glint + rim (+ sparkles, also white).
MATERIALS = {"item": 5, "unique": 6, "coin": 3, "sticker": 4}
# Review 2026-11-08 ("we lost small details on the crystal and the chrome"): a material with a big
# area may keep a 4th tone (a highlight), steps only merge when closer than MERGE_L lightness units,
# and only near-black pixels (L* under INK_L) turn into part lines, so dark chrome keeps its shading.
BUDGET = {"item": 22, "unique": 24, "coin": 18, "sticker": 18}  # colours incl. ink, before the rim
BIG_AREA = 220
TONES_MAX = 4
MERGE_L = 6
INK_L = 9


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


def cel_palette(a: np.ndarray, materials: int) -> np.ndarray:
    """Snaps every colour pixel (not ink, not the white glint) to at most 3 flat tones per material.

    Materials are found by hue and chroma (k-means on Lab a*, b* and a little L*), so a gold guard
    stays apart from a silver blade; inside a material the pixels are split by lightness into shadow,
    base and light, each tone the mean colour of its pixels, and tones closer than 9 L* apart merge,
    so the steps stay clearly separated. Near-white pixels become the one white glint, and near-black
    neutral ones (L* under 14, chroma under 10) the ink, which keeps the lines between parts without
    swallowing a dark coloured material (a deep purple grip)."""
    from skimage.color import lab2rgb, rgb2lab
    from sklearn.cluster import KMeans

    out = a.copy()
    rgb = a[..., :3]
    op = a[..., 3] > 0
    lab = rgb2lab(rgb.astype(float) / 255)
    # near-black pixels inside are PixelLab's part lines: they become ink, so parts stay separated
    out[op & (lab[..., 0] < INK_L) & (np.hypot(lab[..., 1], lab[..., 2]) < 10), :3] = P.INK
    ink = (out[..., :3] == np.array(P.INK)).all(-1)
    glint = op & ~ink & (lab[..., 0] > 92) & (np.hypot(lab[..., 1], lab[..., 2]) < 12)
    out[glint, :3] = 255
    m = op & ~ink & ~glint
    if m.sum() < 8:
        return out
    X = lab[m]
    feats = np.column_stack([X[:, 1], X[:, 2], X[:, 0] * 0.35])
    k = min(materials, len(np.unique(feats.round(1), axis=0)))
    mat = KMeans(n_clusters=k, n_init=4, random_state=0).fit_predict(feats)
    tones = np.zeros_like(X)
    for c in range(k):
        sel = mat == c
        L = X[sel, 0].reshape(-1, 1)
        n = min(TONES_MAX if sel.sum() >= BIG_AREA else 3, len(np.unique(L.round(0))))
        lab_c = KMeans(n_clusters=n, n_init=4, random_state=0).fit(L)
        order = np.argsort(lab_c.cluster_centers_[:, 0])
        rank = np.empty(n, int)
        rank[order] = np.arange(n)
        groups = rank[lab_c.labels_]
        means = [X[sel][groups == g].mean(0) for g in range(n)]
        # merge steps closer than 9 L*, so every step reads
        merged = [means[0]]
        for t in means[1:]:
            if t[0] - merged[-1][0] < MERGE_L:
                merged[-1] = (merged[-1] + t) / 2
            else:
                merged.append(t)
        cent = np.array(merged)
        idx = np.abs(X[sel, 0][:, None] - cent[None, :, 0]).argmin(1)
        tones[sel] = cent[idx]
    out_rgb = (lab2rgb(tones[None])[0] * 255).round().clip(0, 255).astype(np.uint8)
    out[m, :3] = out_rgb
    return out


def islands(a: np.ndarray, max_size: int = 2, passes: int = 3) -> np.ndarray:
    """Specks of 1-2 pixels of one colour (left by the snapping) take the colour most of their
    neighbours have. White glints and the ink stay as drawn."""
    from skimage import measure

    for _ in range(passes):
        out = a.copy()
        op = a[..., 3] > 0
        key = (a[..., 0].astype(int) << 16) | (a[..., 1].astype(int) << 8) | a[..., 2]
        key = np.where(op, key, -1)
        changed = False
        for k in np.unique(key[op]):
            if k in (0xFFFFFF, (P.INK[0] << 16) | (P.INK[1] << 8) | P.INK[2]):
                continue
            lab = measure.label(key == k, connectivity=1)
            for r in measure.regionprops(lab):
                if r.area > max_size:
                    continue
                cnt: Counter = Counter()
                for y, x in r.coords:
                    for dx, dy in P.N8:
                        yy, xx = y + dy, x + dx
                        if 0 <= yy < key.shape[0] and 0 <= xx < key.shape[1] and key[yy, xx] not in (-1, k):
                            cnt[key[yy, xx]] += 1
                if cnt:
                    best = cnt.most_common(1)[0][0]
                    for y, x in r.coords:
                        out[y, x, :3] = ((best >> 16) & 255, (best >> 8) & 255, best & 255)
                    changed = True
        a = out
        if not changed:
            break
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
    if base == "coin":
        # the round silhouette of the old coins (44 px with the ring)
        a = P.disc(a, 20.5)
    # the ink outline (PixelLab's own, snapped to the game ink, gaps filled), then the palette rule
    a = ink_edge(a)
    # PixelLab was asked for max_colors, so its shading is usually inside the budget already; snapping it
    # again flattened crystal facets and dark chrome highlights (review 2026-11-08). Only over-budget
    # results get the per-material snap.
    n_colours = len({tuple(c) for c in a[a[..., 3] > 0][:, :3]})
    a = islands(a, 1, 2) if n_colours <= BUDGET[base] else islands(cel_palette(a, MATERIALS[base]))
    if base == "coin":
        # the resource's gem back in the centre (DESIGN §12 "Resources are carved gems")
        if gem:
            a = P.over(a, P.gem_layer(gem, kind.endswith("locked")))
        return P.ring(a, P.hexrgb(P.COIN_RING["stone" if kind.endswith("locked") else kind.split("-", 1)[1]]))
    if base in ("item", "unique") and old is not None and not kind.endswith("common"):
        # the old counterpart's plus sparkles, where they float free of the new item
        a = P.add_sparkles(a, P.free_sparkles(old))
    if base in ("item", "unique"):
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
