import os,sys; sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from common import *
os.chdir(os.path.dirname(os.path.abspath(__file__)))
BG=(58,60,72,255)
def sheet(items,path,pad=10,maxw=900):
    """items: list of PIL images; lays them out left to right with wrapping at maxw, 1x"""
    x=y=pad; rowh=0; pos=[]
    for im in items:
        if x+im.width+pad>maxw and x>pad: x=pad; y+=rowh+pad; rowh=0
        pos.append((x,y)); x+=im.width+pad; rowh=max(rowh,im.height)
    W=max(p[0]+i.width for p,i in zip(pos,items))+pad; H=y+rowh+pad
    s=Image.new("RGBA",(W,H),BG)
    for p,im in zip(pos,items): s.alpha_composite(im,p)
    s.save(path)
for n in range(1,6):
    d=f"summon-deck-table/s{n}/"
    decks=[load(d+f"deck_portal_{t}.png") for t in (3,8,14,20)]
    ladder=Image.new("RGBA",(sum(i.width+6 for i in decks),max(i.height for i in decks)),(0,0,0,0)); x=0
    for i in decks: ladder.alpha_composite(i,(x,0)); x+=i.width+6
    ladder.save(d+"deck_ladder.png")
    sheet([load(d+"back_portal.png"),load(d+"back_wardrobe.png"),load(d+"plate.png"),ladder],d+"kit.png",maxw=1000)
    h=f"shop-market-stalls/h{n}/"
    items=[load(h+f"awn_{c}.png") for c in "abc"]+[load(h+"ring.png"),load(h+"stamp.png"),load(h+"coin.png")]+[load(h+f"sup{i}.png") for i in range(1,6)]
    sheet(items,h+"kit.png",maxw=1000)
    print("kit",n)
