"""Removes the pale chunk beside the top fruit on a tier-4 tree tile. The fruit (the resource) stays."""
import sys
from PIL import Image
src, out, kind = sys.argv[1:4]
im = Image.open(src).convert('RGBA'); px = im.load(); W, H = im.size
lum = lambda p: 0.3*p[0] + 0.59*p[1] + 0.11*p[2]
def cls(p):
    r,g,b,a = p
    if a == 0: return '.'
    if (r,g,b) == (255,255,255): return 'W'
    l = lum(p)
    if l < 45: return '#'
    if kind == 'round':
        if r > g - 5 and r > 120 and b < 110: return 'O'
        if r > 190 and g > 190: return 'c'
        if r > g and b > 100: return 't'
        if g > r + 8 and g > b + 8: return 'g'
        return 'p'
    if kind == 'pentagon':
        if r >= g and r - b > 18 and l > 100: return 'S'
        if l > 150: return 'c'
        if abs(r-g) < 25 and abs(g-b) < 25 and l > 110: return 't'
        return 'g'
    return 'L' if l > 150 else ('t' if (abs(r-g) < 30 and b > r-20 and l > 110) else 'p')
C = {(x,y): cls(px[x,y]) for y in range(H) for x in range(W)}
def chunk(x, y, c):
    if kind == 'round':   return 32 <= x <= 37 and 5 <= y <= 10 and c in 'ctp'
    if kind == 'pentagon': return 34 <= x <= 39 and 5 <= y <= 11 and c in 'cSt'
    return 34 <= x <= 41 and 6 <= y <= 12 and c == 't'
mask = [(x,y) for (x,y),c in C.items() if chunk(x,y,c)]
leaf = {'round':'g','pentagon':'g','star':'p'}[kind]
srcs = [p for p,c in C.items() if c == leaf and p not in mask]
_l = sorted(lum(px[p]) for p in srcs); lo, hi = _l[len(_l)*25//100], _l[len(_l)*75//100]
srcs = set(p for p in srcs if lo <= lum(px[p]) <= hi)
for (x,y) in sorted(mask):
    near = [(x+dx,y+dy) for dx in range(-8,9) for dy in range(-8,9) if (x+dx,y+dy) in srcs]
    near.sort(key=lambda q:(abs(q[0]-x)+abs(q[1]-y), q)); near = near[:6]
    if near: px[x,y] = px[near[(x*7+y*13) % len(near)]]
INK = (26,16,32,255)
if kind == 'round':                      # the fruit lost its top rim where the chunk touched it
    for (x,y) in mask:
        if any(C.get((x+dx,y+dy)) == 'O' for dx,dy in ((1,0),(-1,0),(0,1),(0,-1))): px[x,y] = INK
im.save(out); print(kind, len(mask), 'pixels')
