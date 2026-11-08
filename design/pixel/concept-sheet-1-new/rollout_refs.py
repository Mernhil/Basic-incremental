"""Reference images for the restyle rollout: one concept crop (or gap-filled draft) per sprite, and
the old in-game counterpart it is rendered and sized like.

Writes <out>/refs/<name>-shape.png (the thing to draw) and prints a JSON table
{name: {shape, old, target_mass, target_bbox}} used to pick candidates.

Usage: py design/pixel/concept-sheet-1-new/rollout_refs.py <concept.jpg> <out dir>
"""
from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
SPR = ROOT / "src/renderer/src/art/pixel/sprites"
OLD = HERE.parent / "concept-sheet-1" / "old"
DRAFT = HERE / "drafts"
RAR = ["common", "rare", "epic", "legendary", "mythic", "exotic", "void"]


def load(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


NEW = load(HERE / "make_inputs.py", "new_inputs")
S1 = load(HERE.parent / "concept-sheet-1" / "make_inputs.py", "s1_inputs")
BOX = {e[0]: e[1] for e in NEW.ITEMS + NEW.ICONS + NEW.FXS + NEW.UI}
BOX.update({e[0]: e[1] for e in S1.ITEMS + S1.COINS + S1.STARS + S1.UNIQ})

# sprite -> (concept box name or draft/sprite png, old counterpart png)
TABLE: dict[str, tuple[str | Path, Path]] = {}
for i, r in enumerate(RAR):
    TABLE[f"item-katana-{r}"] = (f"katana-{i + 1}" if i < 6 else DRAFT / "items/item-katana-void.png", SPR / f"item-sword-{r}.png")
    TABLE[f"item-book-{r}"] = (f"book-{i + 1}", SPR / f"item-shield-{r}.png")
    staff = {"rare": "staff-A", "epic": "staff-B"}.get(r, DRAFT / f"items/item-staff-{r}.png")
    TABLE[f"item-staff-{r}"] = (staff, SPR / f"item-staff-{r}.png")
    TABLE[f"item-maul-{r}"] = (f"hammer-{i + 1}" if i < 6 else SPR / "item-maul-void.png", OLD / f"item-maul-{r}.png")
    TABLE[f"item-bow-{r}"] = (f"bow-{i + 1}" if i < 5 else SPR / f"item-bow-{r}.png", OLD / f"item-bow-{r}.png")
TABLE["evo-twin_daggers"] = ("unique-daggers", OLD / "evo-soul_reaper.png")
TABLE["evo-bronze_hammer"] = ("unique-hammer", OLD / "evo-soul_reaper.png")
TABLE["evo-flameblade"] = ("flameblade", OLD / "evo-flameblade.png")
TABLE["evo-soul_reaper"] = ("soul_reaper", OLD / "evo-soul_reaper.png")
for t, c in {"stone": "coin-F", "bronze": "coin-B", "silver": "coin-S", "gold": "coin-G", "prism": "coin-V",
             "locked": "coin-void"}.items():
    TABLE[f"coin-body-{t}"] = (c, OLD / f"coin-round-{t}.png")
for t, c in {0: "star-2", 1: "star-1", 2: "star-3", 3: "star-4", 4: "star-6"}.items():
    TABLE[f"medal-{t}"] = (c, OLD / f"medal-{t}.png")


def main() -> None:
    src = Image.open(sys.argv[1]).convert("RGB")
    out = Path(sys.argv[2]) / "refs"
    out.mkdir(parents=True, exist_ok=True)
    info = {}
    for name, (shape, old) in TABLE.items():
        dst = out / f"{name}-shape.png"
        if isinstance(shape, Path):
            im = Image.open(shape).convert("RGBA")
            # pixel art reference: give PixelLab the sprite at 2x, nearest neighbour
            im.resize((im.width * 2, im.height * 2), Image.NEAREST).save(dst)
        else:
            c = src.crop(BOX[shape])
            c.resize((c.width * 2, c.height * 2), Image.LANCZOS).save(dst)
        o = Image.open(old).convert("RGBA")
        b = o.getbbox()
        info[name] = {"shape": str(dst), "old": str(old), "old_bbox": [b[2] - b[0], b[3] - b[1]],
                      "old_mass": int(sum(1 for p in o.getdata() if p[3]))}
    print(json.dumps(info, indent=1))


if __name__ == "__main__":
    main()
