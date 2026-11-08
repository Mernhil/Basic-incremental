"""Turn the user's approved concept sheets into the production tile sprites (58 x 64).

The concept sheets (design/references/concept-2026-11-08/, local only, gitignored) hold 3 rows x
5 growth stages each. This script cuts every cell, removes the flat grey background and the soft
glow halo, resamples the drawing onto the 58 x 64 tile grid (one scale for every tile, so all rows
share the same pixel size), quantises it to a small palette per row, and cleans it up for the pixel
rules in DESIGN.md section 12: one ink outline, no semi-transparent pixels, no JPEG noise, few
orphan pixels, sparkles redrawn as crisp pixel crosses, and the white sticker ring outside the ink.

Each tile is anchored on its platform: the platform's centre sits on the tile's centre column and
its lowest pixel on the same baseline, so all five stages of a row line up like the old tiles did.

Usage (Python 3 with Pillow, numpy and scipy):
  py design/pixel/concept-tiles/convert_tiles.py [--refs DIR] [--out DIR] [--debug DIR]

Writes tile-{mine,tree}-<shape>-<stage>.png into --out (default: the hand-made sprite sources in
src/renderer/src/art/pixel/hand/, which scripts/art/bake-pixels.mjs copies into sprites/).

Row to sprite mapping (verified in src/data/content: mines.json, trees.json, resources.json):
  mines: orange = Copper Quarry (copper_gem, square), grey = Iron Deeps (iron_gem, hexagon),
         icy blue = Crystal Grotto (grotto_gem, drop)
  trees: round orange fruit = Oak (oak_gem, round), pentagon fruit = Ironbark (ironbark_gem,
         pentagon), star fruit = Moonwillow (moonwillow_gem, star)
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parents[3]
W, H = 58, 64
INK = np.array([0x1A, 0x10, 0x20])
WHITE = np.array([255, 255, 255])
SPARK_ARM = np.array([255, 244, 186])
STAGES = 5
SHEETS = [
    ("sheet-2-mines.jpg", ["mine-square", "mine-hexagon", "mine-drop"]),
    ("sheet-3-trees.jpg", ["tree-round", "tree-pentagon", "tree-star"]),
]
# Room inside the 58 x 64 box: 1 px for the white ring on every side.
CENTRE_X = W / 2
BASELINE = H - 1
HALF_W = W / 2 - 1
TOP = 1
GLOW_SOFT, GLOW_STRONG = 10.0, 20.0  # halo strength (mean RGB shift around the drawing)
PALETTE_SIZE = 40  # per row of five stages, before per-tile pruning
INK_WEIGHT = 1.7  # keeps the 1 px ink lines through the downscale
LINE_WEIGHT, LINE_DROP = 1.5, 0.06  # same for coloured lines: Oklab L this far below the local mean
DARK = 80  # luma below this stops the glow peel (outline and deep shadow)
INK_LUMA = 40  # luma below this is the ink itself


# ---------------------------------------------------------------- colour helpers


def oklab(rgb: np.ndarray) -> np.ndarray:
    c = rgb.astype(float) / 255
    lin = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    m1 = np.array(
        [
            [0.4122214708, 0.5363325363, 0.0514459929],
            [0.2119034982, 0.6806995451, 0.1073969566],
            [0.0883024619, 0.2817188376, 0.6299787005],
        ]
    )
    lms = np.cbrt(lin @ m1.T)
    m2 = np.array(
        [
            [0.2104542553, 0.7936177850, -0.0040720468],
            [1.9779984951, -2.4285922050, 0.4505937099],
            [0.0259040371, 0.7827717662, -0.8086757660],
        ]
    )
    return lms @ m2.T


def luma(rgb: np.ndarray) -> np.ndarray:
    return rgb.astype(float) @ np.array([0.299, 0.587, 0.114])


def lum709(rgb: np.ndarray) -> np.ndarray:
    """The luminance pixel_check.py uses (0..1)."""
    return rgb.astype(float) @ np.array([0.2126, 0.7152, 0.0722]) / 255


# ---------------------------------------------------------------- source cells


def cell_masks(rgb: np.ndarray, dome: bool = False) -> tuple[np.ndarray, list[tuple[float, float, float]]]:
    """Foreground mask of one concept cell (drawing without background or glow) and sparkles.

    `dome`: the cell is a glowing tree whose canopy top melts into the glow; its upper third is
    closed with a round brush so the crown keeps the same dome as the stage before.
    """
    border = np.concatenate(
        [rgb[:4].reshape(-1, 3), rgb[-4:].reshape(-1, 3), rgb[:, :4].reshape(-1, 3), rgb[:, -4:].reshape(-1, 3)]
    )
    bg = np.median(border, 0)
    dist = np.sqrt(((rgb - bg) ** 2).sum(-1))
    lu = luma(rgb)
    dark = lu < DARK

    def biggest(m: np.ndarray) -> np.ndarray:
        lab, n = ndi.label(m)
        if not n:
            return m
        sizes = ndi.sum(m, lab, range(1, n + 1))
        keep = [k for k, sz in enumerate(sizes, 1) if sz >= 0.05 * sizes.max()]
        return np.isin(lab, keep)

    # 1. whatever the ink outline encloses (rock and stone that are close to the grey background)
    enclosed = biggest(ndi.binary_fill_holes(ndi.binary_closing(ndi.binary_opening(dark), iterations=2)))
    # 2. strongly coloured parts whose outline melts into a glow (the stage 4 canopy tops); the soft
    #    halo is peeled off from the outside until ink or clearly coloured pixels are reached
    vivid = biggest(ndi.binary_fill_holes(ndi.binary_closing(dark | (dist > 80), iterations=2)))
    for _ in range(14):
        edge = vivid & ~ndi.binary_erosion(vivid)
        peel = edge & ~dark & (dist < 95)
        if not peel.any():
            break
        vivid &= ~peel
    vivid = ndi.binary_opening(vivid, iterations=2)
    main = ndi.binary_fill_holes(enclosed | vivid)
    if dome:
        ys = np.nonzero(main.any(1))[0]
        cut = ys.min() + int(0.38 * (ys.max() - ys.min()))
        r = 26
        yy, xx = np.mgrid[-r : r + 1, -r : r + 1]
        disk = xx**2 + yy**2 <= r * r
        closed = ndi.binary_closing(np.pad(main, r), structure=disk)[r:-r, r:-r]
        main[:cut] |= closed[:cut]
    # sparkles: small bright crosses floating outside the drawing
    bright = (lu > 222) & ~ndi.binary_dilation(main, iterations=3)
    slab, sn = ndi.label(bright)
    sparks: list[tuple[float, float, float]] = []
    for k in range(1, sn + 1):
        ys, xs = np.nonzero(slab == k)
        if len(ys) < 10:
            continue
        sparks.append((xs.mean(), ys.mean(), max(np.ptp(xs), np.ptp(ys)) + 1))
    return main, sparks


def platform_anchor(mask: np.ndarray) -> tuple[float, float]:
    """(centre x, bottom edge y) of the floating platform: the lower part of the drawing."""
    ys, xs = np.nonzero(mask)
    bottom = ys.max() + 1
    band = ys >= bottom - 70  # the platform and what hangs under it
    return float(xs[band].min() + xs[band].max() + 1) / 2, float(bottom)


# ---------------------------------------------------------------- palette


def weighted_kmeans(x: np.ndarray, w: np.ndarray, k: int, seed: int = 7, iters: int = 40) -> np.ndarray:
    rng = np.random.default_rng(seed)
    # k-means++ seeding, weighted
    c = [x[rng.choice(len(x), p=w / w.sum())]]
    for _ in range(1, k):
        d = np.min(((x[:, None, :] - np.array(c)[None]) ** 2).sum(-1), 1) * w
        c.append(x[rng.choice(len(x), p=d / d.sum())])
    c = np.array(c)
    for _ in range(iters):
        lab = np.argmin(((x[:, None, :] - c[None]) ** 2).sum(-1), 1)
        for j in range(k):
            m = lab == j
            if m.any():
                c[j] = (x[m] * w[m, None]).sum(0) / w[m].sum()
    return c


def row_palette(pixels: np.ndarray) -> np.ndarray:
    """A shared palette (RGB) for a row's five stages; rare accents (rainbow rims) get a fair say."""
    q = (pixels // 6).astype(np.int64)
    key = q[:, 0] * 10000 + q[:, 1] * 100 + q[:, 2]
    uk, inv, cnt = np.unique(key, return_inverse=True, return_counts=True)
    mean = np.zeros((len(uk), 3))
    np.add.at(mean, inv, pixels)
    mean /= cnt[:, None]
    light = mean[luma(mean) >= INK_LUMA]
    lw = np.sqrt(cnt[luma(mean) >= INK_LUMA]).astype(float)
    cent = weighted_kmeans(oklab(light), lw, PALETTE_SIZE)
    # back to RGB: the weighted mean RGB of each cluster's members
    lab = np.argmin(((oklab(light)[:, None, :] - cent[None]) ** 2).sum(-1), 1)
    pal = []
    for j in range(PALETTE_SIZE):
        m = lab == j
        if m.any():
            pal.append((light[m] * lw[m, None]).sum(0) / lw[m].sum())
    return np.vstack([INK[None].astype(float), np.round(np.array(pal))]).clip(0, 255)


def quantise(rgb: np.ndarray, pal: np.ndarray) -> np.ndarray:
    lab = np.argmin(((oklab(rgb)[..., None, :] - oklab(pal)[None, None]) ** 2).sum(-1), -1)
    lab[luma(rgb) < INK_LUMA] = 0
    return lab


# ---------------------------------------------------------------- resample and clean


N4 = ((1, 0), (-1, 0), (0, 1), (0, -1))
N8 = tuple((dx, dy) for dx in (-1, 0, 1) for dy in (-1, 0, 1) if dx or dy)


def line_weight(rgb: np.ndarray) -> np.ndarray:
    """Extra say for thin dark lines (coloured outlines, cracks, folds) so they survive the 4:1 step."""
    lt = oklab(rgb)[..., 0]
    return np.where(ndi.uniform_filter(lt, 7) - lt > LINE_DROP, LINE_WEIGHT, 1.0)


def resample(
    lab: np.ndarray, mask: np.ndarray, anchor: tuple[float, float], s: float, k: int, lw: np.ndarray
) -> np.ndarray:
    """Weighted mode of palette indices per target pixel (-1 = clear)."""
    ys, xs = np.mgrid[0 : lab.shape[0], 0 : lab.shape[1]]
    tx = np.floor(CENTRE_X + (xs + 0.5 - anchor[0]) * s).astype(int)
    ty = np.floor(BASELINE + (ys + 0.5 - anchor[1]) * s).astype(int)
    ok = (tx >= 0) & (tx < W) & (ty >= 0) & (ty < H)
    idx = np.where(mask, lab, k)  # k = clear
    wts = np.where(idx == 0, INK_WEIGHT, lw)
    acc = np.zeros((H, W, k + 1))
    np.add.at(acc, (ty[ok], tx[ok], idx[ok]), wts[ok])
    out = acc.argmax(-1)
    out[acc.sum(-1) == 0] = k
    return np.where(out == k, -1, out)


def neighbours(g: np.ndarray, x: int, y: int, offs) -> list[int]:
    res = []
    for dx, dy in offs:
        i, j = x + dx, y + dy
        if 0 <= i < W and 0 <= j < H and g[j, i] >= 0:
            res.append(int(g[j, i]))
    return res


def clean(g: np.ndarray, pal: np.ndarray) -> np.ndarray:
    g = g.copy()
    solid = g >= 0
    # drop specks and fill pin holes
    lab, n = ndi.label(solid)
    for k in range(1, n + 1):
        if (lab == k).sum() < 6:
            g[lab == k] = -1
    holes = ndi.binary_fill_holes(g >= 0) & (g < 0)
    hl, hn = ndi.label(holes)
    for k in range(1, hn + 1):
        m = hl == k
        if m.sum() <= 3:
            g[m] = 0
    # one ink outline: every solid pixel touching clear space (or the box edge) is ink
    solid = g >= 0
    pad = np.pad(solid, 1, constant_values=False)
    touch = ~(pad[:-2, 1:-1] & pad[2:, 1:-1] & pad[1:-1, :-2] & pad[1:-1, 2:])
    g[solid & touch] = 0
    # ink pixels with ink on no side and colour on every side are JPEG crumbs: recolour them
    for y in range(1, H - 1):
        for x in range(1, W - 1):
            if g[y, x] != 0:
                continue
            nb4 = neighbours(g, x, y, N4)
            if len(nb4) == 4 and 0 not in neighbours(g, x, y, N8):
                g[y, x] = max(set(nb4), key=nb4.count)
    ok = oklab(pal)
    light = lum709(pal) >= 0.9
    for _ in range(6):
        # orphans: a pixel matching none of its 8 neighbours becomes its closest neighbour colour
        changed = False
        for y in range(H):
            for x in range(W):
                c = g[y, x]
                if c <= 0 or light[c]:
                    continue
                nb = neighbours(g, x, y, N8)
                if not nb or c in nb:
                    continue
                cands = [v for v in set(nb) if v != 0] or [0]
                g[y, x] = min(cands, key=lambda v: ((ok[v] - ok[c]) ** 2).sum())
                changed = True
        if not changed:
            break
    return g


def stamp_sparks(rgb: np.ndarray, sparks, anchor, s: float) -> None:
    for sx, sy, size in sparks:
        x = int(np.floor(CENTRE_X + (sx + 0.5 - anchor[0]) * s))
        y = int(np.floor(BASELINE + (sy + 0.5 - anchor[1]) * s))
        arm = 2 if size * s >= 6 else 1
        for d in range(-arm, arm + 1):
            for px, py in ((x + d, y), (x, y + d)):
                if 0 <= px < W and 0 <= py < H and rgb[py, px, 3] == 0:
                    rgb[py, px] = [*(WHITE if d == 0 or abs(d) < arm else SPARK_ARM), 255]


def glow_of(rgb: np.ndarray, mask: np.ndarray) -> tuple[np.ndarray, float]:
    """The concept's soft halo around a drawing: its direction from the grey (RGB) and strength."""
    border = np.concatenate(
        [rgb[:4].reshape(-1, 3), rgb[-4:].reshape(-1, 3), rgb[:, :4].reshape(-1, 3), rgb[:, -4:].reshape(-1, 3)]
    )
    bg = np.median(border, 0)
    band = ndi.binary_dilation(mask, iterations=12) & ~ndi.binary_dilation(mask, iterations=3)
    band &= luma(rgb) < 215  # not the sparkles
    dev = rgb[band].mean(0) - bg
    return np.clip(bg + dev * 5, 0, 255), float(np.linalg.norm(dev))


def near4(m: np.ndarray) -> np.ndarray:
    pad = np.pad(m, 1, constant_values=False)
    return pad[:-2, 1:-1] | pad[2:, 1:-1] | pad[1:-1, :-2] | pad[1:-1, 2:]


def ring(rgba: np.ndarray, glow: np.ndarray | None, strong: bool) -> None:
    """The sticker ring outside the ink (N4, skipping the sparkles, like raster.ts ring()).

    White by default. Where the concept glows, the ring takes a pale tint of the glow colour, and a
    strong glow adds a dithered outer pixel band in a richer tint: opaque pixels that read as a soft
    halo on the dark panels at 1x.
    """
    a = rgba[..., 3] > 0
    is_spark = (rgba[..., :3] == WHITE).all(-1) | (rgba[..., :3] == SPARK_ARM).all(-1)
    inner = near4(a & ~is_spark) & ~a
    if glow is None:
        rgba[inner] = [*WHITE, 255]
        return
    rgba[inner] = [*np.round(glow * 0.45 + WHITE * 0.55).astype(np.uint8), 255]
    if strong:
        yy, xx = np.mgrid[0:H, 0:W]
        outer = near4(inner) & ~a & ~inner & ((xx // 2 + yy // 2) % 2 == 0)
        # 2 x 2 dither; a halo pixel left alone without a partner is dropped (no orphans)
        pad = np.pad(outer, 1, constant_values=False)
        partner = np.zeros_like(outer)
        for dx, dy in N8:
            partner |= pad[1 + dy : 1 + dy + H, 1 + dx : 1 + dx + W]
        outer &= partner
        rgba[outer] = [*np.round(glow * 0.72 + WHITE * 0.28).astype(np.uint8), 255]


# ---------------------------------------------------------------- main


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--refs", default=str(ROOT / "design/references/concept-2026-11-08"))
    ap.add_argument("--out", default=str(ROOT / "src/renderer/src/art/pixel/hand"))
    ap.add_argument("--debug", help="also write the source masks here")
    ap.add_argument("--no-ring", action="store_true", help="leave out the white sticker ring")
    a = ap.parse_args()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)

    cells = {}  # (row name, stage) -> (rgb, mask, sparks, anchor)
    for sheet, rows in SHEETS:
        img = np.array(Image.open(Path(a.refs) / sheet).convert("RGB")).astype(float)
        sh, sw = img.shape[:2]
        for r, name in enumerate(rows):
            for c in range(STAGES):
                x0, x1 = round(c * sw / STAGES), round((c + 1) * sw / STAGES)
                y0, y1 = round(r * sh / 3), round((r + 1) * sh / 3)
                rgb = img[y0:y1, x0:x1]
                mask, sparks = cell_masks(rgb, dome=name.startswith("tree") and c == STAGES - 1)
                glow, strength = glow_of(rgb, mask)
                level = 2 if strength >= GLOW_STRONG else 1 if strength >= GLOW_SOFT else 0
                cells[name, c] = (rgb, mask, sparks, platform_anchor(mask), glow, level)
                print(f"  {name}-{c}: halo {strength:.1f}" + (" (glow)" if level else ""))
                if a.debug:
                    Path(a.debug).mkdir(parents=True, exist_ok=True)
                    dbg = rgb.copy()
                    dbg[~mask] = dbg[~mask] * 0.25 + np.array([255, 0, 255]) * 0.75
                    Image.fromarray(dbg.astype(np.uint8)).save(Path(a.debug) / f"mask-{name}-{c}.png")

    # one scale for every tile: the largest drawing must fit the box around its anchor
    s = np.inf
    for (_, _), (_, mask, sparks, (cx, bottom), _, level) in cells.items():
        ys, xs = np.nonzero(mask)
        top = min([ys.min()] + [sy - sz / 2 for _, sy, sz in sparks])
        room = 1 if level == 2 else 0  # the dithered halo needs one more pixel
        s = min(
            s,
            (HALF_W - room) / (cx - xs.min()),
            (HALF_W - room) / (xs.max() + 1 - cx),
            (BASELINE - TOP - room) / (bottom - top),
        )
    print(f"scale {s:.4f} source px -> tile px")

    for _, rows in SHEETS:
        for name in rows:
            px = np.vstack([cells[name, c][0][cells[name, c][1]] for c in range(STAGES)])
            pal = row_palette(px)
            k = len(pal)
            for c in range(STAGES):
                rgb, mask, sparks, anchor, glow, level = cells[name, c]
                g = clean(resample(quantise(rgb, pal), mask, anchor, s, k, line_weight(rgb)), pal)
                rgba = np.zeros((H, W, 4), np.uint8)
                solid = g >= 0
                rgba[solid, :3] = pal[g[solid]].astype(np.uint8)
                rgba[solid, 3] = 255
                stamp_sparks(rgba, sparks, anchor, s)
                if not a.no_ring:
                    ring(rgba, glow if level else None, level == 2)
                Image.fromarray(rgba, "RGBA").save(out / f"tile-{name}-{c}.png")
    print(f"wrote {len(cells)} tiles to {out}")


if __name__ == "__main__":
    main()
