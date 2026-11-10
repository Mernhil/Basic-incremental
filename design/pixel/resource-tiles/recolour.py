"""Recolours the foliage of a tree tile into a tier material (design draft, not game code)."""
import sys, colorsys
from PIL import Image
src, out, tier = sys.argv[1], sys.argv[2], sys.argv[3]
RAMPS = {
 'bronze': ['#3a1d10','#7a3a1a','#b0602a','#d98a3d','#f2b866'],
 'silver': ['#2a3550','#4b6485','#7f9bb8','#b4c9dc','#e6f0f8'],
 'gold':   ['#5a3a05','#a06a0a','#d9a21f','#f2c94a','#fff0a0'],
}
hexrgb = lambda h: tuple(int(h[i:i+2],16) for i in (1,3,5))
im = Image.open(src).convert('RGBA'); px = im.load()
for y in range(im.height):
  for x in range(im.width):
    r,g,b,a = px[x,y]
    if a == 0 or y >= 43: continue          # island and rim stay as they are
    if not (g > r + 8 and g > b + 8): continue  # only the green leaves
    L = min(1, max(0, (0.3*r + 0.59*g + 0.11*b - 30) / 130))
    if tier == 'prismatic':
      h = ((x * 7 + y * 4) % 360) / 360
      s = 0.55 - 0.25 * L
      v = 0.35 + 0.65 * L
      rr,gg,bb = [int(c*255) for c in colorsys.hsv_to_rgb(h, s, v)]
    else:
      rr,gg,bb = hexrgb(RAMPS[tier][min(4, int(L * 5))])
    px[x,y] = (rr,gg,bb,a)
im.save(out)
