import os,sys; sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from common import *
from build_plates import FILL
from PIL import Image as I
SP="../../pixel/summon-deck-table/"; HP="../../pixel/shop-market-stalls/"
HERE=os.path.dirname(os.path.abspath(__file__))
ROOT=os.path.join(HERE,"..","options")
os.chdir(HERE)

def plate_inner(n):
    im=np.array(load(f"summon-deck-table/s{n}/plate.png")); h,w=im.shape[:2]; f=im[h//2,w//2][:3]
    m=(im[...,:3]==f).all(-1)&(im[...,3]>0); seen=np.zeros_like(m); q=deque([(w//2,h//2)]); seen[h//2,w//2]=True; pts=[]
    while q:
        x,y=q.popleft(); pts.append((x,y))
        for dx,dy in((1,0),(-1,0),(0,1),(0,-1)):
            nx,ny=x+dx,y+dy
            if 0<=nx<w and 0<=ny<h and m[ny,nx] and not seen[ny,nx]: seen[ny,nx]=True;q.append((nx,ny))
    xs=[p[0] for p in pts]; ys=[p[1] for p in pts]
    return w,h,min(xs),min(ys),max(xs),max(ys)

SUM={
 1:dict(name="Casino Baize",line="Emerald baize and a polished brass rail; cel-shaded navy and gold card backs.",ink="#f2ecd6",sub="#cfe3d3",hd="#e8b84a",b1="#e8b84a",b2="#7a4a12",bt="#2a1d05",k=1),
 2:dict(name="Night Velvet",line="Midnight velvet, silver rail and moonstone gems; tarot-style silver backs.",ink="#f4f8ff",sub="#b8c4e8",hd="#7fe3ee",b1="#8b97b8",b2="#4a5470",bt="#0e0a1c",k=1),
 3:dict(name="Burgundy and Walnut",line="Worn burgundy felt in a walnut frame with brass studs; hand-inked cream backs.",ink="#f4e8cc",sub="#e2c9a8",hd="#f3d98a",b1="#d3ab52",b2="#8a6a20",bt="#2a1608",k=1),
 4:dict(name="Arcade Chunky",line="Half-resolution pixels shown at 2x: flat teal, thick yellow rail, three-tone backs.",ink="#ffffff",sub="#c8f4ee",hd="#ffe060",b1="#ffe060",b2="#f2a810",bt="#14081e",k=2),
 5:dict(name="Gilded Baroque",line="Near-black felt, filigree gold rail, gem-set corners; ornate gilt backs.",ink="#f6efdc",sub="#c8bc98",hd="#ffe58a",b1="#e0a838",b2="#6a4208",bt="#0a0610",k=1)}

def summon_page(n):
    s=SUM[n]; k=s["k"]; w,h,x0,y0,x1,y1=plate_inner(n)
    def nat(p): return I.open(f"summon-deck-table/s{n}/{p}").size
    cw,ch=nat("back_portal.png")[0]*k,nat("back_portal.png")[1]*k
    def img(p,extra=""):
        return f'<img class="pix" src="{SP}s{n}/{p}" style="image-rendering:pixelated;{extra}" alt="">'
    def deck(x,title,p,sub):
        dw,dh=nat(p)[0]*k,nat(p)[1]*k
        return (f'<section class="deck" style="left:{x}px"><h2>{title}</h2>'
                f'<div class="stack">{img(p,f"width:{dw}px;height:{dh}px")}</div>'
                f'<div class="sub">{sub}</div><div class="btns"><button class="b">Draw x1 &nbsp;10</button><button class="b pri">Deal x10 &nbsp;100</button></div></section>')
    step=76; ids=['ember_squire','cave_digger','storm_duelist','apprentice_feller','gem_cutter','dawnblade_regent','ember_squire','shield_warden','cave_digger','apprentice_feller']
    def fan(flipped):
        out=''
        for i,idc in enumerate(ids):
            x=int(522-cw/2+(i-4.5)*step); y=int(((i-4.5)**2)*0.9)
            st=f"left:{x}px;top:{y}px;--fx:{int((i-4.5)*-30)}px;animation-delay:{i*.07:.2f}s"
            if i in flipped: out+=f'<div class="slot" style="{st}">MKCARD:{idc}</div>'
            elif i==6: out+=f'<div class="slot flip" style="{st}"><div class="flipper"></div></div>'
            else: out+=f'<div class="slot" style="{st}">{img("back_portal.png",f"width:{cw}px;height:{ch}px")}</div>'
        return out
    bw=nat("flip/f0.png")[0]*k; bh=nat("flip/f0.png")[1]*k; nf=9
    kf=";".join(f"{round(i*100/nf,2)}%{{background-position:-{bw*i}px 0}}" for i in range(nf))
    css=f'''
.s5p{{font-family:Outfit}}
.s5p .mk-main{{background:#000;color:{s["ink"]}}}
.s5p .tbl{{position:absolute;left:0;top:0;width:1044px;height:{717 if k==1 else 718}px;image-rendering:pixelated}}
.s5p h2{{font:800 26px Alegreya,serif;margin:0;color:{s["ink"]};text-shadow:0 2px 0 #000}}
.s5p .deck{{position:absolute;top:40px;width:300px;display:grid;justify-items:center;gap:8px;text-align:center}}
.s5p .stack{{margin:6px 0 4px}}
.s5p .sub{{font-size:13px;color:{s["sub"]};font-weight:600;text-shadow:0 1px 0 #000}}
.s5p .btns{{display:flex;gap:8px}}
.s5p .b{{border:0;border-radius:0;padding:9px 16px;font:800 14px Outfit;background:{s["b2"]};color:{s["ink"]};box-shadow:0 0 0 2px #1a1020,inset 0 2px 0 rgba(255,255,255,.25)}}
.s5p .b.pri{{background:{s["b1"]};color:{s["bt"]};box-shadow:0 0 0 2px #1a1020,inset 0 2px 0 rgba(255,255,255,.5),inset 0 -2px 0 {s["b2"]}}}
.s5p .odds{{position:absolute;left:{522-int(w*k/2)}px;top:62px;width:{w*k}px;height:{h*k}px}}
.s5p .odds img{{position:absolute;left:0;top:0;width:{w*k}px;height:{h*k}px}}
.s5p .odds .in{{position:absolute;left:{x0*k+8}px;top:{y0*k+6}px;width:{(x1-x0+1)*k-16}px;height:{(y1-y0+1)*k-12}px;font-size:11px;font-weight:600;color:{s["ink"]};overflow:hidden}}
.s5p .odds h3{{margin:0 0 3px;font:800 15px Alegreya;color:{s["hd"]};text-align:center}}
.s5p .odds .in>div{{display:flex;justify-content:space-between;line-height:1.3}}.s5p .odds b{{color:var(--rc)}}
.s5p .odds p{{margin:3px 0 0;font-size:10.5px;color:{s["sub"]};text-align:center;line-height:1.2}}
.s5p .hand{{position:absolute;left:0;right:0;top:450px;height:250px}}
.s5p .slot{{position:absolute;width:{cw}px;height:{ch}px}}
.s5p .slot .mk-card{{--k:.75}}.s5p .slot .mk-card .fr{{display:none}}
.s5p .lab{{position:absolute;left:0;right:0;top:-34px;text-align:center;font:700 14px Outfit;color:{s["sub"]};text-shadow:0 1px 0 #000}}
.s5p .hand.new{{display:none}}.s5p.play .hand.new{{display:block}}.s5p.play .hand.old{{display:none}}
@keyframes deal{{from{{translate:var(--fx,-200px) -300px;opacity:0}}}}
.s5p .hand.new .slot{{animation:deal .5s steps(6) both}}
.s5p .flipper{{width:{bw}px;height:{bh}px;background:url({SP}s{n}/flip_strip.png) -{bw*4}px 0/{bw*nf}px {bh}px;image-rendering:pixelated;animation:flp 1.4s steps(1) infinite}}
@keyframes flp{{{kf}}}
.s5p .flip{{width:{bw}px}}
'''
    odds='<div class="rc-common"><span>Common</span><b>68.2%</b></div><div class="rc-rare"><span>Rare</span><b>22.7%</b></div><div class="rc-epic"><span>Epic</span><b>6.1%</b></div><div class="rc-legendary"><span>Legendary</span><b>2.3%</b></div><div class="rc-mythic"><span>Mythic</span><b>0.5%</b></div><div class="rc-exotic"><span>Exotic</span><b>0.2%</b></div>'+('<p>Every x10 holds a Rare or better</p>' if n in (1,3) else '')
    body=(f'<img class="tbl" src="{SP}s{n}/table.png" alt="">'
          +deck(26,"Card Portal","deck_portal_14.png","Legendary at 90: the deck is 70 pulls thick")
          +f'<div class="odds"><img class="pix" src="{SP}s{n}/plate.png" alt=""><div class="in"><h3>Odds per pull</h3>{odds}</div></div>'
          +deck(718,"Wardrobe Gate","deck_wardrobe_3.png","Glamour Crystals, same odds shape")
          +f'<div class="hand old"><div class="lab">Your last hand</div>{fan(list(range(10)))}</div>'
          +f'<div class="hand new"><div class="lab">Dealing x10, flip each card or press Space</div>{fan([0,1,2,3,4,5])}</div>')
    html=f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=1264">
<title>Summon 5 pixel option {n}: {s["name"]}</title>
<link rel="stylesheet" href="../_shared/mock.css">
<style>{css}</style></head><body><div id="app"></div>
<script src="../_shared/mock.js"></script><script>
let body=`{body}`;
body=body.replace(/MKCARD:(\\w+)/g,(m,id)=>MK.card(id,{{k:.75}}));
MK.shell('summon',body,{{cls:'s5p',play:'Play a x10 deal'}});
</script></body></html>'''
    open(f"{ROOT}/summon/s5-pixel-{n}.html","w",encoding="utf-8").write(html)

if __name__=="__main__":
    for n in map(int,sys.argv[1:] or range(1,6)): summon_page(n)
