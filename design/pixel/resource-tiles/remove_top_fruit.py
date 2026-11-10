"""Removes the big fruit on top of a tier-4 tree tile: blob pixels become the canopy's own leaves (nearest leaf colour); the dome silhouette stays."""
import sys
from collections import deque
from PIL import Image
src, out, kind = sys.argv[1:4]
BOX = {'round': (22,2,35,18), 'pentagon': (22,2,36,16), 'star': (21,1,38,14)}[kind]
im = Image.open(src).convert('RGBA'); px = im.load(); W, H = im.size
lum = lambda p: 0.3*p[0] + 0.59*p[1] + 0.11*p[2]
def is_leaf(p):
    r,g,b,a = p
    if a == 0 or lum(p) < 45 or (r>235 and g>235): return False
    if kind == 'round': return g > r + 8 and g > b + 8
    if kind == 'pentagon': return g > r + 10 and b > r
    return b > g + 18 and lum(p) < 135
def is_blob(p):
    r,g,b,a = p
    if a == 0 or (r>235 and g>235 and b>235 and kind!='star'): return False
    if kind == 'round': return r > 120 and r >= g - 5
    if kind == 'pentagon': return r >= g and r - b > 18 and lum(p) > 100
    return lum(p) >= 135
def silhouette(x, y):
    for dx, dy in ((1,0),(-1,0),(0,1),(0,-1)):
        nx, ny = x+dx, y+dy
        if not (0 <= nx < W and 0 <= ny < H): return True
        q = px[nx,ny]
        if q[3] == 0 or (q[0]>235 and q[1]>235 and q[2]>235): return True
    return False
x0,y0,x1,y1 = BOX
mask = set()
for y in range(y0, y1+1):
    for x in range(x0, x1+1):
        p = px[x,y]
        if is_blob(p) or (p[3] and lum(p) < 45 and not silhouette(x,y)): mask.add((x,y))
# one pixel of margin around the blob (its highlight and shadow pixels), but never the dome outline
for (x,y) in list(mask):
    for dx in (-1,0,1):
        for dy in (-1,0,1):
            n=(x+dx,y+dy)
            if 0<=n[0]<W and 0<=n[1]<H and x0<=n[0]<=x1 and y0<=n[1]<=y1:
                p=px[n]
                if p[3] and not is_leaf(p) and not silhouette(*n) and not (p[0]>235 and p[1]>235 and p[2]>235) and lum(p)>=45: mask.add(n)
for y in range(y0, y1+1):          # leftover blob highlights and glints inside the box
    for x in range(x0, x1+1):
        p = px[x,y]
        if p[3] and not is_leaf(p) and not silhouette(x,y) and not (p[0]>235 and p[1]>235 and p[2]>235) and lum(p)>=45: mask.add((x,y))
src_pts = [(x,y) for y in range(H) for x in range(W) if (x,y) not in mask and is_leaf(px[x,y])]
_l = sorted(lum(px[p]) for p in src_pts)
lo, hi = _l[len(_l)*25//100], _l[len(_l)*70//100]
leafs = set(p for p in src_pts if lo <= lum(px[p]) <= hi)   # mid tones only, so no pale patch appears
for (x,y) in sorted(mask):
    near = [(x+dx,y+dy) for dx in range(-9,10) for dy in range(-9,10) if (x+dx,y+dy) in leafs]
    if not near: continue
    near.sort(key=lambda q:(abs(q[0]-x)+abs(q[1]-y), q))
    near = near[:7]
    px[x,y] = px[near[(x*7 + y*13) % len(near)]]
im.save(out)
print(kind, len(mask), 'pixels replaced')
