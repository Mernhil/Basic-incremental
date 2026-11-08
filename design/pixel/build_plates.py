import os; from common import *; from pal import P
R="summon-deck-table/raw/"; O="summon-deck-table/"
FILL={1:"#0d2a1f",2:"#1e1442",3:"#5a1a2a",4:"#118a82",5:"#0b1f17"}
for n in range(1,6):
    im=load(R+f"s{n}_plate.png"); outer=outer_region(im); a=np.array(im)
    holes=(a[...,3]==0)&~outer; a[holes]=hexrgb(FILL[n])+(255,)
    im=Image.fromarray(a,"RGBA"); im=im.crop(bbox(im)); im=snap(im,P[f"S{n}"]); im.save(O+f"s{n}/plate.png"); print(n,im.size)
