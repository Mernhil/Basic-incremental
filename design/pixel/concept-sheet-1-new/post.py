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


def clean(a: np.ndarray, n: int, keep: int = 12, ink: bool = True, inner: bool = False) -> np.ndarray:
    a = P.drop_specks(P.key_background(a), keep)
    if inner:
        a = hollow(a)
    a = P.settle_orphans(P.sweep_orphans(P.clean_orphans(P.quantize(a, n))))
    return P.ring(a, P.INK) if ink else a


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
        a = clean(cut("fx", name), 16 if name.startswith("atk") else 8, keep=1, ink=False)
        save(a, "attacks/frames" if name.startswith("atk") else "magic", name)
    for f in sorted(PL.glob("gap-atk-*.png")):
        a = gap(f.stem)
        a = P.settle_orphans(P.quantize(a, 16))
        save(a, "attacks/frames", f.stem[4:])

    # interface and cosmetic frames
    for name in lay["ui"]:
        a = clean(cut("ui", name), 16, keep=6, inner=name in HOLLOW)
        save(a, "cosmetics" if name.startswith("cos-") else "interface", name)


if __name__ == "__main__":
    main()
