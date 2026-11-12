"""Contact sheets of the top-tier weapon looks on their real cards (shots from scripts/shoot-top-tier-looks.mjs).
Usage: py contact.py <tiles folder> <out folder>   (one sheet per tier: Prismatic, Mythic, Void, Heirloom)"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

src, out = Path(sys.argv[1]), Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
TYPES = ["sword", "greatsword", "spear", "lance", "hammer", "scythe", "pickaxe", "logging_axe"]
ALL = ["sword", "greatsword", "spear", "lance", "dagger", "hammer", "bow", "staff", "scythe", "pickaxe", "logging_axe"]
try:
    F = ImageFont.truetype("arial.ttf", 15); FB = ImageFont.truetype("arialbd.ttf", 20)
except OSError:
    F = FB = ImageFont.load_default()


def sheet(title, rows, cols, name):
    """rows: list of (row label, [(file, caption)])."""
    w, h = Image.open(next(src.glob("*.png"))).size
    pad, lab, head = 10, 130, 44
    im = Image.new("RGB", (lab + cols * (w + pad) + pad, head + len(rows) * (h + 30 + pad) + pad), (30, 34, 48))
    d = ImageDraw.Draw(im)
    d.text((pad, 10), title, font=FB, fill=(255, 255, 255))
    for r, (rl, items) in enumerate(rows):
        y = head + r * (h + 30 + pad)
        d.text((pad, y + h // 2), rl, font=F, fill=(230, 230, 230))
        for c, (f, cap) in enumerate(items):
            x = lab + pad + c * (w + pad)
            im.paste(Image.open(src / f"{f}.png").convert("RGB"), (x, y))
            d.text((x, y + h + 4), cap, font=F, fill=(200, 210, 255))
    im.save(out / name)


for tier, n, label in (("prismatic", 5, "Prismatic (T5)"), ("mythic", 6, "Mythic (T6)")):
    sides = [("m", "Mythic side")] if tier == "prismatic" else [("m", "Mythic")]
    rows = [(t, [(f"{t}-{tier}-{i}-m", ('BASE' if i == 0 else '+%d' % i)) for i in range(n)]) for t in TYPES]
    sheet(f"{label}: {n} looks per type, BASE to +{n-1}", rows, n, f"{tier}.png")
rows = [(t, [(f"{t}-mythic-{i}-v", ('BASE' if i == 0 else '+%d' % i)) for i in range(6)]) for t in TYPES]
sheet("Void (T6, Void side): 6 looks per type, BASE to +5", rows, 6, "void.png")
for side, nm in (("m", "Mythic side (blue)"), ("v", "Void side (purple)")):
    items = [(f"{k}-heirloom-0-{side}", k) for k in ALL]
    sheet(f"Heirloom, {nm}: one picture per type", [("", items[:6]), ("", items[6:])], 6, f"heirloom_{'mythic' if side=='m' else 'void'}.png")
