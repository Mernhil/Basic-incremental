"""Exports every cosmetic sprite of the beta art batch (B1-B10, DESIGN.md 7 "Every option is kept").

Run by scripts/art/bake-pixels.mjs after the vector sprites are baked (the coins and frames read
those). Writes src/renderer/src/art/pixel/sprites/cos-*.png and cosmetics.meta.json, which the bake
turns into the manifest entries, art/pixel/cosmetics.gen.ts and the generated block in
theme/recipes.css. Deterministic: same input, same bytes.

    python scripts/art/cosmetics/export.py <meta.json>
"""
from __future__ import annotations

import json
import sys

import b1_starlight as b1
import b2_verdant as b2
import b3_b4_exclusives as b34
import b5_b7_misc as b5
import card as K
from px import *  # noqa: F403

LETTERS = "ABCDE"

# Stable ids (data names these). Option A of each batch carries the batch's name.
STARLIGHT = ["a", "b", "c", "d", "e"]
GARDEN = dict(zip(LETTERS, ["verdant", "vine", "fern", "moss", "blossom"]))
DRYAD = dict(zip(LETTERS, ["heartwood", "antler", "rings", "luna", "wreath"]))
TITAN = dict(zip(LETTERS, ["corepulse", "veins", "hexcore", "strata", "starburst"]))
LOOSE = dict(zip(LETTERS, ["forge", "woodcraft", "starmap", "candy", "rune"]))

written: list[str] = []


def emit(name: str, img, scale: int = 1, sweep: bool = True) -> None:
    if sweep:
        img = sweep_orphans(img)
    if scale != 1:
        img = img.resize((img.width * scale, img.height * scale), Image.NEAREST)
    img.save(SPRITES / f"cos-{name}.png", optimize=True)
    written.append(name)


def sheet(frames):
    w, h = frames[0].size
    s = new(w * len(frames), h)
    for i, f in enumerate(frames):
        s.alpha_composite(f, (i * w, 0))
    return s


_frames = None


def protect(layer):
    """Tier ornaments win at the corners (DESIGN 7): clear the flourish wherever any tier frame
    draws a socket, the crest or the bottom gem, so the layer can sit above the frame."""
    global _frames
    if _frames is None:
        _frames = [sprite(f"frame-{t}") for t in ("bronze", "silver", "gold", "prismatic")]
    px_ = layer.load()
    for x0, y0, x1, y1 in K.PROTECT:
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                if any(f.getpixel((x, y))[3] for f in _frames):
                    px_[x, y] = CLEAR
    return layer


def hexes(rp):
    return ["#%02x%02x%02x" % c[:3] for c in rp]


def hx(c):
    return "#%02x%02x%02x" % c[:3]


def motif_sprite(opt):
    m = new(14, 12)
    b2.motif(m, opt, 3, 7, 1.0, 0)
    outline(m)
    return m


def dew_sprite():
    d = new(7, 7)
    b2.dew(d, 3, 3, 2, b2.DEW)
    return d


def gem_sprite(rp):
    g = new(10, 10)
    facet_gem(g, ngon(5, 5, 4, 3.2, rot=0), rp, 5, 5, table=0)
    outline(g)
    return g


def main() -> None:
    meta: dict = {
        "starlight": STARLIGHT,
        "skins": {"starlight": STARLIGHT},
        "borders": {},
        "finishes": {},
        "attacks": {},
        "ticks": {},
        "numbers": {},
        "tables": {},
        "cursors": {},
    }

    # ---- B1 Starlight coin: five 48 x 48 coins ----
    for k, (_, fn) in zip(STARLIGHT, b1.OPTIONS):
        emit(f"starlight-{k}", fn())

    # ---- shared tick / number decorations ----
    emit("deco-dew", dew_sprite())

    # ---- B2 five garden sets: every slot at L1-L5 (Legendary, max 5) ----
    for opt, sid in GARDEN.items():
        o = b2.OPTS[opt]
        for lv in range(1, 6):
            emit(f"bd-{sid}-{lv}", protect(b2.border_layer(opt, lv)))
            emit(f"fn-{sid}-{lv}", b2.finish_layer(opt, lv))
            emit(f"atk-{sid}-{lv}", sheet(b2.attack_frames(opt, lv)))
            emit(f"tb-{sid}-{lv}", b2.table(opt, lv))
            emit(f"cur-{sid}-{lv}", b2.cursor(opt, lv), scale=2)
        emit(f"amb-{sid}", b2.petal(opt))
        emit(f"deco-{sid}", motif_sprite(opt))
        body, core = b2.STROKE[opt]
        num = b2.ROSE if opt == "E" else body
        meta["borders"][sid] = dict(batch="B2", option=opt, name=o["name"], levels=5, amb=f"amb-{sid}")
        meta["finishes"][sid] = dict(batch="B2", option=opt, name=o["name"], levels=5, amb=f"amb-{sid}")
        meta["attacks"][sid] = dict(batch="B2", option=opt, levels=5, frames=4, size=64,
                                    edge=hx(body[3]), particle=hx(core[4]))
        meta["ticks"][sid] = dict(batch="B2", option=opt, family="garden", levels=5, ramp=hexes(num),
                                  glow=hx(o["glow"]), motif=f"deco-{sid}", petal=f"amb-{sid}")
        meta["numbers"][sid] = dict(batch="B2", option=opt, family="garden", levels=5, ramp=hexes(num),
                                    glow=hx(mix(o["glow"], H("#000000"), 0.55)))
        meta["tables"][sid] = dict(batch="B2", option=opt, levels=5, w=96, h=48)
        meta["cursors"][sid] = dict(batch="B2", option=opt, levels=5, hot=[6, 4])
        meta["borders"][sid]["tokens"] = dict(plate=hx(o["plate"]), panel=hx(o["panel"]),
                                              window=hx(o["window"]), line=hx(o["line"]))

    # ---- B3 Moonwood Dryad exclusive borders (Mythic, max 5) ----
    for opt, sid in DRYAD.items():
        for lv in range(1, 6):
            emit(f"bd-{sid}-{lv}", protect(b34.halo_layer(opt, lv)))
        emit(f"amb-{sid}", b34.mote(b34.B3[opt]["glow"]))
        meta["borders"][sid] = dict(batch="B3", option=opt, name=b34.B3[opt]["name"], levels=5,
                                    amb=f"amb-{sid}", exclusive="moonwood_dryad")

    # ---- B4 Core Titan exclusive finishes (Exotic, max 6), L6 pulses through three frames ----
    for opt, sid in TITAN.items():
        for lv in range(1, 7):
            emit(f"fn-{sid}-{lv}", b34.pulse_layer(opt, lv))
        emit(f"fnp-{sid}", sheet([b34.pulse_layer(opt, 6, ph) for ph in range(3)]))
        emit(f"amb-{sid}", b34.mote(b34.HOTC[3]))
        meta["finishes"][sid] = dict(batch="B4", option=opt, name=b34.B4[opt]["name"], levels=6,
                                     amb=f"amb-{sid}", pulse=f"fnp-{sid}", exclusive="core_titan")

    # ---- B5 loose items: Common border (2), Common numbers (2), Epic attack (4), Epic tick (4) ----
    for opt, sid in LOOSE.items():
        o = b5.B5[opt]
        for lv in (1, 2):
            emit(f"bd-{sid}-{lv}", protect(b5.b5_border(opt, lv)))
        for lv in range(1, 5):
            emit(f"atk-{sid}-{lv}", sheet(b5.b5_attack_frames(opt, lv)))
        emit(f"amb-{sid}", b5.b5_mote(opt))
        emit(f"deco-{sid}", gem_sprite(o["acc"]))
        names = o["names"]
        meta["borders"][sid] = dict(batch="B5", option=opt, name=names[0], levels=2, amb=f"amb-{sid}")
        meta["numbers"][sid] = dict(batch="B5", option=opt, name=names[1], family="loose", levels=2,
                                    ramp=hexes(o["metal"]), acc=hexes(o["acc"]))
        meta["attacks"][sid] = dict(batch="B5", option=opt, name=names[2], levels=4, frames=4, size=64,
                                    edge=hx(o["metal"][3]), particle=hx(o["acc"][4]))
        meta["ticks"][sid] = dict(batch="B5", option=opt, name=names[3], family="loose", levels=4,
                                  ramp=hexes(o["metal"]), acc=hexes(o["acc"]), gem=f"deco-{sid}",
                                  glow=hx(mix(o["acc"][4], WHITE, 0.4)))

    for extra in ("b6", "b7", "b8", "b9", "b10"):
        try:
            mod = __import__(f"{extra}_export")
        except ModuleNotFoundError:
            continue
        mod.export(emit, meta)

    meta["sprites"] = sorted(written)
    Path(sys.argv[1]).write_text(json.dumps(meta, indent=1, sort_keys=True) + "\n", encoding="utf8")
    print(f"exported {len(written)} cosmetic sprites", file=sys.stderr)


if __name__ == "__main__":
    main()
