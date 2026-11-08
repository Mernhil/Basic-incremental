"""Builds every draft sprite, the contact sheets, the in-card mocks, the animation previews and the checks.

    py design/pixel/weapon-tiers/build.py
"""
from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
sys.path.insert(0, str(HERE))

from options import C_item, OPTIONS, RIM, TIERS, WEAPONS, existing  # noqa: E402
from pix import to_image  # noqa: E402

SPR = HERE / "sprites"
SHEETS = HERE / "sheets"
CARDS = HERE / "cards"
ANIM = HERE / "anim"
BG = (42, 48, 60, 255)
WINDOW = (0x2A, 0x30, 0x3C, 255)  # Common's window colour: tier does not change the window


def save(rgba, path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    to_image(rgba).save(path)


def up(im: Image.Image, z: int) -> Image.Image:
    return im.resize((im.width * z, im.height * z), Image.NEAREST)


def card(item: np.ndarray, tier: str) -> Image.Image:
    """The item inside its tier frame: an approximation of the card (the frame sprite as shipped, a dark body
    and the item window); the real layout belongs to the ui agent."""
    t = "prismatic" if tier == "unique" else tier
    frame = Image.open(HERE / "existing" / f"frame-{t}.png").convert("RGBA")
    out = Image.new("RGBA", frame.size, (0, 0, 0, 0))
    body = Image.new("RGBA", (130, 186), (0x23, 0x28, 0x37, 255))
    out.alpha_composite(body, (26, 40))
    win = Image.new("RGBA", (112, 132), WINDOW)
    out.alpha_composite(win, (35, 50))
    it = to_image(item)
    out.alpha_composite(it, (41, 56))
    # name plate and stat bars as plain placeholders
    plate = Image.new("RGBA", (112, 16), (0x3A, 0x42, 0x58, 255))
    out.alpha_composite(plate, (35, 188))
    out.alpha_composite(frame, (0, 0))
    return out


def main():
    for d in (SPR, SHEETS, CARDS, ANIM):
        if d.exists():
            shutil.rmtree(d)
    arts: dict[tuple[str, str, str], np.ndarray] = {}
    for opt, ws in OPTIONS.items():
        for w in WEAPONS:
            for t in TIERS:
                rgba = ws[w](t)
                if rgba is None:
                    continue
                arts[(opt, w, t)] = rgba
                if opt != "D" and t != "unique":  # D and the uniques are the game's own approved sprites (existing/)
                    save(rgba, SPR / opt / f"{w}-{t}.png")
    SHEETS.mkdir(exist_ok=True)
    # ----- sheets: one per option, tiers across, weapons down; native and 2x
    for opt in OPTIONS:
        sh = Image.new("RGBA", (100 * 5 + 4 * 6 + 12, 120 * len(WEAPONS) + (len(WEAPONS) - 1) * 6 + 12), BG)
        for r, w in enumerate(WEAPONS):
            for c, t in enumerate(TIERS):
                if (opt, w, t) in arts:
                    sh.alpha_composite(to_image(arts[(opt, w, t)]), (6 + c * 106, 6 + r * 126))
        sh.save(SHEETS / f"{opt}-1x.png")
        up(sh, 2).save(SHEETS / f"{opt}-2x.png")
    # ----- in-card mocks of the sword ladder (and the others) at 1x and 2x
    for opt in OPTIONS:
        for w in WEAPONS:
            row = [c for c in (card(arts[(opt, w, t)], t) for t in TIERS if (opt, w, t) in arts)]
            if not row:
                continue
            strip = Image.new("RGBA", (len(row) * 189 + 6, 243), BG)
            for i, c in enumerate(row):
                strip.alpha_composite(c, (6 + i * 189, 3))
            CARDS.mkdir(exist_ok=True)
            strip.save(CARDS / f"{opt}-{w}-1x.png")
            up(strip, 2).save(CARDS / f"{opt}-{w}-2x.png")
    # ----- animation previews: shape-following aura of option C, frame by frame
    for w, tier in (("sword", "gold"), ("sword", "prismatic"), ("staff", "prismatic"), ("bow", "gold")):
        d = ANIM / f"c-{w}-{tier}"
        for i in range(6):
            save(C_item(w, tier, phase=float(i)), d / f"frame_{i:02d}.png")
        subprocess.run([sys.executable, str(REPO / ".claude/skills/pixel-art/scripts/sheet.py"), str(d), "--durations", "110,90,100,90,110,100", "--scale", "3", "--bg", "#2a303c", "--out", str(ANIM / f"c-{w}-{tier}")], check=True)
    import page
    page.build()
    print("built", len(arts), "sprites")


if __name__ == "__main__":
    main()
