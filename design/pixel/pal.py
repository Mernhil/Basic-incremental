import base64,io,sys,json
from PIL import Image
P={
"S1":["#1a1020","#0d2a1f","#134030","#1b5a41","#2a7a58","#4aa07a","#3a2208","#7a4a12","#b9822a","#e8b84a","#fbe9a0","#ffffff","#151a40","#2a3a8a","#4a6ad0","#9ab4ff","#c03040","#f2ecd6","#2a1448","#5a2e9a","#9a6ae0","#d8b8ff"],
"S2":["#0e0a1c","#120c2a","#1e1442","#2c1f5e","#3f2f80","#5a49a8","#1f2433","#4a5470","#8b97b8","#c8d2ea","#f4f8ff","#0e5a68","#1fa6b8","#7fe3ee","#a02a70","#d96ba3","#ffc0e0","#fff2a8","#e8c860"],
"S3":["#1a0e12","#3a0f1c","#5a1a2a","#7e2838","#a03a48","#c25a60","#2a1608","#4a2a12","#7a4a22","#a8703a","#d4a063","#8a6a20","#d3ab52","#f3d98a","#f4e8cc","#cdb98e","#1f6a6a","#3aa0a0","#7ad8c8","#ffffff"],
"S4":["#14081e","#0b5d5a","#118a82","#1fb8a8","#6fe8d0","#7a4a00","#f2a810","#ffe060","#a01868","#f040a0","#1830a0","#3868f0","#ffffff","#c8d8ff"],
"S5":["#0a0610","#050f0b","#0b1f17","#123226","#1d4a38","#2a1a04","#6a4208","#a8761a","#e0a838","#ffe58a","#fff6c8","#6a0a1a","#c01c34","#ff5a6a","#0a1a60","#2858d0","#8ab4ff","#f6efdc","#c8bc98","#3a1a58","#7a48c0","#c8a0ff"],
"H1":["#14101e","#2e1c6a","#5a3fc0","#8a70e8","#f4efff","#c8c0e8","#0c4a52","#1f9aa6","#5ed0d8","#e6fafa","#8a2a60","#d96ba3","#f2a0c8","#fff3b8","#e8cf70","#2a1608","#5a3a1c","#8a5c2e","#b98a52","#7a4a12","#d9b35a","#ffe08a","#8a1a1a","#e83a3a","#ff8a8a","#ff6fc8","#ffd76a","#6fe3ff","#a77bff","#ffffff"],
"H2":["#4a3060","#7a68c8","#b8a8f0","#e6dcff","#6ac8b8","#a8ecdc","#e0fff4","#e88ab0","#ffbcd4","#fff0f4","#ffe9a0","#fff6cc","#e86060","#ffa0a0","#8a6aa8","#d8c8a8","#f0e4c8","#ffffff","#ffc8e8","#b8f0ff","#d8c0ff","#ffe0a0"],
"H3":["#08060e","#1c1650","#3a2e9a","#0a3a40","#1a7a80","#50123a","#a02a70","#ffb040","#ffe090","#40f0ff","#ff40b0","#ff2a4a","#ff8090","#2a2440","#4a4268","#8a80b0","#ffffff","#b0ff70","#7a40e0","#1a1228"],
"H4":["#14081e","#ffffff","#e83a3a","#f2a810","#ffe060","#3868f0","#1fb8a8","#a040e0","#f040a0","#6fe8d0","#8a5c2e","#5a3a1c"],
"H5":["#24120c","#5a1428","#9a2a40","#d85a68","#7a4e10","#c8901c","#f4c850","#0c3a50","#1c6e8a","#58b4c8","#f0e2c0","#d4be90","#3a1a58","#6a3aa0","#a878e0","#a01c10","#e8452a","#ffffff","#2a4a1c","#5a8a3a","#a8d070","#4a3220","#8a6038","#c89a60","#fff4d0","#ff9aa8","#e8b0f0","#7ad8a0","#f8d890","#6a4060"],
}
def sw(k):
    cs=P[k]; im=Image.new("RGB",(len(cs),1))
    for i,c in enumerate(cs): im.putpixel((i,0),tuple(int(c[j:j+2],16) for j in (1,3,5)))
    im=im.resize((len(cs)*4,4),Image.NEAREST); b=io.BytesIO(); im.save(b,"PNG"); return base64.b64encode(b.getvalue()).decode()
if __name__=="__main__":
    k=sys.argv[1]; print(sw(k))
    if len(sys.argv)>2: print(json.dumps(P[k]))
