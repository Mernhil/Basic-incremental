"""Post-processes the PixelLab conversions of concept sheet 1 into game sprites (cleanup only).

PixelLab (image_to_pixelart, see prompts.md) draws every sprite. This script only:
  - cuts each sprite out of the converted sheet on its game-size cell,
  - keys out the sheet's dark background and drops specks,
  - snaps each sprite to a small palette (no dithering) and clears orphan pixels,
  - puts the one-pixel ink outline on the silhouette and the ring outside it (DESIGN.md §12 Pixel
    rules: tier colour on coins as before, white on medals, the light rim on card items),
  - for coins, sets the resource's gem (and the padlock on locked coins) from the approved coin
    sprites back on the new coin, so each resource keeps its icon (DESIGN.md §12 "Resources are
    carved gems"),
  - for card items, keeps the approved plus-sparkles where they do not touch the new item, and
    writes the outline the element effects trace (hand/outlines.json).

Usage: py design/pixel/concept-sheet-1/post.py
Reads design/pixel/concept-sheet-1/pixellab/*.png and the current sprites (for gems, sparkles),
writes src/renderer/src/art/pixel/hand/*.png and hand/outlines.json.
"""
from __future__ import annotations

import json
import math
from collections import Counter, deque
from pathlib import Path

import numpy as np
from PIL import Image
from skimage import measure

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
PL = HERE / "pixellab"
SPRITES = ROOT / "src/renderer/src/art/pixel/sprites"
OLD = HERE / "old"  # the sprites as they were before this pass (gems, sparkles, before/after)
HAND = ROOT / "src/renderer/src/art/pixel/hand"

INK = (0x1A, 0x10, 0x20)
WHITE = (255, 255, 255)
BG = (20, 19, 27)
COIN_RING = {  # art/vector/gems.ts COIN_RING
    "stone": "#b8bec8",
    "bronze": "#e6a464",
    "silver": "#eef2f8",
    "gold": "#ffd84a",
    "prism": "#ffc8f4",
}
RARITY_WINDOW = {  # art/vector/items.ts RARITY_WINDOW
    "common": "#2a303c",
    "rare": "#16294d",
    "epic": "#2c1a4f",
    "legendary": "#4a2b0d",
    "mythic": "#1d0d19",
    "exotic": "#1f1108",
    "void": "#120d1c",
}
# the approved coin's dark well and the gem's shadow in it: not part of the gem
WELL = {(29, 35, 53), (58, 87, 100), (10, 11, 20)}
SHAPES = ["round", "square", "hexagon", "pentagon", "star", "drop"]

# ---- the mappings (see the README / report for the reasons) ----
COINS = {  # coin tier <- concept coin
    "stone": "coin-F",
    "bronze": "coin-B",
    "silver": "coin-S",
    "gold": "coin-G",
    "prism": "coin-V",
    "locked": "coin-void",
}
MEDALS = {0: "star-2", 1: "star-1", 2: "star-3", 3: "star-4", 4: "star-6"}  # star-5 unused
MAUL = {
    "common": "hammer-1",
    "rare": "hammer-2",
    "epic": "hammer-3",
    "legendary": "hammer-4",
    "mythic": "hammer-5",
    "exotic": "hammer-6",
    "void": "gap:maul-void",
}
BOW = {
    "common": "bow-1",
    "rare": "bow-2",
    "epic": "bow-3",
    "legendary": "bow-4",
    "mythic": "bow-5",
    "exotic": "gap:bow-exotic",
    "void": "gap:bow-void",
}
UNIQUES = {"flameblade": "flameblade", "soul_reaper": "soul_reaper"}


def hexrgb(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]


def mix(a: str, b: str, t: float) -> tuple[int, int, int]:
    pa, pb = hexrgb(a), hexrgb(b)
    return tuple(round(pa[i] + (pb[i] - pa[i]) * t) for i in range(3))  # type: ignore[return-value]


N4 = ((1, 0), (-1, 0), (0, 1), (0, -1))
N8 = tuple((a, b) for a in (-1, 0, 1) for b in (-1, 0, 1) if a or b)


# A sprite is an (h, w, 4) uint8 array; alpha is 0 or 255.


def cut(sheet: Image.Image, layout: dict, name: str) -> np.ndarray:
    x, y, w, h = layout[name]
    return np.array(sheet.convert("RGBA").crop((x, y, x + w, y + h)), dtype=np.uint8)


def key_background(a: np.ndarray, dark: int = 40) -> np.ndarray:
    """Clears the sheet background and PixelLab's soft dark edge: dark pixels (every channel below
    `dark`) that connect to the cell's border. The ink outline is put back cleanly afterwards."""
    h, w = a.shape[:2]
    near = (a[..., :3].max(-1) < dark) | (a[..., 3] < 128)
    seen = np.zeros((h, w), bool)
    q = deque((x, y) for x in range(w) for y in (0, h - 1))
    q.extend((x, y) for y in range(h) for x in (0, w - 1))
    while q:
        x, y = q.popleft()
        if x < 0 or y < 0 or x >= w or y >= h or seen[y, x] or not near[y, x]:
            continue
        seen[y, x] = True
        q.extend((x + dx, y + dy) for dx, dy in N4)
    out = a.copy()
    out[seen] = 0
    out[..., 3] = np.where(out[..., 3] >= 128, 255, 0)
    out[out[..., 3] == 0] = 0
    return out


def disc(a: np.ndarray, r: float) -> np.ndarray:
    """Clips a coin to a clean round silhouette of radius r (centre of the 48 x 48 box)."""
    h, w = a.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w]
    out = a.copy()
    out[np.hypot(xx - (w - 1) / 2, yy - (h - 1) / 2) > r] = 0
    return out


def drop_specks(a: np.ndarray, keep: int = 4) -> np.ndarray:
    lab = measure.label(a[..., 3] > 0, connectivity=2)
    out = a.copy()
    for r in measure.regionprops(lab):
        if r.area < keep:
            out[lab == r.label] = 0
    return out


def quantize(a: np.ndarray, n: int) -> np.ndarray:
    """Snaps the opaque pixels onto an n-colour palette taken from the sprite (no dithering)."""
    m = a[..., 3] > 0
    px = a[m][:, :3]
    if len(np.unique(px, axis=0)) <= n:
        return a
    strip = Image.fromarray(px.reshape(1, -1, 3).astype(np.uint8), "RGB")
    pal = strip.quantize(colors=n, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    q = np.array(pal.convert("RGB")).reshape(-1, 3)
    out = a.copy()
    out[m, :3] = q
    return out


def colour_at(a, x, y):
    h, w = a.shape[:2]
    if x < 0 or y < 0 or x >= w or y >= h or a[y, x, 3] == 0:
        return None
    return tuple(int(v) for v in a[y, x, :3])


def clean_orphans(a: np.ndarray, passes: int = 2) -> np.ndarray:
    """raster.ts cleanOrphans: a pixel whose four neighbours share one other colour takes it."""
    h, w = a.shape[:2]
    for _ in range(passes):
        out = a.copy()
        for y in range(h):
            for x in range(w):
                if a[y, x, 3] == 0:
                    continue
                nb = [colour_at(a, x + dx, y + dy) for dx, dy in N4]
                if nb[0] is not None and all(c == nb[0] for c in nb) and nb[0] != colour_at(a, x, y):
                    out[y, x, :3] = nb[0]
        a = out
    return a


def sweep_orphans(a: np.ndarray) -> np.ndarray:
    """raster.ts sweepOrphans: a lone pixel (no same-colour 8-neighbour) takes its main neighbour."""
    h, w = a.shape[:2]
    out = a.copy()
    for y in range(h):
        for x in range(w):
            c = colour_at(a, x, y)
            if c is None or c in (INK, WHITE):
                continue
            if any(colour_at(a, x + dx, y + dy) == c for dx, dy in N8):
                continue
            cnt = Counter(q for dx, dy in N4 if (q := colour_at(a, x + dx, y + dy)) and q != WHITE)
            if cnt:
                best, k = cnt.most_common(1)[0]
                if k >= 2:
                    out[y, x, :3] = best
    return out


def lum(c) -> float:
    return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255


def settle_orphans(a: np.ndarray, passes: int = 4) -> np.ndarray:
    """A pixel whose colour none of its 8 neighbours share (pixel_check's orphan, glints aside)
    takes the colour most of its neighbours have. The concept's texture leaves many of these."""
    h, w = a.shape[:2]
    for _ in range(passes):
        out = a.copy()
        changed = False
        for y in range(h):
            for x in range(w):
                c = colour_at(a, x, y)
                if c is None or c == INK or lum(c) >= 0.9:
                    continue
                nb = [q for dx, dy in N8 if (q := colour_at(a, x + dx, y + dy)) is not None]
                if not nb or c in nb:
                    continue
                best = Counter(nb).most_common(1)[0][0]
                out[y, x, :3] = best
                changed = True
        a = out
        if not changed:
            break
    return a


def outline(a: np.ndarray) -> np.ndarray:
    """raster.ts outline: the outermost opaque pixels become ink."""
    h, w = a.shape[:2]
    out = a.copy()
    for y in range(h):
        for x in range(w):
            if a[y, x, 3] and any(colour_at(a, x + dx, y + dy) is None for dx, dy in N4):
                out[y, x, :3] = INK
    return out


def ring(a: np.ndarray, colour, skip_white: bool = False) -> np.ndarray:
    """raster.ts ring: one pixel of `colour` outside the silhouette."""
    h, w = a.shape[:2]
    out = a.copy()
    for y in range(h):
        for x in range(w):
            if a[y, x, 3]:
                continue
            for dx, dy in N4:
                q = colour_at(a, x + dx, y + dy)
                if q is not None and not (skip_white and q == WHITE):
                    out[y, x] = (*colour, 255)
                    break
    return out


def treat(a: np.ndarray, n: int, coin: bool = False, keep: int = 4) -> np.ndarray:
    """Key, palette, orphans, then the ink outline as one clean pixel outside the colour."""
    a = drop_specks(key_background(a), keep)
    if coin:
        a = disc(a, 19.5)
    a = settle_orphans(sweep_orphans(clean_orphans(quantize(a, n))))
    return ring(a, INK)


# ---- coins: the resource's gem from the approved coin ----


def old(name: str) -> np.ndarray:
    return np.array(Image.open(OLD / f"{name}.png").convert("RGBA"), dtype=np.uint8)


def gem_layer(shape: str, locked: bool) -> np.ndarray:
    """The gem (and padlock) of the approved coin, on transparency."""
    src = old(f"coin-{shape}-{'locked' if locked else 'bronze'}")
    h, w = src.shape[:2]
    well = Counter()
    for y in range(h):
        for x in range(w):
            if 12.6 <= math.hypot(x - 23.5, y - 23.5) <= 15.0 and src[y, x, 3]:
                well[tuple(int(v) for v in src[y, x, :3])] += 1
    well_set = {c for c, k in well.items() if k >= 2 and c != INK} | WELL
    seen = np.zeros((h, w), bool)
    q = deque([(24, 24)])
    while q:
        x, y = q.popleft()
        if seen[y, x] or math.hypot(x - 23.5, y - 23.5) > 14.6:
            continue
        c = colour_at(src, x, y)
        if c is None or c in well_set:
            continue
        seen[y, x] = True
        q.extend((x + dx, y + dy) for dx, dy in N4)
    out = np.zeros_like(src)
    out[seen] = src[seen]
    if locked:
        # the padlock: what the locked coin adds over the stone coin, in the padlock's box
        stone = old(f"coin-{shape}-stone")
        lock = np.zeros((h, w), bool)
        for y in range(25, 44):
            for x in range(26, 42):
                c = colour_at(src, x, y)
                if c is None or seen[y, x] or c in (INK, hexrgb(COIN_RING["stone"])):
                    continue
                if not np.array_equal(src[y, x], stone[y, x]):
                    lock[y, x] = True
        # its ink edge
        edge = np.zeros((h, w), bool)
        for y in range(24, 45):
            for x in range(25, 43):
                if colour_at(src, x, y) == INK and any(
                    0 <= y + dy < h and 0 <= x + dx < w and lock[y + dy, x + dx] for dx, dy in N8
                ):
                    edge[y, x] = True
        lock |= edge
        out[lock] = src[lock]
    return out


def over(base: np.ndarray, top: np.ndarray) -> np.ndarray:
    out = base.copy()
    m = top[..., 3] > 0
    out[m] = top[m]
    return out


# ---- card items: approved sparkles and the traced outline ----


def free_sparkles(old_a: np.ndarray) -> list[list[tuple[int, int]]]:
    """White plus-sparkles of the approved sprite that float free of the item."""
    white = np.all(old_a[..., :3] == 255, -1) & (old_a[..., 3] > 0)
    lab = measure.label(white, connectivity=1)
    res = []
    h, w = white.shape
    for r in measure.regionprops(lab):
        pts = [(int(x), int(y)) for y, x in r.coords]
        touch = any(
            0 <= y + dy < h and 0 <= x + dx < w and old_a[y + dy, x + dx, 3] and not white[y + dy, x + dx]
            for x, y in pts
            for dx, dy in N8
        )
        if not touch and len(pts) >= 3:
            res.append(pts)
    return res


def add_sparkles(a: np.ndarray, sparks) -> np.ndarray:
    h, w = a.shape[:2]
    out = a.copy()
    for pts in sparks:
        clear = all(
            not (0 <= y + dy < h and 0 <= x + dx < w and a[y + dy, x + dx, 3])
            for x, y in pts
            for dx in (-2, -1, 0, 1, 2)
            for dy in (-2, -1, 0, 1, 2)
        )
        if clear:
            for x, y in pts:
                out[y, x] = (255, 255, 255, 255)
    return out


def trace(a: np.ndarray) -> str:
    """The item's silhouette as a closed path in item-box units (200 x 240), 96 points."""
    m = np.pad((a[..., 3] > 0) & ~np.all(a[..., :3] == 255, -1), 1)
    best = max(measure.find_contours(m.astype(float), 0.5), key=len)
    seg = np.sqrt((np.diff(best, axis=0) ** 2).sum(1))
    s = np.concatenate([[0], np.cumsum(seg)])
    pts = []
    for i in range(96):
        t = s[-1] * i / 96
        k = min(np.searchsorted(s, t, side="right") - 1, len(best) - 2)
        f = (t - s[k]) / (seg[k] or 1)
        yy, xx = best[k] + (best[k + 1] - best[k]) * f
        pts.append(f"{round((xx - 1 + 0.5) * 2 * 10) / 10:g} {round((yy - 1 + 0.5) * 2 * 10) / 10:g}")
    return "M" + " L".join(pts) + "Z"


def save(a: np.ndarray, name: str) -> None:
    Image.fromarray(a, "RGBA").save(HAND / f"{name}.png")


def main() -> None:
    layout = json.loads((HERE / "layout.json").read_text())
    small = Image.open(PL / "small.png")
    items = Image.open(PL / "items.png")
    uniques = Image.open(PL / "uniques.png")
    HAND.mkdir(parents=True, exist_ok=True)
    outlines: dict[str, str] = {}
    raw: dict[str, np.ndarray] = {}

    # coins
    for tier, src in COINS.items():
        body = treat(cut(small, layout["small"], src), 14, coin=True)
        raw[src] = body
        colour = hexrgb(COIN_RING["stone" if tier == "locked" else tier])
        for shape in SHAPES:
            g = settle_orphans(over(body, gem_layer(shape, tier == "locked")), 8)
            save(ring(g, colour), f"coin-{shape}-{tier}")
    # the lettered coins as converted, for the before/after only
    for src in ("coin-B", "coin-F", "coin-S", "coin-G", "coin-V", "coin-void"):
        Image.fromarray(ring(treat(cut(small, layout["small"], src), 14, coin=True), WHITE), "RGBA").save(
            HERE / "work" / f"{src}.png"
        )

    # medals
    for t, src in MEDALS.items():
        save(ring(treat(cut(small, layout["small"], src), 16 if t == 4 else 10), WHITE), f"medal-{t}")

    # card items
    for kind, table in (("maul", MAUL), ("bow", BOW)):
        for rarity, src in table.items():
            if src.startswith("gap:"):
                gap = PL / f"{src[4:]}.png"
                if not gap.exists():
                    continue
                a = np.array(Image.open(gap).convert("RGBA"), dtype=np.uint8)
                a[..., 3] = np.where(a[..., 3] >= 128, 255, 0)
                a[a[..., 3] == 0] = 0
                a = ring(settle_orphans(sweep_orphans(clean_orphans(quantize(drop_specks(a), 24)))), INK)
            else:
                # keep=12 drops the concept's tier stars that peek in under the hammers
                a = treat(cut(items, layout["items"], src), 24, keep=12)
            name = f"item-{kind}-{rarity}"
            np.save(HERE / "work" / f"{name}.npy", a)  # gap-fill init images: no sparkles
            if rarity != "common":
                a = add_sparkles(a, free_sparkles(old(name)))
            outlines[name] = trace(a)
            save(ring(a, mix(RARITY_WINDOW[rarity], "#ffffff", 0.3), skip_white=True), name)

    # uniques: same slot and size; their live motion is layered on top as before
    for evo, src in UNIQUES.items():
        a = treat(cut(uniques, layout["uniques"], src), 28)
        window = {"flameblade": "legendary", "soul_reaper": "void"}[evo]
        a = add_sparkles(a, free_sparkles(old(f"evo-{evo}")))
        save(ring(a, mix(RARITY_WINDOW[window], "#ffffff", 0.3), skip_white=True), f"evo-{evo}")

    (HAND / "outlines.json").write_text(json.dumps(outlines, indent=2, sort_keys=True) + "\n")


if __name__ == "__main__":
    main()
