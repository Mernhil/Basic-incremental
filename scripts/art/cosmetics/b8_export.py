"""B8 ambient particles: pixel sprites for the existing particle themes (gilt motes, embers, glints,
stars, bubbles), so every max-level particle is crisp pixels. The five motions (rail drift, cel
pop, frame orbit, slow pair, footer fountain) are CSS in theme/recipes.css."""
from px import *  # noqa: F403

GILT = ramp("#e8c057")


def mote():
    p = new(7, 7)
    poly(p, [(3, 0), (6, 3), (3, 6), (0, 3)], GILT[2])
    poly(p, [(3, 0), (3, 3), (0, 3)], GILT[4])
    outline(p)
    return p


def ember():
    p = new(7, 9)
    fl = ramp("#ff8a3d")
    poly(p, [(3, 0), (6, 5), (5, 8), (1, 8), (0, 5)], fl[2])
    poly(p, [(3, 2), (5, 6), (4, 8), (2, 8), (1, 6)], ramp("#ffd166")[3])
    put(p, 3, 6, WHITE)
    outline(p)
    return p


def glint():
    p = new(9, 9)
    plus(p, 4, 4, ramp("#f3dc9a")[3], arm=3, core=WHITE)
    put(p, 4, 3, WHITE)
    put(p, 4, 5, WHITE)
    put(p, 3, 4, WHITE)
    put(p, 5, 4, WHITE)
    return p


def star():
    p = new(7, 7)
    plus(p, 3, 3, ramp("#8fe3ff")[3], arm=2, core=WHITE)
    put(p, 2, 2, ramp("#8fe3ff")[4])
    put(p, 4, 4, ramp("#8fe3ff")[2])
    outline(p)
    return p


def bubble():
    p = new(9, 9)
    b = ramp("#c4e4ff")
    D(p).ellipse([0, 0, 8, 8], outline=b[3])
    put(p, 2, 2, WHITE)
    put(p, 3, 2, WHITE)
    put(p, 2, 3, WHITE)
    put(p, 6, 6, b[1])
    return p


def export(emit, meta):
    for name, fn in (("mote", mote), ("ember", ember), ("glint", glint), ("star", star), ("bubble", bubble)):
        emit(f"pt-{name}", fn())
    meta["particles"] = ["mote", "ember", "glint", "star", "bubble"]
    meta["motions"] = {"rail": "Rail drift", "pop": "Cel pop", "orbit": "Frame orbit", "pair": "Slow pair",
                       "fountain": "Footer fountain"}
