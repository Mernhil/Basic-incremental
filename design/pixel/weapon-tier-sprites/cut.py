"""Cuts the 80 weapon cells out of the eight concept sheets and builds the 4x PixelLab input sheets."""
import json, sys
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

SRC=Path(sys.argv[1]) if __name__ == '__main__' else None  # set by straight.py when imported
TYPES=["sword","greatsword","dagger","hammer","lance","bow","scythe","logging_axe"]
FILE={"logging_axe":"logging_axe","scythe":"scythe","hammer":"hammer","sword":"sword","lance":"lance","bow":"bow","greatsword":"greatsword","dagger":"dagger"}
STEPS=[("t1",0),("t2",0),("t2",1),("t3",0),("t3",1),("t3",2),("t4",0),("t4",1),("t4",2),("t4",3)]
ROWLEN=[1,2,3,4]
K=4; CW,CH=100,120
BOXW,BOXH=88,108

def components(a,bg,dil=5):
    """Boxes (x0, y0, x1, y1, label) of the dilated non-background blobs, plus the label image."""
    m=np.abs(a-bg).sum(-1)>60
    lab,k=ndi.label(ndi.binary_dilation(m,iterations=dil))
    res=[]
    for i,s in enumerate(ndi.find_objects(lab)):
        res.append((s[1].start,s[0].start,s[1].stop,s[0].stop,i+1))
    return res,lab

def cells(name):
    im=Image.open(SRC/f"{FILE[name]}.webp").convert("RGB"); a=np.array(im).astype(int)
    bg=np.median(a.reshape(-1,3),axis=0)
    if name=="bow":
        m=np.abs(a-bg).sum(-1)>60
        # remove the thin divider lines and the row-label boxes
        for y in range(a.shape[0]):
            if m[y,200:].mean()>0.6: a[max(0,y-3):y+4,:]=bg
        a[:, :200]=bg
        for y in (336,628,926,1240): a[y:y+30,:]=bg  # the "base" / "+1" captions under each bow
        full=a.copy()
        bands=[(60,350),(375,655),(670,955),(970,1300)]
        found=[]
        for r,(y0,y1) in enumerate(bands):
            sub=a[y0:y1]
            cl,lab=components(sub,bg,3)
            cs=sorted(c for c in cl if (c[3]-c[1])>=60)[:ROWLEN[r]]
            found.append([(c[0],c[1]+y0,c[2],c[3]+y0,lab[c[1]:c[3],c[0]:c[2]]==c[4]) for c in cs])
        return Image.fromarray(full.astype(np.uint8)),found
    cl,lab=components(a,bg)
    cs=[c[:4]+(lab[c[1]:c[3],c[0]:c[2]]==c[4],) for c in cl if (c[3]-c[1])>=120 and (c[2]-c[0])>=100 and c[0]>200]
    # rows by y
    cs=sorted(cs,key=lambda c:c[1])
    rows=[[] for _ in range(4)]
    ys=sorted(set((c[1]+c[3])//2 for c in cs))
    # cluster by centre y into 4 rows
    cen=[(c[1]+c[3])/2 for c in cs]
    order=np.argsort(cen)
    k=0; rowi=[0]*len(cs)
    sorted_c=[cs[i] for i in order]; sc=[cen[i] for i in order]
    r=0; groups=[[sorted_c[0]]]
    for c,y in zip(sorted_c[1:],sc[1:]):
        if y-np.mean([(g[1]+g[3])/2 for g in groups[-1]])>110: groups.append([c])
        else: groups[-1].append(c)
    assert len(groups)==4,(name,len(groups))
    found=[sorted(g,key=lambda c:c[0]) for g in groups]
    for r,g in enumerate(found): assert len(g)==ROWLEN[r],(name,r,len(g))
    return im,found

def main():
    OUT=Path(sys.argv[2]); OUT.mkdir(parents=True,exist_ok=True)
    meta={}
    for t in TYPES:
        im,found=cells(t)
        boxes=[b for row in found for b in row]
        assert len(boxes)==10
        s=min(min(BOXW/(b[2]-b[0]),BOXH/(b[3]-b[1])) for b in boxes)
        bgc=tuple(int(v) for v in np.median(np.array(im).reshape(-1,3),axis=0))
        meta[t]={"scale":s,"boxes":[list(map(int,b[:4])) for b in boxes],"bg":bgc}
        sheet=Image.new("RGB",(5*CW*K,2*CH*K),bgc)
        for i,b in enumerate(boxes):
            crop=im.crop(b[:4])
            keep=ndi.binary_dilation(b[4],iterations=3)  # only this weapon's own pixels, never a neighbour's
            arr=np.array(crop); arr[~keep]=bgc; crop=Image.fromarray(arr)
            w,h=round(crop.width*s*K),round(crop.height*s*K)
            crop=crop.resize((w,h),Image.LANCZOS)
            ox,oy=(i%5)*CW*K,(i//5)*CH*K
            sheet.paste(crop,(ox+(CW*K-w)//2,oy+(CH*K-h)//2))
        sheet.save(OUT/f"in-{t}.png")
        print(t,round(s,3),sheet.size,bgc)
    (OUT/"layout.json").write_text(json.dumps(meta,indent=1))


if __name__ == '__main__':
    main()
