"""Draft: keep the tree's own colours (its identity); the tier shows as metal-coloured leaf highlights in a pattern."""
import sys, colorsys
from PIL import Image
src, out, tier = sys.argv[1], sys.argv[2], int(sys.argv[3])
METAL = {1:('#d98a3d','#f2b866'), 2:('#b4c9dc','#e6f0f8'), 3:('#f2c94a','#fff0a0')}
hx = lambda h: tuple(int(h[i:i+2],16) for i in (1,3,5))
im = Image.open(src).convert('RGBA'); px = im.load()
for y in range(im.height):
  for x in range(im.width):
    r,g,b,a = px[x,y]
    if a == 0 or y >= 43 or tier == 0: continue
    if not (g > r + 8 and g > b + 8) and not (b > r + 12 and g > r): continue  # leaves of any tree colour
    L = (0.3*r + 0.59*g + 0.11*b)
    if L < 105: continue                          # shadows keep the tree's own colour
    if (x + y) % 2: continue                      # chequered, so the tree stays readable
    if tier == 4:
      h = ((x * 9 + y * 5) % 360) / 360
      px[x,y] = tuple(int(c*255) for c in colorsys.hsv_to_rgb(h, 0.45, 1.0)) + (a,)
    else:
      px[x,y] = hx(METAL[tier][0] if L < 150 else METAL[tier][1]) + (255,)
im.save(out)
