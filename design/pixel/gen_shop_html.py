import os,sys; sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from PIL import Image as I
HERE=os.path.dirname(os.path.abspath(__file__)); os.chdir(HERE)
ROOT=os.path.join(HERE,"..","options"); HP="../../pixel/shop-market-stalls/"
T={
 1:dict(name="Classic Bazaar",line="Bold cel-shaded stripes, dark outlines, wooden counters; red ink stamp and a rainbow crystal ring.",body="#3a2418",row="#52362a",ink="#f4efff",mut="#c9b8a0",acc="#d9b35a",acct="#2a1608",bd="#1a1020",k=1),
 2:dict(name="Pastel Candy",line="Soft candy colours and plum outlines on light counters; wobbly coral stamp and a candy-glass ring.",body="#fff0f6",row="#ffd9e8",ink="#4a3060",mut="#8a6aa8",acc="#e88ab0",acct="#4a3060",bd="#4a3060",k=1),
 3:dict(name="Dusk Market",line="Night stalls lit by paper lanterns, neon cyan trim, glowing red stamp and a neon crystal ring.",body="#1c1228",row="#2a2440",ink="#ffe090",mut="#8a80b0",acc="#40f0ff",acct="#08060e",bd="#08060e",k=1),
 4:dict(name="Chunky Arcade",line="Half-resolution art shown at 2x with a 12-colour palette; flat blocks, no shading.",body="#14081e",row="#3a2a70",ink="#ffffff",mut="#c8d8ff",acc="#ffe060",acct="#14081e",bd="#000000",k=2),
 5:dict(name="Hand-painted Bazaar",line="Rich painted cloth with gold tassels, walnut counters, gem-set ring and ornate seal.",body="#3a2418",row="#5a3a28",ink="#f0e2c0",mut="#d4be90",acc="#f4c850",acct="#24120c",bd="#24120c",k=1)}
def shop_page(n):
    t=T[n]; k=t["k"]; d=f"shop-market-stalls/h{n}/"
    def nat(p): return I.open(d+p).size
    def img(p,extra=""):
        w,h=nat(p); return f'<img class="pix" src="{HP}h{n}/{p}" width="{w*k}" height="{h*k}" style="{extra}" alt="">'
    sw,sh=nat('stamp.png'); stamp=f'<img class="pix stamp" src="{HP}h{n}/stamp.png" width="{sw*k}" height="{sh*k}" alt="">'
    rw,rh=nat("ring.png"); nf=8
    kf=";".join(f"{round(i*100/nf,2)}%{{background-position:-{rw*k*i}px 0}}" for i in range(nf))
    cw,ch=nat("coin.png"); cf=nat("coin_spin.png")[0]//cw
    kc=";".join(f"{round(i*100/cf,2)}%{{background-position:-{cw*k*i}px 0}}" for i in range(cf))
    aw=[nat(f"awn_{c}.png") for c in "abc"]
    css=f'''
.h2p{{font-family:Outfit}}
.h2p .pg{{position:absolute;inset:0;padding:14px 26px;display:grid;grid-template-columns:320px 320px 320px;gap:16px;align-content:start}}
.h2p .stall{{position:relative;color:{t["ink"]}}}
.h2p .awn{{position:relative;z-index:2;display:flex;justify-content:center;height:{max(a[1] for a in aw)*k}px;align-items:flex-end}}
.h2p .body{{position:relative;margin-top:-{10*k}px;background:{t["body"]};box-shadow:0 0 0 3px {t["bd"]};padding:{24+10*k}px 12px 12px;min-height:600px}}
.h2p .sign{{display:flex;justify-content:center;align-items:center;gap:8px;font:800 18px Outfit;margin-bottom:10px;color:{t["ink"]}}}
.h2p .sign em{{font-style:normal;color:{t["acc"]};font-size:18px}}
.h2p .sign .cn{{width:{cw*k}px;height:{ch*k}px;background:url({HP}h{n}/coin_spin.png) 0 0/{cw*k*cf}px {ch*k}px;image-rendering:pixelated}}
.h2p.play .sign .cn{{animation:cs 1s steps(1) infinite}}
@keyframes cs{{{kc}}}
.h2p .it{{display:grid;grid-template-columns:{34*k if k==1 else 40}px 1fr auto;gap:10px;align-items:center;padding:7px 9px;margin-bottom:6px;background:{t["row"]};box-shadow:0 0 0 2px {t["bd"]}}}
.h2p .it b{{display:block;font-size:13.5px;line-height:1.15}}.h2p .it span{{font-size:11.5px;color:{t["mut"]}}}
.h2p .it .pr{{border:0;border-radius:0;padding:6px 10px;font-weight:800;font-size:13px;background:{t["acc"]};color:{t["acct"]};box-shadow:0 0 0 2px {t["bd"]},inset 0 2px 0 rgba(255,255,255,.4)}}
.h2p .it .pr.no{{background:{t["bd"]};color:{t["mut"]}}}
.h2p .it.sold{{position:relative}}
.h2p.play .it.sold .stamp{{display:block}}
.h2p .stamp{{display:none;position:absolute;right:{54 if k==1 else 40}px;top:50%;margin-top:-{nat("stamp.png")[1]*k//2}px;z-index:5;animation:slam .3s steps(3) both}}
@keyframes slam{{from{{scale:3;translate:0 -20px}}}}
.h2p .lv{{display:block;height:4px;background:{t["bd"]};margin-top:4px}}.h2p .lv u{{display:block;height:100%;background:{t["acc"]};text-decoration:none}}
.h2p .mini{{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:8px}}
.h2p .tile{{text-align:center;font-size:11.5px;font-weight:700;background:{t["row"]};box-shadow:0 0 0 2px {t["bd"]};padding:6px 4px 8px}}
.h2p .tile .t{{display:flex;justify-content:center;height:124px;overflow:hidden}}
.h2p .tile .t .mk-card{{--k:.5;flex:none;margin-top:2px}}.h2p .mk-card .fr{{display:none}}
.h2p .tile button{{margin-top:6px;border:0;border-radius:0;padding:3px 10px;background:{t["acc"]};color:{t["acct"]};font-weight:800;font-size:12px;box-shadow:0 0 0 2px {t["bd"]}}}
.h2p .tile button.no{{background:{t["bd"]};color:{t["mut"]}}}
.h2p .sup{{display:grid;gap:6px;margin-top:4px}}
.h2p .sup div{{display:flex;gap:10px;align-items:center;padding:4px 8px;background:{t["row"]};box-shadow:0 0 0 2px {t["bd"]};font-size:12px;font-weight:700;line-height:1.15}}
.h2p .sup small{{display:block;color:{t["acc"]}}}
.h2p .gate{{display:grid;justify-items:center;gap:8px;text-align:center;padding-top:6px}}
.h2p .gate .wrap{{position:relative;width:{rw*k}px;height:{rh*k}px}}
.h2p .gate .ring{{position:absolute;inset:0;background:url({HP}h{n}/ring_cycle.png) 0 0/{rw*k*nf}px {rh*k}px;image-rendering:pixelated;animation:rc 1.6s steps(1) infinite}}
.h2p.play .gate .ring{{animation-duration:.4s}}
@keyframes rc{{{kf}}}
.h2p .gate .wrap img.c{{position:absolute;left:{(rw*k-48)//2}px;top:{(rh*k-48)//2}px}}
.h2p .gate b{{font-size:24px;color:{t["acc"]}}}.h2p .gate small{{display:block;color:{t["mut"]};font-size:12px;font-weight:600}}
.h2p .ascb{{border:0;border-radius:0;width:100%;padding:12px;font-weight:800;font-size:17px;color:{t["acct"]};background:{t["acc"]};box-shadow:0 0 0 2px {t["bd"]},inset 0 3px 0 rgba(255,255,255,.45),inset 0 -3px 0 rgba(0,0,0,.2)}}
.h2p ul{{margin:0;padding:0;list-style:none;font-size:12px;color:{t["mut"]};text-align:left;width:100%;display:grid;gap:3px}}
.h2p ul li::before{{content:'';display:inline-block;width:6px;height:6px;margin-right:7px;background:#8fe3a0}}.h2p ul.r li::before{{background:#ff8f8f}}
.h2p h4{{margin:6px 0 2px;font-size:12px;color:{t["acc"]};width:100%;text-align:left}}
.h2p .tbl2{{display:none}}
'''
    js=f'''
const ups=SHOP.ups.slice(0,6).map((u,i)=>`<div class="it ${{i===1?'sold':''}}">${{MK.img('cos-starlight-a',32)}}<div><b>${{u.n}}</b><span>${{u.a}} &rarr; ${{u.b}} &middot; Lv ${{u.lv}}/${{u.max}}</span><i class="lv"><u style="width:${{u.lv/u.max*100}}%"></u></i></div><button class="pr ${{SHOP.starlight<u.p?'no':''}}">${{u.p}}</button>${{i===1?`{stamp}`:''}}</div>`).join('')+
 `<div class="it" style="opacity:.6">${{MK.img('cos-starlight-a',32)}}<div><b>Long Night</b><span>+4 h offline cap &middot; max</span></div><span>Max</span></div>`;
const cards=SHOP.copies.slice(3,6).map(([id,p])=>`<div class="tile"><div class="t">${{MK.card(id,{{k:.5}})}}</div>${{MK.CARDS[id][0]}}<br><button class="${{SHOP.shards<p?'no':''}}">${{p}}</button></div>`).join('');
const names=['Summon Crystals','Glamour Crystals','Frost Cores','Glimmer Dust','Facet Shards'];
const sup=SHOP.supplies.map(([nm,a,p,s],i)=>`<div><img class="pix" src="{HP}h{n}/sup${{i+1}}.png" width="${{{nat("sup1.png")[0]*k}}}" height="${{{nat("sup1.png")[1]*k}}}" alt=""><span>${{nm}}<small>${{a}} &middot; ${{p}}</small></span></div>`).join('');
MK.shell('shop',`<div class="pg">
 <section class="stall" aria-label="Starlight shop"><div class="awn">{img("awn_a.png")}</div><div class="body"><div class="sign">Starlight shop <em class="num">23</em></div>${{ups}}</div></section>
 <section class="stall" aria-label="Shard shop"><div class="awn">{img("awn_b.png")}</div><div class="body"><div class="sign">Shard shop <div class="cn"></div><em class="num">87</em></div><div class="mini">${{cards}}</div><div class="sup">${{sup}}</div></div></section>
 <section class="stall" aria-label="Ascension"><div class="awn">{img("awn_c.png")}</div><div class="body"><div class="sign">Ascension <em>No. ${{SHOP.ascNum}}</em></div><div class="gate"><div class="wrap"><div class="ring"></div>${{MK.img('cos-starlight-a',48,48,'c')}}</div><b class="num">+${{SHOP.ascGain}} Starlight</b><small>Needs 10. You are at 14.</small><button class="ascb">Ascend</button>
  <h4>Kept</h4><ul>${{SHOP.kept.map(x=>`<li>${{x}}</li>`).join('')}}</ul><h4>Reset</h4><ul class="r">${{SHOP.reset.map(x=>`<li>${{x}}</li>`).join('')}}</ul></div></div></section>
</div>`,{{cls:'h2p',play:'Play a purchase'}});
'''
    html=f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=1264">
<title>Shop 2 pixel option {n}: {t["name"]}</title>
<link rel="stylesheet" href="../_shared/mock.css"><style>{css}</style></head><body><div id="app"></div>
<script src="../_shared/mock.js"></script><script src="../_shared/shopdata.js"></script><script>{js}</script></body></html>'''
    open(f"{ROOT}/shop/h2-pixel-{n}.html","w",encoding="utf-8").write(html)
if __name__=="__main__":
    for n in map(int,sys.argv[1:] or range(1,6)): shop_page(n)
