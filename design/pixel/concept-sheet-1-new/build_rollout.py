"""Cleans every picked PixelLab candidate of the restyle rollout into a draft sprite.

For each sprite in picks.json: the raw candidate (pixellab/rollout/<name>-<i>.png) is padded to the
game canvas (never rescaled), put through restyle.clean (palette rule, ink, rim, sparkles) and saved to
restyled/<group>/. Coins get the resource's gem for all six shapes. The pilot sprites (epic items, the
bronze hammer, the gold coin) come from pilot/ and the pixellab/restyle raw picks.

Usage: py design/pixel/concept-sheet-1-new/build_rollout.py <table.json> <picks.json> <out dir>
"""
from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent


def load(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


RS = load(HERE / "restyle.py", "restyle")
P = RS.P
RAW = HERE / "pixellab/rollout"
PILOT_RAW = {"coin-body-gold": HERE / "pixellab/restyle/pro-m-coin-round-gold-2.png"}
REDO = HERE / "pixellab/redo"  # second round after the review: slimmer bows, lighter Soul Reaper, longer staffs
PILOT_RAW.update({
    "evo-soul_reaper": REDO / "evo-soul_reaper-b-1.png",
    "item-bow-legendary": REDO / "item-bow-legendary-1.png",
    "item-bow-mythic": REDO / "item-bow-mythic-0.png",
    "item-bow-exotic": REDO / "item-bow-exotic-1.png",
    "item-bow-void": REDO / "item-bow-void-1.png",
    "item-staff-common": REDO / "item-staff-common-0.png",
    "item-staff-rare": REDO / "item-staff-rare-0.png",
    "item-staff-legendary": REDO / "item-staff-legendary-1.png",
})
PILOT_DONE: set[str] = set()  # the pilot sprites are rebuilt from their raw picks like the rest
PILOT_RAW.update({
    "item-katana-epic": HERE / "pixellab/restyle/pro-o-item-katana-epic-0.png",
    "item-staff-epic": HERE / "pixellab/restyle/pro-n-item-staff-epic-0.png",
    "item-book-epic": HERE / "pixellab/restyle/pro-m-item-book-epic-0.png",
    "item-maul-epic": HERE / "pixellab/restyle/pro-m-item-maul-epic-2.png",
    "evo-bronze_hammer": HERE / "pixellab/restyle/pro-m-evo-bronze_hammer-3.png",
})
KEEP_LARGEST = {"item-maul-common"}
SHAPES = ["round", "square", "hexagon", "pentagon", "star", "drop"]
RING_TIER = {"stone": "stone", "bronze": "bronze", "silver": "silver", "gold": "gold", "prism": "prism",
             "locked": "locked"}
WINDOW = {"evo-twin_daggers": "void", "evo-bronze_hammer": "legendary", "evo-flameblade": "legendary",
          "evo-soul_reaper": "void"}


def raw_for(name: str, pick) -> Path:
    if name in PILOT_RAW:
        return PILOT_RAW[name]
    return RAW / f"{name}-{pick}.png"


def padded(raw: Image.Image, old: Image.Image) -> np.ndarray:
    a = np.array(raw.convert("RGBA"), dtype=np.uint8)
    if a.shape[:2] != (old.height, old.width):
        b = old.getbbox()
        a = RS.pad_to(a, old.size, ((b[0] + b[2]) / 2, (b[1] + b[3]) / 2))
    return a


def save(a: np.ndarray, group: str, name: str, out: Path) -> None:
    d = out / group
    d.mkdir(parents=True, exist_ok=True)
    Image.fromarray(a, "RGBA").save(d / f"{name}.png")


def main() -> None:
    table = json.loads(Path(sys.argv[1]).read_text())
    picks = json.loads(Path(sys.argv[2]).read_text())
    out = Path(sys.argv[3])
    pilot = HERE / "pilot"
    for name, pick in picks.items():
        info = table[name]
        old = Image.open(info["old"]).convert("RGBA")
        old_a = np.array(old, dtype=np.uint8)
        if name in PILOT_DONE:
            group = "uniques" if name.startswith("evo-") else "items"
            Image.open(pilot / f"{name}.png").save(_mk(out, group) / f"{name}.png")
            continue
        raw = padded(Image.open(raw_for(name, pick)), old)
        if name in KEEP_LARGEST:  # the candidate has loose fragments: keep only the weapon itself
            from skimage import measure

            lab = measure.label(raw[..., 3] > 0, connectivity=2)
            biggest = np.bincount(lab[lab > 0]).argmax()
            raw[(lab != biggest)] = 0
        if name.startswith("coin-body-"):
            tier = name.split("-")[2]
            for shape in SHAPES:
                a = RS.clean(raw, f"coin-{RING_TIER[tier]}", shape, None)
                save(a, "coins", f"coin-{shape}-{tier}", out)
        elif name.startswith("medal-"):
            RS.MATERIALS["sticker"] = 6 if name.endswith("4") else 4
            save(RS.clean(raw, "sticker"), "medals", name, out)
        elif name.startswith("evo-"):
            save(RS.clean(raw, f"unique-{WINDOW[name]}", None, old_a), "uniques", name, out)
        else:
            rarity = name.rsplit("-", 1)[1]
            save(RS.clean(raw, f"item-{rarity}", None, old_a), "items", name, out)
    print("built", sum(1 for _ in out.rglob("*.png")), "sprites in", out)


def _mk(out: Path, group: str) -> Path:
    d = out / group
    d.mkdir(parents=True, exist_ok=True)
    return d


if __name__ == "__main__":
    main()
