"""Trims the bump on the right of the top fruit so the canopy outline runs smoothly down its shoulder."""
import sys
from PIL import Image
src, out = sys.argv[1:3]
im = Image.open(src).convert('RGBA'); px = im.load(); W, H = im.size
INK, WHITE, CLEAR = (26,16,32,255), (255,255,255,255), (0,0,0,0)
cut = lambda x, y: 35 <= x <= 41 and y < 6 + (x - 34) * 0.72      # everything above this line goes
for y in range(H):
    for x in range(W):
        if cut(x, y) and px[x,y][3]: px[x,y] = CLEAR
box = [(x,y) for x in range(33,46) for y in range(3,14)]
n4 = ((1,0),(-1,0),(0,1),(0,-1))
edge = [(x,y) for x,y in box if px[x,y][3] and px[x,y] != WHITE and any(px[x+dx,y+dy][3] == 0 for dx,dy in n4) and (cut(x+1,y) or cut(x,y-1) or cut(x-1,y) or cut(x,y+1) or px[x,y] == INK)]
for x,y in edge: px[x,y] = INK
for x,y in box:
    if px[x,y][3] == 0 and any(0 <= x+dx < W and 0 <= y+dy < H and px[x+dx,y+dy] == INK for dx in (-1,0,1) for dy in (-1,0,1)):
        px[x,y] = WHITE
im.save(out)
