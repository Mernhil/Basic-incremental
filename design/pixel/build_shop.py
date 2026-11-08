import os,colorsys,sys; from common import *; from pal import P
from build_awn import run as cutbg
R="shop-market-stalls/raw/"; O="shop-market-stalls/"
RELABEL={4:(4,)}
NOCUT={"h3_awn_a","h3_awn_c"}
PROT={1:None,2:None,3:None,4:None,5:(15,70)}
MINSAT={1:.25,2:.10,3:.25,4:.25,5:.35}
def hue_shift(im,deg,minsat,prot):
    a=np.array(im).copy(); h,w=a.shape[:2]
    for y in range(h):
        for x in range(w):
            r,g,b,al=a[y,x]
            if al==0: continue
            H,S,V=colorsys.rgb_to_hsv(r/255,g/255,b/255)
            if S<minsat or V<.2: continue
            hd=H*360
            if prot and prot[0]<=hd<=prot[1]: continue
            H=((hd+deg)%360)/360; r2,g2,b2=colorsys.hsv_to_rgb(H,S,V)
            a[y,x,:3]=(round(r2*255),round(g2*255),round(b2*255))
    return Image.fromarray(a,"RGBA")
FONT={"B":["11110","10001","10001","11110","10001","10001","11110"],"O":["01110","10001","10001","10001","10001","10001","01110"],
"U":["10001"]*6+["01110"],"G":["01110","10001","10000","10111","10001","10001","01111"],"H":["10001","10001","10001","11111","10001","10001","10001"],"T":["11111"]+["00100"]*6}
def relabel(im,border=4,word="BOUGHT"):
    """keep the generated frame, redraw the word with a 5x7 pixel font in the frame's ink colour"""
    a=np.array(im).copy(); h,w=a.shape[:2]
    from collections import Counter
    ink=Counter(map(tuple,a[a[...,3]>0][:,:3])).most_common(1)[0][0]
    a[border:h-border,border:w-border]=0
    tw=len(word)*6-1; x0=(w-tw)//2; y0=(h-7)//2
    for i,ch in enumerate(word):
        for yy,row in enumerate(FONT[ch]):
            for xx,c in enumerate(row):
                if c=="1": a[y0+yy,x0+i*6+xx]=ink+(255,)
    return Image.fromarray(a,"RGBA")
def strip(frames):
    w,h=frames[0].size; s=Image.new("RGBA",(w*len(frames),h))
    for i,f in enumerate(frames): s.paste(f,(i*w,0))
    return s
def squash(im,f): return im.resize((max(2,round(im.width*f)),im.height),Image.NEAREST)
def build(n):
    pal=P[f"H{n}"]; d=O+f"h{n}"; os.makedirs(d,exist_ok=True)
    for k in "abc":
        nm=f"h{n}_awn_{k}"
        if not os.path.exists(R+nm+".png"): continue
        im=load(R+nm+".png") if nm in NOCUT else cutbg(nm)
        im=im.crop(bbox(im)) if nm not in NOCUT else im
        snap(im,pal).save(d+f"/awn_{k}.png")
    # ring + palette cycle strip
    rp=R+f"h{n}_ring.png"
    if os.path.exists(rp):
        ring=load(rp); ring=snap(ring.crop(bbox(ring)),[c for c in pal if c not in ("#8a5c2e","#5a3a1c")] if n==4 else pal); ring.save(d+"/ring.png")
        fr=[hue_shift(ring,45*i,MINSAT[n],PROT[n]) for i in range(8)]; strip(fr).save(d+"/ring_cycle.png")
    # coin + spin
    cp=R+f"h{n}_coin.png"
    if os.path.exists(cp):
        c=load(cp); c=snap(c.crop(bbox(c)),pal); c.save(d+"/coin.png")
        fr=[c]+[squash(c,f) for f in (.7,.4,.14)]+[squash(c.transpose(Image.FLIP_LEFT_RIGHT),f) for f in (.4,.7)]
        W=c.width; cs=[]
        for f in fr:
            cv=Image.new("RGBA",(W,c.height)); cv.paste(f,((W-f.width)//2,0)); cs.append(cv)
        strip(cs).save(d+"/coin_spin.png")
    # stamp
    sp=R+f"h{n}_stamp.png"
    if os.path.exists(sp):
        s=load(sp); s=s.crop(bbox(s))
        if n==4:
            a=np.array(s); a[a[...,3]>0]=hexrgb("#e83a3a")+(255,); a[...,3]=np.where(np.array(s)[...,3]>=128,255,0); s=Image.fromarray(a,"RGBA")
        else: s=snap(s,pal)
        if n in RELABEL: s=relabel(s,*RELABEL[n])
        if n==5:
            a=np.array(s); a[a[...,3]==0]=hexrgb('#f0e2c0')+(255,); s=Image.fromarray(a,'RGBA')
        s.save(d+"/stamp.png")
    # supplies
    for i in range(1,6):
        p=R+f"h{n}_sup{i}.png"
        if os.path.exists(p):
            s=load(p); snap(s.crop(bbox(s)),pal).save(d+f"/sup{i}.png")
    print("built",n)
if __name__=="__main__":
    for n in map(int,sys.argv[1:] or range(1,6)): build(n)
