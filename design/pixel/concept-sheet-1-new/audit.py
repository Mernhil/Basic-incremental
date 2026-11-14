"""Audit of the restyled sprites against the review rule: keep PixelLab's shading when within budget
(snap only over-budget ones), no loose fragments. Prints per sprite: raw colours, final colours,
whether the snap ran, loose fragments (non-white pieces apart from the main body, 6+ px), isolated %.
Usage: py audit.py <table.json> <picks.json>"""
import importlib.util, json, sys
from pathlib import Path
import numpy as np
from PIL import Image
from skimage import measure
H = Path(__file__).resolve().parent
def load(p, n):
    s = importlib.util.spec_from_file_location(n, p); m = importlib.util.module_from_spec(s); s.loader.exec_module(m); return m
B = load(H / "build_rollout.py", "br"); RS = B.RS; F = B.F if hasattr(B, "F") else RS.F
table = json.loads(Path(sys.argv[1]).read_text()); picks = json.loads(Path(sys.argv[2]).read_text())
rows = []
for name, pick in picks.items():
    if name in B.PILOT_DONE or name.startswith("coin-body") is False and False: pass
    old = Image.open(table[name]["old"]).convert("RGBA")
    raw = B.padded(Image.open(B.raw_for(name, pick if name not in B.PILOT_DONE else 0) if name not in B.PILOT_DONE else H/"pilot"/f"{name}.png"), old) if name not in B.PILOT_DONE else np.array(Image.open(H/"pilot"/f"{name}.png").convert("RGBA"))
    a = raw.copy(); a[a[..., 3] < 200] = 0; a[..., 3] = np.where(a[..., 3] > 0, 255, 0)
    a = RS.unhalo(a); a = RS.P.drop_specks(a, 6)
    base = "unique" if name.startswith("evo-") else "item" if name.startswith("item-") else "coin" if name.startswith("coin") else "sticker"
    if base == "coin": a = RS.P.disc(a, 20.5)
    a = RS.ink_edge(a)
    n = len({tuple(c) for c in a[a[..., 3] > 0][:, :3]})
    snapped = n > RS.BUDGET[base] and name not in B.PILOT_DONE
    lab = measure.label((a[..., 3] > 0) & ~np.all(a[..., :3] == 255, -1), connectivity=2)
    areas = sorted([r.area for r in measure.regionprops(lab)], reverse=True)
    loose = [x for x in areas[1:] if x >= 6]
    rows.append((name, n, snapped, loose[:4], len(areas)))
for r in rows:
    flag = ("SNAPPED " if r[2] else "") + ("LOOSE%s" % r[3] if r[3] else "")
    if flag: print(r[0], "raw colours", r[1], flag)
print("checked", len(rows))
