"""Compose card previews (base, item at the game's 0.75 ratio, top) at 4x for checking by eye."""
import sys

from PIL import Image

from px import OUT, sprite

ITEM_BOX = (35, 66, 148, 157)


def compose(base, top, item_name, s=4):
    b = Image.open(base).convert("RGBA").resize((183 * s, 237 * s), Image.NEAREST)
    it = sprite(item_name)
    k = s * 3 // 4
    it = it.resize((it.width * k, it.height * k), Image.NEAREST)
    cx = (ITEM_BOX[0] + ITEM_BOX[2] + 1) / 2 * s
    cy = (ITEM_BOX[1] + ITEM_BOX[3] + 1) / 2 * s
    b.alpha_composite(it, (int(cx - it.width / 2), int(cy - it.height / 2)))
    b.alpha_composite(Image.open(top).convert("RGBA").resize((183 * s, 237 * s), Image.NEAREST))
    return b


if __name__ == "__main__":
    folder, item, out = sys.argv[1], sys.argv[2], sys.argv[3]
    import glob
    bases = sorted(glob.glob(f"{OUT}/{folder}/**/*-base.png", recursive=True))
    ims = [compose(b, b.replace("-base", "-top"), item, 2) for b in bases]
    cols = int(sys.argv[4]) if len(sys.argv) > 4 else 3
    w, h = ims[0].size
    sheet = Image.new("RGBA", (w * cols, h * ((len(ims) + cols - 1) // cols)), (30, 32, 44, 255))
    for i, im in enumerate(ims):
        sheet.alpha_composite(im, ((i % cols) * w, (i // cols) * h))
    sheet.save(out)
    print(len(ims))
