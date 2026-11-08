import numpy as np
from PIL import Image
from collections import deque
INK=(0x1a,0x10,0x20)
def hexrgb(h): h=h.lstrip('#'); return tuple(int(h[i:i+2],16) for i in (0,2,4))
def load(p): return Image.open(p).convert("RGBA")
def snap(im,pal,thr=128):
    """nearest-colour snap to palette (list of hex), binary alpha"""
    a=np.array(im); rgb=a[...,:3].astype(np.float32); al=a[...,3]
    P=np.array([hexrgb(h) for h in pal],np.float32)
    # weighted distance (redmean-ish)
    d=((rgb[:,:,None,:]-P[None,None,:,:])**2*np.array([2,4,3],np.float32)).sum(-1)
    idx=d.argmin(-1); out=P[idx].astype(np.uint8)
    res=np.dstack([out,np.where(al>=thr,255,0).astype(np.uint8)])
    res[res[...,3]==0]=0
    return Image.fromarray(res,"RGBA")
def flood_bg(im,seeds,tol=36,step=True):
    """make transparent the region connected to seeds where neighbour colour diff<tol"""
    a=np.array(im).astype(np.int32); h,w=a.shape[:2]; seen=np.zeros((h,w),bool); q=deque()
    for (x,y) in seeds:
        if not seen[y,x]: seen[y,x]=True; q.append((x,y))
    while q:
        x,y=q.popleft()
        for dx,dy in ((1,0),(-1,0),(0,1),(0,-1)):
            nx,ny=x+dx,y+dy
            if 0<=nx<w and 0<=ny<h and not seen[ny,nx]:
                if abs(a[ny,nx,:3]-a[y,x,:3]).sum()<tol: seen[ny,nx]=True; q.append((nx,ny))
    a=a.astype(np.uint8); a[seen]=0
    return Image.fromarray(a,"RGBA")
def outer_region(im):
    """boolean mask of transparent pixels connected to the border"""
    a=np.array(im)[...,3]==0; h,w=a.shape; seen=np.zeros((h,w),bool); q=deque()
    for x in range(w):
        for y in (0,h-1):
            if a[y,x] and not seen[y,x]: seen[y,x]=True; q.append((x,y))
    for y in range(h):
        for x in (0,w-1):
            if a[y,x] and not seen[y,x]: seen[y,x]=True; q.append((x,y))
    while q:
        x,y=q.popleft()
        for dx,dy in ((1,0),(-1,0),(0,1),(0,-1)):
            nx,ny=x+dx,y+dy
            if 0<=nx<w and 0<=ny<h and a[ny,nx] and not seen[ny,nx]: seen[ny,nx]=True; q.append((nx,ny))
    return seen
def scale(im,k): return im.resize((im.width*k,im.height*k),Image.NEAREST)
def mirror_tile(t):
    w,h=t.size; m=Image.new("RGBA",(w*2,h*2))
    m.paste(t,(0,0)); m.paste(t.transpose(Image.FLIP_LEFT_RIGHT),(w,0))
    m.paste(t.transpose(Image.FLIP_TOP_BOTTOM),(0,h)); m.paste(t.transpose(Image.ROTATE_180),(w,h)); return m
def fill_tile(t,W,H):
    out=Image.new("RGBA",(W,H))
    for y in range(0,H,t.height):
        for x in range(0,W,t.width): out.paste(t,(x,y))
    return out
def bbox(im):
    return im.getchannel("A").point(lambda v:255 if v else 0).getbbox()
