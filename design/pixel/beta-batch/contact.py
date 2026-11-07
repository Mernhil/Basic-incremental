"""Contact sheet of a folder of PNGs at integer scale, for checking drafts by eye."""
import sys
from pathlib import Path

from PIL import Image

folder = Path(sys.argv[1])
scale = int(sys.argv[2]) if len(sys.argv) > 2 else 4
out = Path(sys.argv[3])
pattern = sys.argv[5] if len(sys.argv) > 5 else "*.png"
files = sorted(folder.rglob(pattern))
ims = [Image.open(f).convert("RGBA") for f in files]
cols = int(sys.argv[4]) if len(sys.argv) > 4 else 5
cw = max(i.width for i in ims) * scale + 8
ch = max(i.height for i in ims) * scale + 8
rows = (len(ims) + cols - 1) // cols
sheet = Image.new("RGBA", (cw * cols, ch * rows), (34, 30, 46, 255))
for n, im in enumerate(ims):
    big = im.resize((im.width * scale, im.height * scale), Image.NEAREST)
    sheet.alpha_composite(big, ((n % cols) * cw + 4, (n // cols) * ch + 4))
sheet.save(out)
print("\n".join(f.name for f in files))
