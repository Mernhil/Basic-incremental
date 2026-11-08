import sys,os; from common import *
from pal import P
R="summon-deck-table/raw/"; O="summon-deck-table/"
# field lattice colours (a base, b line), edge colours (paper, shade), face paper
OPT={1:dict(f=("#151a40","#2a3a8a"),f2=("#2a1448","#5a2e9a"),edge=("#f2ecd6","#b9ad8c"),paper="#f2ecd6",rim="#e8b84a"),
     2:dict(f=("#1e1442","#2c1f5e"),f2=("#1e1442","#3f2f80"),edge=("#c8d2ea","#4a5470"),paper="#f4f8ff",rim="#8b97b8"),
     3:dict(f=("#5a1a2a","#7e2838"),f2=("#1f6a6a","#3aa0a0"),edge=("#f4e8cc","#cdb98e"),paper="#f4e8cc",rim="#d3ab52"),
     4:dict(f=("#3868f0","#1830a0"),f2=("#f040a0","#a01868"),edge=("#ffffff","#c8d8ff"),paper="#ffffff",rim="#ffe060"),
     5:dict(f=("#0b1f17","#123226"),f2=("#2a1a04","#6a4208"),edge=("#e0a838","#6a4208"),paper="#f6efdc",rim="#e0a838")}
def lattice(w,h,a,b,s=8):
    im=Image.new("RGBA",(w,h),hexrgb(a)+(255,)); px=im.load(); B=hexrgb(b)+(255,)
    for y in range(h):
        for x in range(w):
            if (x+y)%s==0 or (x-y)%s==0: px[x,y]=B
    return im
def make_back(src,n,field):
    im=load(src); w,h=im.size
    outer=outer_region(im); sil=~outer
    if sil.sum()<0.55*w*h:   # no closed outline: rounded rect
        m=Image.new("L",(w,h),0); from PIL import ImageDraw; ImageDraw.Draw(m).rounded_rectangle((1,1,w-2,h-2),radius=max(4,w//12),fill=255)
        sil=np.array(m)>0
    base=lattice(w,h,*field)
    arr=np.array(base); arr[~sil]=0
    out=Image.fromarray(arr,"RGBA"); out.alpha_composite(im)
    # ink outline 1px around silhouette inside canvas
    a=np.array(out); sa=sil; edge=sa&~np.pad(sa,1)[2:,1:-1]|sa&~np.pad(sa,1)[:-2,1:-1]|sa&~np.pad(sa,1)[1:-1,2:]|sa&~np.pad(sa,1)[1:-1,:-2]
    edge_px=a[edge]
    # only force ink if outline is not already dark
    dark=(edge_px[:,:3].astype(int).sum(1)<200)
    if dark.mean()<0.6: a[edge]=INK+(255,)
    out=Image.fromarray(a,"RGBA")
    return snap(out,P[f"S{n}"])
def pad_card(im):
    if im.height==184: 
        o=Image.new("RGBA",(im.width,186)); o.paste(im,(0,1)); return o
    return im
def deck(card,t,edge):
    w,h=card.size; bb=bbox(card)
    from PIL import ImageDraw
    m=Image.new("L",(w,h),0); ImageDraw.Draw(m).rounded_rectangle((bb[0],bb[1],bb[2]-1,bb[3]-1),radius=7,fill=255); sil=np.array(m)>0
    out=Image.new("RGBA",(w+t,h+t)); px=out.load()
    E=[hexrgb(edge[0])+(255,),hexrgb(edge[1])+(255,)]
    for i in range(t,0,-1):
        col=E[1] if (i%3==0) else E[0]
        for y,x in zip(*np.nonzero(sil)):
            px[x+i,y+i]=col
    # ink outline of the stack body (outside the card) 1px
    out.alpha_composite(card); 
    a=np.array(out); s=a[...,3]>0; ed=s&~np.pad(s,1)[2:,1:-1]|s&~np.pad(s,1)[1:-1,2:]
    a[ed&(a[...,3]>0)&np.array([[True]])]=a[ed]  # noop placeholder
    return Image.fromarray(a,"RGBA")
def squash(im,f):
    w=max(2,round(im.width*f)); return im.resize((w,im.height),Image.NEAREST)
def face_of(card,n):
    o=OPT[n]; a=np.array(card); sil=a[...,3]>0; h,w=sil.shape
    out=np.zeros_like(a); out[sil]=hexrgb(o["paper"])+(255,)
    # 4px rim ring
    er=sil.copy()
    for _ in range(4): er=er&np.pad(er,1)[2:,1:-1]&np.pad(er,1)[:-2,1:-1]&np.pad(er,1)[1:-1,2:]&np.pad(er,1)[1:-1,:-2]
    out[sil&~er]=hexrgb(o["rim"])+(255,)
    e1=sil&~er; 
    # ink outer
    ed=sil&(~np.pad(sil,1)[2:,1:-1]|~np.pad(sil,1)[:-2,1:-1]|~np.pad(sil,1)[1:-1,2:]|~np.pad(sil,1)[1:-1,:-2])
    out[ed]=INK+(255,)
    # glint star in centre
    cx,cy=w//2,h//2
    for d in range(-9,10):
        for (x,y) in ((cx+d,cy),(cx,cy+d)):
            out[y,x]=(255,255,255,255) if abs(d)<6 else hexrgb(o["rim"])+(255,)
    return Image.fromarray(out,"RGBA")
if __name__=="__main__":
    for n in range(1,6):
        o=OPT[n]; os.makedirs(O+f"s{n}",exist_ok=True)
        for kind,field in (("portal",o["f"]),("wardrobe",o["f2"])):
            src=R+f"s{n}_back_{kind}.png"
            if not os.path.exists(src): continue
            c=pad_card(make_back(src,n,field)); c.save(O+f"s{n}/back_{kind}.png")
            for t in (3,8,14,20):
                deck(c,t,o["edge"]).save(O+f"s{n}/deck_{kind}_{t}.png")
            if kind=="portal":
                os.makedirs(O+f"s{n}/flip",exist_ok=True); fc=face_of(c,n)
                fr=[c]+[squash(c,f) for f in (.8,.55,.3,.1)]+[squash(fc,f) for f in (.1,.3,.55,.8)]+[fc]
                W=c.width
                for i,f in enumerate(fr):
                    cv=Image.new("RGBA",(W,c.height)); cv.paste(f,((W-f.width)//2,0)); cv.save(O+f"s{n}/flip/f{i}.png")
                st=Image.new("RGBA",(W*len(fr),c.height))
                for i in range(len(fr)): st.paste(Image.open(O+f"s{n}/flip/f{i}.png"),(i*W,0))
                st.save(O+f"s{n}/flip_strip.png")
        print("built",n)
