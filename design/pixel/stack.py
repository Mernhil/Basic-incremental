import sys
from PIL import Image
out,sc,*fs=sys.argv[1:]; sc=int(sc); ims=[Image.open(f).convert("RGBA") for f in fs]
W=max(i.width*sc for i in ims); H=sum(i.height*sc+6 for i in ims)
m=Image.new("RGBA",(W,H),(120,120,130,255)); y=0
for i in ims:
    m.alpha_composite(i.resize((i.width*sc,i.height*sc),Image.NEAREST),(0,y)); y+=i.height*sc+6
m.save(out)
