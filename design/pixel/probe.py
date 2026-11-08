import sys; from common import *
D="summon-deck-table/raw/"
for n in range(1,6):
    im=load(D+f"s{n}_table.png"); a=np.array(im)
    print(n, "corners",[tuple(a[y,x]) for x,y in((0,0),(191,0),(0,191),(5,96))])
    row=a[96]; print(" row96 first 60:",[ '%02x%02x%02x'%tuple(p[:3]) for p in row[:40:2]])
