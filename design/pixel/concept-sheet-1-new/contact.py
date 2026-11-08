"""Contact sheets for the concept sheet 1 drafts: one PNG per group, every sprite at 3x with its 1x
copy beside it, on the game's dark panel colour (card items on their rarity window colour).
Gap-filled sprites are labelled in orange.

Usage: py design/pixel/concept-sheet-1-new/contact.py
Writes design/pixel/concept-sheet-1-new/contact-<group>.png.
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import post as N  # noqa: E402  (this folder's post.py)

BG = (30, 33, 46)
TEXT = (226, 230, 240)
WARN = (255, 196, 92)
BIG = 3
PAD = 12


def font(size: int):
    for name in ("segoeui.ttf", "DejaVuSans.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


F = font(13)
FH = font(20)
GAP_NAMES = {
    f"item-{k}-{r}"
    for k, t in (("katana", N.KATANA), ("staff", N.STAFF))
    for r, s in t.items()
    if s.startswith("gap:")
}


def window(name: str):
    for r in N.RAR:
        if name.endswith(f"-{r}"):
            return (*N.P.hexrgb(N.P.RARITY_WINDOW[r]), 255)
    if name == "evo-twin_daggers":
        return (*N.P.hexrgb(N.P.RARITY_WINDOW["void"]), 255)
    if name == "evo-bronze_hammer":
        return (*N.P.hexrgb(N.P.RARITY_WINDOW["legendary"]), 255)
    return None


def sheet(title: str, files: list[Path], cols: int, out: Path, gap=lambda n: False) -> None:
    ims = [Image.open(f).convert("RGBA") for f in files]
    mw = max(i.width for i in ims)
    mh = max(i.height for i in ims)
    cw = mw * BIG + mw + 3 * PAD
    ch = mh * BIG + 2 * PAD + 20
    rows = (len(ims) + cols - 1) // cols
    img = Image.new("RGB", (max(cw * cols, 600), 40 + ch * rows), BG)
    d = ImageDraw.Draw(img)
    d.text((PAD, 8), title, font=FH, fill=TEXT)
    for k, (f, im) in enumerate(zip(files, ims)):
        x = (k % cols) * cw + PAD
        y = 40 + (k // cols) * ch
        g = gap(f.stem)
        d.text((x, y), f.stem + ("  (gap-filled)" if g else ""), font=F, fill=WARN if g else TEXT)
        win = window(f.stem)
        for s, ox in ((BIG, 0), (1, mw * BIG + PAD)):
            t = Image.new("RGBA", (im.width * s, im.height * s), win or (0, 0, 0, 0))
            t.alpha_composite(im.resize((im.width * s, im.height * s), Image.NEAREST))
            img.paste(t, (x + ox, y + 18), t)
    img.save(out)


def main() -> None:
    D = N.OUT
    order = {r: i for i, r in enumerate(N.RAR)}
    key = lambda f: (f.stem.rsplit("-", 1)[0], order.get(f.stem.rsplit("-", 1)[-1], 0))  # noqa: E731
    items = sorted((D / "items").glob("*.png"), key=key)
    for kind in ("katana", "book", "staff"):
        sheet(f"{kind} ladder (100 x 120), common to void", [f for f in items if f"-{kind}-" in f.stem], 7,
              HERE / f"contact-{kind}.png", lambda n: n in GAP_NAMES)
    sheet("New uniques (100 x 120, evo treatment)", sorted((D / "uniques").glob("*.png")), 2, HERE / "contact-uniques.png")
    sheet("Attack frames (64 x 64; gap-filled frames marked)", sorted((D / "attacks/frames").glob("*.png")), 4,
          HERE / "contact-attack-frames.png", lambda n: n.endswith("-gap") or "gap" in n)
    for g, cols, title in (("trails", 10, "Elemental trail swatches (48 x 48)"), ("debuffs", 7, "Debuff icons (48 x 48)"),
                           ("magic", 9, "Magic circles and VFX patterns (64 x 64)"),
                           ("interface", 6, "Interface parts (own sizes)"), ("cosmetics", 6, "Cosmetics: portraits, flora, frames")):
        sheet(title, sorted((D / g).glob("*.png")), cols, HERE / f"contact-{g}.png")


if __name__ == "__main__":
    main()
