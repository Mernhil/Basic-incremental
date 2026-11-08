import sys,os; from common import *
from pal import P
R="summon-deck-table/raw/"; O="summon-deck-table/"
# per option: felt tile idx, rim thickness T (auto), seg offset/len for edges, native scale shown, felt palette snap
OPT={1:dict(T=20,tile=1,seg=(14,10),bg=[(255,255,255),(242,236,214)]),
     2:dict(T=17,tile=5,seg=(18,10),bg=[(244,248,255)]),
     3:dict(T=20,tile=9,seg=(16,12),bg=[(255,255,255)]),
     4:dict(T=19,tile=12,seg=(14,10),bg=[(255,255,255)],k=2),
     5:dict(T=27,tile=14,seg=(16,12),bg=[(246,239,220)])}
def cut(im,bgs,tol=30):
    a=np.array(im).astype(np.int32); h,w=a.shape[:2]
    isbg=np.zeros((h,w),bool)
    for b in bgs: isbg|=(abs(a[...,:3]-np.array(b)).sum(-1)<tol)
    seen=np.zeros((h,w),bool); q=deque()
    for x in range(w):
        for y in (0,h-1):
            if isbg[y,x] and not seen[y,x]: seen[y,x]=True;q.append((x,y))
    for y in range(h):
        for x in (0,w-1):
            if isbg[y,x] and not seen[y,x]: seen[y,x]=True;q.append((x,y))
    while q:
        x,y=q.popleft()
        for dx,dy in((1,0),(-1,0),(0,1),(0,-1)):
            nx,ny=x+dx,y+dy
            if 0<=nx<w and 0<=ny<h and isbg[ny,nx] and not seen[ny,nx]: seen[ny,nx]=True;q.append((nx,ny))
    a[seen]=0; return Image.fromarray(a.astype(np.uint8),"RGBA")
def build(n):
    o=OPT[n]; k=o.get("k",1)
    W,H=(1044//k+(1 if k==1 else 0)),(717//k)
    if k==2: W,H=522,359
    else: W,H=1044,717
    pan=cut(load(R+f"s{n}_table.png"),o["bg"]); bb=bbox(pan); pan=pan.crop(bb); pw,ph=pan.size
    # inner felt start: scan middle row for first long run of felt (dark) after rim
    t=load(R+f"tile_{o['tile']}.png").crop((8,8,40,40)); t=snap(t,P[f"S{n}"]); tile=mirror_tile(t) if n in (2,5) else t
    # rim thickness: probe pan middle row until colour equals pan centre colour region
    T=o['T']
    c=T+16
    out=Image.new("RGBA",(W,H)); felt=fill_tile(tile,W,H)
    out.paste(felt.crop((T,T,W-T,H-T)),(T,T))
    pa=np.array(pan)
    # corners
    out.alpha_composite(pan.crop((0,0,c,c)),(0,0)); out.alpha_composite(pan.crop((pw-c,0,pw,c)),(W-c,0))
    out.alpha_composite(pan.crop((0,ph-c,c,ph)),(0,H-c)); out.alpha_composite(pan.crop((pw-c,ph-c,pw,ph)),(W-c,H-c))
    so,sl=o["seg"]; sx=c+so-16 if False else c
    # horizontal edges: strip from panel top/bottom between corner and centre
    top=pan.crop((c+so,0,c+so+sl,T)); bot=pan.crop((c+so,ph-T,c+so+sl,ph))
    lef=pan.crop((0,c+so,T,c+so+sl)); rig=pan.crop((pw-T,c+so,pw,c+so+sl))
    for x in range(c,W-c,sl):
        out.alpha_composite(top,(x,0)); out.alpha_composite(bot,(x,H-T))
    for y in range(c,H-c,sl):
        out.alpha_composite(lef,(0,y)); out.alpha_composite(rig,(W-T,y))
    # re-snap and ensure opaque
    out=snap(out,P[f"S{n}"])
    os.makedirs(O+f"s{n}",exist_ok=True)
    out.save(O+f"s{n}/table.png"); print(n,"T",T,"pan",pan.size,"->",out.size)
for n in map(int,sys.argv[1:] or [1,2,3,4,5]): build(n)
