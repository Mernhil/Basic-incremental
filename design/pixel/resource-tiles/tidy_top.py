"""Draft: tidies the top of a tier-4 tree tile: trims the dome along a line, removes leftover chunk pixels, smooths mosaic noise."""
import sys
from collections import Counter
from PIL import Image
src, out, kind = sys.argv[1:4]
im = Image.open(src).convert('RGBA'); px = im.load(); W, H = im.size
INK, WHITE, CLEAR = (26,16,32,255), (255,255,255,255), (0,0,0,0)
lum = lambda p: 0.3*p[0] + 0.59*p[1] + 0.11*p[2]
n4 = ((1,0),(-1,0),(0,1),(0,-1))
if kind == 'pentagon':
    cut = lambda x,y: 34 <= x <= 41 and y < 4.5 + (x-33)*0.6
    box = (31,3,46,13)
else:
    cut = lambda x,y: 36 <= x <= 42 and y < 5 + (x-35)*0.7
    box = (33,3,46,13)
for y in range(H):
    for x in range(W):
        if cut(x,y) and px[x,y][3]: px[x,y] = CLEAR
bx0,by0,bx1,by1 = box
inbox = [(x,y) for x in range(bx0,bx1+1) for y in range(by0,by1+1)]
if kind == 'pentagon':     # leftover brown/grey pieces become teal leaves
    leafs = [(x,y) for y in range(H) for x in range(W) if px[x,y][3] and px[x,y][1] > px[x,y][0]+10 and px[x,y][2] > px[x,y][0]]
    chunk = [(x,y) for x,y in inbox if x >= 34 and px[x,y][3] and lum(px[x,y]) > 45 and px[x,y] != WHITE and not (px[x,y][1] > px[x,y][0]+10 and px[x,y][2] > px[x,y][0]) and not (px[x,y][0]>235 and px[x,y][1]>235)]
    L = sorted(lum(px[p]) for p in leafs); lo,hi = L[len(L)//4], L[len(L)*3//4]
    pool = set(p for p in leafs if lo <= lum(px[p]) <= hi)
    for x,y in chunk:
        near = sorted([(x+dx,y+dy) for dx in range(-9,10) for dy in range(-9,10) if (x+dx,y+dy) in pool], key=lambda q:(abs(q[0]-x)+abs(q[1]-y),q))[:6]
        if near: px[x,y] = px[near[(x*7+y*13)%len(near)]]
else:                      # the lilac mosaic to the right of the star: mode filter, two passes
    for _ in range(2):
        snap = {p: px[p] for p in inbox}
        for x,y in inbox:
            c = snap[(x,y)]
            if c[3] == 0 or c == INK or c == WHITE or lum(c) < 45: continue
            votes = Counter(px[x+dx,y+dy] for dx in (-1,0,1) for dy in (-1,0,1) if px[x+dx,y+dy][3] and px[x+dx,y+dy] not in (INK, WHITE) and lum(px[x+dx,y+dy]) >= 45)
            if votes: px[x,y] = votes.most_common(1)[0][0]
edge = [(x,y) for x,y in inbox if px[x,y][3] and px[x,y] != WHITE and any(px[x+dx,y+dy][3] == 0 for dx,dy in n4) and (any(cut(x+dx,y+dy) for dx,dy in n4) or px[x,y] == INK)]
for x,y in edge: px[x,y] = INK
for x,y in inbox:
    if px[x,y][3] == 0 and any(px[x+dx,y+dy] == INK for dx in (-1,0,1) for dy in (-1,0,1)): px[x,y] = WHITE
im.save(out)
