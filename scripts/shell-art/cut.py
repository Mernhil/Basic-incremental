"""Cut shell pieces out of a PixelLab mockup picture (1b Castle Stone / 1a Tavern Wood).
Usage: python -I cut.py <spec.py> <mockup.png> <outdir>
Only erases (fills with the part's own face colour, copies a clean column/row) and crops. Nothing is redrawn or recoloured.
The spec file defines PIECES = [ dict(name, box=(x0,y0,x1,y1), erase=[...], flood=bool) ].
erase ops: ('mode',(box),(refbox)) fill with the most common colour of refbox
           ('cols',(box),x)   every column of box = column x (same rows)
           ('rows',(box),y)   every row of box = row y (same columns)
           ('copy',(box),(sx,sy)) copy a block from sx,sy
"""
import sys, runpy, os
from collections import Counter
from PIL import Image

def mode(im, box):
    c = Counter(im.crop(box).get_flattened_data() if hasattr(im,'get_flattened_data') else im.crop(box).getdata())
    return c.most_common(1)[0][0]

def apply(im, op):
    k, box, arg = op
    x0, y0, x1, y1 = box
    if k == 'mode':
        col = mode(im, arg)
        for y in range(y0, y1):
            for x in range(x0, x1): im.putpixel((x, y), col)
    elif k == 'cols':
        for x in range(x0, x1):
            for y in range(y0, y1): im.putpixel((x, y), im.getpixel((arg, y)))
    elif k == 'rows':
        for y in range(y0, y1):
            for x in range(x0, x1): im.putpixel((x, y), im.getpixel((x, arg)))
    elif k == 'copy':
        sx, sy = arg
        blk = im.crop((sx, sy, sx + x1 - x0, sy + y1 - y0))
        im.paste(blk, (x0, y0))
    elif k == 'mirror':
        sx0, sy0, sx1, sy1 = arg
        blk = im.crop((sx0, sy0, sx1, sy1)).transpose(Image.FLIP_LEFT_RIGHT)
        im.paste(blk, (x0, y0))
    else:
        raise ValueError(k)

def trim_ink(im, ink_max=40):
    px = im.load(); w, h = im.size
    xs = [x for x in range(w) for y in range(h) if px[x, y][0] < ink_max and px[x, y][1] < ink_max and px[x, y][2] < ink_max]
    ys = [y for x in range(w) for y in range(h) if px[x, y][0] < ink_max and px[x, y][1] < ink_max and px[x, y][2] < ink_max]
    return im.crop((min(xs), min(ys), max(xs) + 1, max(ys) + 1))

def flood_alpha(im, reach=3, ink_max=40, seeds='all', trim=True):
    """Trim to the ink outline, then make the pixels outside the rounded corners transparent (flood from the 4 corners, never through ink, at most `reach` px)."""
    if trim: im = trim_ink(im, ink_max)
    w, h = im.size; px = im.load()
    def ink(p): return p[0] < ink_max and p[1] < ink_max and p[2] < ink_max
    seen = set()
    for sx, sy in ([(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)] if seeds == 'all' else [(0, h - 1), (w - 1, h - 1)]):
        stack = [(sx, sy)]
        while stack:
            x, y = stack.pop()
            if (x, y) in seen or not (0 <= x < w and 0 <= y < h): continue
            if abs(x - sx) > reach or abs(y - sy) > reach: continue
            seen.add((x, y))
            if ink(px[x, y]): continue
            px[x, y] = (0, 0, 0, 0)
            stack += [(x+1, y), (x-1, y), (x, y+1), (x, y-1)]
    return im

if __name__ == '__main__':
    spec, src, out = sys.argv[1:4]
    pieces = runpy.run_path(spec)['PIECES']
    os.makedirs(out, exist_ok=True)
    base = Image.open(src).convert('RGBA')
    for p in pieces:
        im = base.copy()
        for op in p.get('erase', []): apply(im, op)
        c = im.crop(p['box'])
        if p.get('flood'): c = flood_alpha(c, p.get('reach', 3), ink_max=p.get('ink', 40), seeds=p.get('seeds', 'all'), trim=p.get('trim', True))
        c.save(os.path.join(out, p['name'] + '.png'))
        print(p['name'], c.size)
