import os,sys; sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from gen_html import SUM
from gen_shop_html import T
HERE=os.path.dirname(os.path.abspath(__file__)); ROOT=os.path.join(HERE,"..","options")
CRED=sys.argv[1] if len(sys.argv)>1 else ""
def card_s(n):
    s=SUM[n]; p=f"summon/s5-pixel-{n}"; k=f"../pixel/summon-deck-table/s{n}"
    return f'''<article class="opt"><h3>S{n} {s["name"]}</h3><p>{s["line"]}</p>
<a href="{p}.html"><img class="shot" src="{p}-idle.png" alt="Summon option {n}, idle"></a>
<a href="{p}.html?state=play"><img class="shot" src="{p}-play.png" alt="Summon option {n}, dealing"></a>
<div class="kit"><img class="pix" src="{k}/kit.png" alt="Art kit: card backs, odds plate, deck thickness ladder"></div>
<div class="gifs"><figure><img class="pix" src="{k}/anim_flip_preview.gif" alt="Card flip"><figcaption>Card flip</figcaption></figure></div>
<p class="links"><a href="{p}.html">Page</a> <a href="{p}-idle.png">1x idle</a> <a href="{p}-idle@2x.png">2x idle</a> <a href="{p}-play.png">1x deal</a> <a href="{p}-play@2x.png">2x deal</a></p></article>'''
def card_h(n):
    t=T[n]; p=f"shop/h2-pixel-{n}"; k=f"../pixel/shop-market-stalls/h{n}"
    return f'''<article class="opt"><h3>H{n} {t["name"]}</h3><p>{t["line"]}</p>
<a href="{p}.html"><img class="shot" src="{p}-idle.png" alt="Shop option {n}, idle"></a>
<a href="{p}.html?state=play"><img class="shot" src="{p}-play.png" alt="Shop option {n}, purchase"></a>
<div class="kit"><img class="pix" src="{k}/kit.png" alt="Art kit: three awnings, ring, stamp, shard coin, five supply icons"></div>
<div class="gifs"><figure><img class="pix" src="{k}/anim_ring_spinup_preview.gif" alt="Ring spin-up"><figcaption>Ring spin-up</figcaption></figure><figure><img class="pix" src="{k}/anim_stamp_slam_preview.gif" alt="Stamp slam"><figcaption>Stamp slam</figcaption></figure><figure><img class="pix" src="{k}/anim_coin_spin_preview.gif" alt="Coin spin"><figcaption>Coin spin</figcaption></figure></div>
<p class="links"><a href="{p}.html">Page</a> <a href="{p}-idle.png">1x idle</a> <a href="{p}-idle@2x.png">2x idle</a> <a href="{p}-play.png">1x purchase</a> <a href="{p}-play@2x.png">2x purchase</a></p></article>'''
html=f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pixel picks: Summon and Shop</title>
<style>
:root{{--bg:#0f1115;--card:#181b22;--line:#2a2f3a;--ink:#e9eef7;--mut:#9aa6ba;--acc:#e8c05a}}
*{{box-sizing:border-box}}body{{margin:0;padding:28px 32px 60px;background:var(--bg);color:var(--ink);font:500 14px/1.45 'Segoe UI',system-ui,sans-serif}}
h1{{margin:0 0 4px;font-size:28px}}h2{{margin:40px 0 4px;font-size:22px;border-bottom:1px solid var(--line);padding-bottom:6px}}
.lead{{max-width:90ch;color:var(--mut);margin:0 0 10px}}.row{{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:14px;margin-top:14px}}
@media(max-width:1700px){{.row{{grid-template-columns:repeat(3,minmax(0,1fr))}}}}@media(max-width:1000px){{.row{{grid-template-columns:1fr}}}}
.opt{{background:var(--card);border:1px solid var(--line);padding:12px;display:grid;gap:8px;align-content:start;min-width:0}}
.opt h3{{margin:0;font-size:16px;color:var(--acc)}}.opt p{{margin:0;color:#c4cddb;font-size:13px}}
.shot{{width:100%;display:block;border:1px solid var(--line)}}
.kit,.gifs{{overflow:auto;background:#3a3c48;padding:6px;border:1px solid var(--line)}}.pix{{image-rendering:pixelated;display:block;max-width:none}}
.gifs{{display:flex;gap:10px;flex-wrap:wrap}}figure{{margin:0}}figcaption{{font-size:11px;color:#c4cddb;margin-top:2px}}
.links{{display:flex;gap:10px;flex-wrap:wrap;font-size:12px}}a{{color:var(--acc)}}
.note{{background:#14181f;border:1px solid var(--line);padding:10px 14px;max-width:110ch;color:#c4cddb;font-size:13px}}
</style></head><body>
<h1>Pixel picks: Deck and Table, Market Stalls</h1>
<p class="lead">Your two chosen layouts redone with real pixel art made in PixelLab (each screen five treatments that differ in palette, material, detail, shading and ornament). Nothing here is in the game. Pixel art is shown at 1 CSS pixel per art pixel in the 1x shots, and the 2x shots are the game-scale pass (every art pixel 2 device pixels); the half-resolution options (S4, H4) draw on a half-size grid and are shown at 2x on purpose. The screen thumbnails below are shrunk to fit this page, so click one for the full-size page; the art kits and GIFs are shown unscaled.</p>
<p class="note">Same layouts and motion ideas as Summon 5 and Shop 2, with two changes made to keep pixels whole: the card hand is a straight arc of cards instead of a rotated fan, and the three shop stalls are an equal 320 px wide so the awnings are not stretched. Card faces and the Starlight coin are the existing game art at the mockup scale; the mini cards in the Shard shop are still the placeholder 0.5 scale and need a whole-scale card for the real screen (ui request). {CRED}</p>
<h2>Summon: Deck and Table</h2>
<div class="row">{"".join(card_s(n) for n in range(1,6))}</div>
<h2>Shop: Market Stalls</h2>
<div class="row">{"".join(card_h(n) for n in range(1,6))}</div>
</body></html>'''
open(os.path.join(ROOT,"pixel-picks.html"),"w",encoding="utf-8").write(html)
print("index written")
