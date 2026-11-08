"""Cleans the PixelLab conversions of the rest of concept sheet 1 into draft sprites (not wired in).

PixelLab draws everything (see prompts.md). This only cuts each sprite from its converted sheet,
keys out the background, snaps it to a small palette, clears orphan pixels and adds the outline the
pixel rules ask for. It reuses the helpers of design/pixel/concept-sheet-1/post.py.

  - card items and the new uniques: ink outline and the light rim in their rarity's window colour
    (as the game's card items), plus the traced outline the element effects would follow
    (drafts/items/outlines.json, for when they are wired in);
  - icons (trail swatches, debuffs, portraits, flora, hex badges): ink outline and a white ring
    (sticker rule);
  - attack frames and magic patterns: no outline (effects are light, like the game's attack sheets),
    small specks kept (sparks, dotted lines);
  - interface pieces: ink outline; frames and panels are hollowed (their inside is transparent).

Gap-fills (pixellab/gap-*.png, already on transparency at their own size) get the same treatment.

Usage: py design/pixel/concept-sheet-1-new/post.py
Writes design/pixel/concept-sheet-1-new/drafts/<group>/*.png.
"""
from __future__ import annotations

import importlib.util
import json
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location("sheet1_post", HERE.parent / "concept-sheet-1" / "post.py")
P = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(P)

PL = HERE / "pixellab"
OUT = HERE / "drafts"
WORK = HERE / "work"  # gap-fill init images (gitignored)
RAR = ["common", "rare", "epic", "legendary", "mythic", "exotic", "void"]

# rarity <- concept step ("gap:<file>" = gap-filled with PixelLab from the step named in prompts.md)
KATANA = dict(zip(RAR, ["katana-1", "katana-2", "katana-3", "katana-4", "katana-5", "katana-6", "gap:katana-void"]))
BOOK = dict(zip(RAR, [f"book-{i}" for i in range(1, 8)]))
STAFF = dict(zip(RAR, ["gap:staff-common", "staff-A", "staff-B", "gap:staff-legendary", "gap:staff-mythic",
                       "gap:staff-exotic", "gap:staff-void"]))
UNIQUES = {"twin_daggers": ("unique-daggers", "void"), "bronze_hammer": ("unique-hammer", "legendary")}
# attack frames PixelLab's animate_image added after the last concept frame (pixellab/anim-*)
ATTACK_GAPS = {"atk-crimson-4": "anim-crimson-4", "atk-triple-4": "anim-triple-4",
               "atk-pierce-3": "anim-pierce-3", "atk-pierce-4": "anim-pierce-4", "atk-burst-4": "anim-burst-4"}
ATTACK_STRIPS = {style: [f"atk-{style}-{i}" for i in range(1, 5)]
                 for style in ("cross", "crimson", "triple", "pierce", "burst")}
HOLLOW = {"frame-1", "frame-2", "frame-3", "frame-4", "panel-wide", "cos-frame-1", "cos-frame-2",
          "cos-frame-wide", "bar-progress"}


def binarize(a: np.ndarray) -> np.ndarray:
    a = a.copy()
    a[..., 3] = np.where(a[..., 3] >= 128, 255, 0)
    a[a[..., 3] == 0] = 0
    return a


def hollow(a: np.ndarray, dark: int = 40) -> np.ndarray:
    """Clears the dark inside of a frame: dark pixels connected to the centre."""
    h, w = a.shape[:2]
    near = (a[..., :3].max(-1) < dark) | (a[..., 3] == 0)
    seen = np.zeros((h, w), bool)
    q = deque([(w // 2, h // 2)])
    while q:
        x, y = q.popleft()
        if x < 0 or y < 0 or x >= w or y >= h or seen[y, x] or not near[y, x]:
            continue
        seen[y, x] = True
        q.extend((x + dx, y + dy) for dx, dy in P.N4)
    out = a.copy()
    out[seen] = 0
    return out


def key_all_dark(a: np.ndarray, dark: int) -> np.ndarray:
    """Effects are light only: every dark pixel goes, inside rings and between rays too."""
    out = P.key_background(a)
    out[out[..., :3].max(-1) < dark] = 0
    return out


def clean(a: np.ndarray, n: int, keep: int = 12, ink: bool = True, inner: bool = False,
          dark: int = 0) -> np.ndarray:
    a = P.drop_specks(key_all_dark(a, dark) if dark else P.key_background(a), keep)
    if inner:
        a = hollow(a)
    a = P.settle_orphans(P.sweep_orphans(P.clean_orphans(P.quantize(a, n))))
    return P.ring(a, P.INK) if ink else a


RAMPS = {  # magic patterns: four tones per family, dark to bright, from the concept's lines
    "gold": ["#8c6a36", "#c99a4e", "#f0d088", "#fff4cc"],
    "purple": ["#6c4a8c", "#a274c8", "#d2b0f0", "#f6eaff"],
    "silver": ["#767c8c", "#b0b6c4", "#dfe3ec", "#ffffff"],
}


# the concept's colour per pattern: 01 and 03 purple, 02 silver, every other one gold
MAGIC_FAMILY = {"magic-01": "purple", "magic-02": "silver", "magic-03": "purple"}


def glow_ramp(a: np.ndarray, fam: str) -> np.ndarray:
    """Snaps a light-only pattern onto its family's four-tone ramp by brightness rank, so thin
    dotted lines read as bright as on the concept (the conversion leaves them dim)."""
    m = a[..., 3] > 0
    if not m.any():
        return a
    rgb = a[m][:, :3].astype(float)
    lum = rgb @ [0.3, 0.59, 0.11]
    qs = np.quantile(lum, [0.25, 0.5, 0.8])
    idx = np.searchsorted(qs, lum)
    out = a.copy()
    out[m, :3] = np.array([P.hexrgb(c) for c in RAMPS[fam]])[idx]
    return out


def save(a: np.ndarray, group: str, name: str) -> None:
    d = OUT / group
    d.mkdir(parents=True, exist_ok=True)
    Image.fromarray(a, "RGBA").save(d / f"{name}.png")


def gap(name: str) -> np.ndarray | None:
    f = PL / f"{name}.png"
    if not f.exists():
        return None
    return binarize(np.array(Image.open(f).convert("RGBA"), dtype=np.uint8))


def main() -> None:
    lay = json.loads((HERE / "layout.json").read_text())
    sheets = {k: Image.open(PL / f"{k}.png") for k in ("items", "icons", "fx", "ui")}
    cut = lambda sheet, name: P.cut(sheets[sheet], lay[sheet], name)  # noqa: E731
    outlines: dict[str, str] = {}
    WORK.mkdir(exist_ok=True)

    # card items: katana, rune book, cross staff
    for kind, table in (("katana", KATANA), ("book", BOOK), ("staff", STAFF)):
        for rarity, src in table.items():
            if src.startswith("gap:"):
                a = gap(src[4:])
                if a is None:
                    continue
                a = P.ring(P.settle_orphans(P.sweep_orphans(P.clean_orphans(P.quantize(P.drop_specks(a, 12), 24)))), P.INK)
            else:
                a = clean(cut("items", src), 24)
            name = f"item-{kind}-{rarity}"
            # the raw cleaned item (no rim) is what gap-fills start from
            Image.fromarray(a, "RGBA").save(WORK / f"{name}.png")
            outlines[name] = P.trace(a)
            save(P.ring(a, P.mix(P.RARITY_WINDOW[rarity], "#ffffff", 0.3), skip_white=True), "items", name)

    # new uniques, same treatment as the evo sprites
    for evo, (src, window) in UNIQUES.items():
        a = clean(cut("items", src), 28)
        save(P.ring(a, P.mix(P.RARITY_WINDOW[window], "#ffffff", 0.3), skip_white=True), "uniques", f"evo-{evo}")
    (OUT / "items").mkdir(parents=True, exist_ok=True)
    (OUT / "items" / "outlines.json").write_text(json.dumps(outlines, indent=2, sort_keys=True) + "\n")

    # icons
    for name in lay["icons"]:
        group = name.split("-")[0]
        group = {"hex": "interface", "flora": "cosmetics", "portrait": "cosmetics"}.get(group, group)
        a = clean(cut("icons", name), 16, keep=6)
        save(P.ring(a, P.WHITE), {"trail": "trails", "debuff": "debuffs"}.get(group, group), name)

    # attack frames and magic patterns: light, no outline, keep the sparks and dots
    for name in lay["fx"]:
        atk = name.startswith("atk")
        a = clean(cut("fx", name), 16 if atk else 10, keep=1, ink=False, dark=48 if atk else 56)
        if not atk:
            a = glow_ramp(a, MAGIC_FAMILY.get(name, "gold"))
        save(a, "attacks/frames" if name.startswith("atk") else "magic", name)
    for frame, src in ATTACK_GAPS.items():
        a = gap(src)
        a[a[..., :3].max(-1) < 48] = 0
        save(P.settle_orphans(P.quantize(P.drop_specks(a, 1), 16)), "attacks/frames", frame)
    # the 4-frame strips (snap, held hit, thin, break), 64 x 64 per frame like cos-atk-*
    for style, frames in ATTACK_STRIPS.items():
        strip = Image.new("RGBA", (64 * 4, 64), (0, 0, 0, 0))
        for i, f in enumerate(frames):
            strip.alpha_composite(Image.open(OUT / "attacks/frames" / f"{f}.png"), (64 * i, 0))
        strip.save(OUT / "attacks" / f"atk-{style}.png")

    # interface and cosmetic frames
    for name in lay["ui"]:
        a = clean(cut("ui", name), 16, keep=6, inner=name in HOLLOW)
        save(a, "cosmetics" if name.startswith("cos-") else "interface", name)


if __name__ == "__main__":
    main()
