import os; from common import *; from pal import P
R="shop-market-stalls/raw/"; O="shop-market-stalls/"
OPAQ=["h1_awn_b","h1_awn_c","h2_awn_a","h2_awn_c","h3_awn_a","h3_awn_c","h5_awn_a","h5_awn_c"]
def run(name,tol=45):
    im=load(R+name+".png"); a=np.array(im)
    if (a[...,3]==0).mean()>0.02: return im   # already transparent
    h,w=im.size[1],im.size[0]
    seeds=[(x,h-1) for x in range(w)]+[(0,y) for y in range(h)]+[(w-1,y) for y in range(h)]
    return flood_bg(im,seeds,tol=tol)
if __name__=="__main__":
    ims=[]
    for n in range(1,6):
        for k in "abc":
            nm=f"h{n}_awn_{k}"
            if os.path.exists(R+nm+".png"): 
                o=run(nm); o.save(R+nm+"_cut.png"); ims.append(R+nm+"_cut.png")
    import subprocess,sys
    subprocess.run([sys.executable,"stack.py",R+"awn_cut.png","1"]+ims)
