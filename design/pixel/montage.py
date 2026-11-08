import sys
from PIL import Image
# montage.py out.png scale files...
out,sc,*fs=sys.argv[1:]; sc=int(sc); ims=[Image.open(f).convert("RGBA") for f in fs]
W=sum(i.width*sc+8 for i in ims); H=max(i.height*sc for i in ims)
m=Image.new("RGBA",(W,H),(90,90,100,255)); x=0
for i in ims:
    m.alpha_composite(i.resize((i.width*sc,i.height*sc),Image.NEAREST),(x,0)); x+=i.width*sc+8
m.save(out)
