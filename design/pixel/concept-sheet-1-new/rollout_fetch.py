"""Downloads the candidates of finished PixelLab jobs, measures each against its old counterpart
(footprint.py) and draws a pick sheet (candidates at 2x, the old sprite first, numbers under each).

Usage: py design/pixel/concept-sheet-1-new/rollout_fetch.py <table.json> <jobs.json> <out dir> <sheet.png>
  jobs.json: {sprite name: [job id, candidate count]}
Raw candidates land in <out dir>/<name>-<i>.png (the folder is committed as the PixelLab record).
"""
from __future__ import annotations

import concurrent.futures as cf
import importlib.util
import json
import sys
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
_fp = importlib.util.spec_from_file_location("footprint", HERE / "footprint.py")
F = importlib.util.module_from_spec(_fp)
_fp.loader.exec_module(F)
URL = "https://api.pixellab.ai/mcp/images/{}/download?index={}"


def fetch(job: str, i: int, dst: Path) -> None:
    if dst.exists():
        return
    req = urllib.request.Request(URL.format(job, i), headers={"User-Agent": "bi-art-pipeline"})
    with urllib.request.urlopen(req) as r:
        dst.write_bytes(r.read())


def main() -> None:
    table = json.loads(Path(sys.argv[1]).read_text())
    jobs = json.loads(Path(sys.argv[2]).read_text())
    out = Path(sys.argv[3])
    out.mkdir(parents=True, exist_ok=True)
    work = [(job, i, out / f"{name}-{i}.png") for name, (job, n) in jobs.items() for i in range(n)]
    with cf.ThreadPoolExecutor(8) as ex:
        list(ex.map(lambda w: fetch(*w), work))
    f = ImageFont.truetype("segoeui.ttf", 11)
    rows = []
    for name, (job, n) in jobs.items():
        old = Path(table[name]["old"])
        cells = [(old, "old", F.metrics(old))] + [(out / f"{name}-{i}.png", str(i), F.metrics(out / f"{name}-{i}.png")) for i in range(n)]
        rows.append((name, cells))
        print(name, "target", table[name]["old_bbox"], table[name]["old_mass"])
        for _, lab, m in cells[1:]:
            print("   ", lab, m["bbox"], m["mass"], m["tones"])
    cw = 2 * 120 + 8
    sheet = Image.new("RGB", (cw * 10, sum(2 * 120 + 40 for _ in rows)), (30, 33, 46))
    d = ImageDraw.Draw(sheet)
    y = 0
    for name, cells in rows:
        d.text((4, y), name, font=f, fill=(226, 230, 240))
        for k, (p, lab, m) in enumerate(cells[:10]):
            im = Image.open(p).convert("RGBA")
            im = im.resize((im.width * 2, im.height * 2), Image.NEAREST)
            sheet.paste(im, (k * cw, y + 14), im)
            d.text((k * cw, y + 14 + 2 * 120 + 2), f"{lab} {m['bbox']} {m['mass']}", font=f, fill=(150, 156, 176))
        y += 2 * 120 + 40
    sheet.save(sys.argv[4])


if __name__ == "__main__":
    main()
