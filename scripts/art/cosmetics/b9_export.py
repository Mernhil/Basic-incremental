"""B9 corner flourishes, redrawn in pixel art (DESIGN 7: corners are pixel art like the frames).

Five shapes, each one 28 x 28 piece drawn for the top-left corner with the card corner at (9, 9):
at most 9 px (about 7% of the 132 px card) outside the edge and 19 px along it (the outer fifth).
The piece is mirrored to the four corners on the frame grid; the rank footer band stays clear and
the tier frame is drawn on top of it (the flourish tucks behind the tier ornaments)."""
import math

import card as K
from b2_verdant import leaf
from px import *  # noqa: F403

GOLD = ramp("#e8c057")
RUBY = ramp("#d9404f")
SHAPES = {
    "acanthus": "Acanthus scroll",
    "pauldron": "Pauldron plate",
    "wings": "Wing tips",
    "shards": "Gem shards",
    "knot": "Knot and cabochon",
}
O = 9  # card corner inside the piece


def rails(g, length=26, col=GOLD):
    R = new(28, 28)
    rect(R, O + 2, O, O + length - 8, O + 1, col[2])
    rect(R, O, O + 2, O + 1, O + length - 8, col[2])
    rect(R, O + 2, O, O + length - 8, O, col[4])
    rect(R, O, O + 2, O, O + length - 8, col[3])
    part(g, R, do_bevel=False)


def piece(shape):
    g = new(28, 28)
    if shape == "acanthus":
        rails(g)
        S = new(28, 28)
        # scroll curls at the rail ends
        for cx, cy in ((O + 17, O - 3), (O - 3, O + 17)):
            D(S).arc([cx - 3, cy - 3, cx + 3, cy + 3], 0, 300, fill=GOLD[2], width=2)
        part(g, S, do_bevel=False)
        L = new(28, 28)
        leaf(L, (O + 4, O + 4), (1, 1), 3.4, GOLD)
        part(g, L, do_bevel=False)
        put(g, 4, 3, WHITE)
    elif shape == "pauldron":
        P = new(28, 28)
        poly(P, [(O - 4, O - 1), (O - 1, O - 4), (O + 18, O - 4), (O + 14, O + 4), (O + 4, O + 4)], GOLD[3])
        rect(P, O - 1, O - 4, O + 17, O - 4, GOLD[4])
        part(g, P, do_bevel=False)
        P2 = new(28, 28)
        poly(P2, [(O - 4, O - 1), (O - 4, O + 18), (O + 4, O + 14), (O + 4, O + 4)], GOLD[2])
        part(g, P2, do_bevel=False)
        for x, y in ((O + 11, O), (O, O + 11)):
            rect(g, x, y, x + 1, y + 1, WHITE)
            put(g, x + 1, y + 1, GOLD[1])
        G = new(28, 28)
        facet_gem(G, [(O, O - 4), (O + 4, O), (O, O + 4), (O - 4, O)], RUBY, O, O, table=0)
        part(g, G, do_bevel=False)
    elif shape == "wings":
        rails(g)
        for base, tip, w, rp in (((O + 6, O + 2), (O - 1, O - 9), 2.6, GOLD), ((O + 2, O + 6), (O - 9, O - 1), 2.6, GOLD),
                                 ((O + 5, O + 5), (O - 8, O - 8), 3.2, ramp("#fff2c4"))):
            F = new(28, 28)
            leaf(F, base, tip, w, rp, rib=True)
            part(g, F, do_bevel=False)
    elif shape == "shards":
        R = new(28, 28)
        D(R).arc([O + 1, O + 1, O + 21, O + 21], 180, 270, fill=GOLD[2], width=2)
        part(g, R, do_bevel=False)
        for pts in ([(O + 1, O - 9), (O + 9, O - 1), (O + 6, O + 3), (O + 3, O + 2)],
                    [(O - 9, O + 1), (O - 1, O + 9), (O + 3, O + 6), (O + 2, O + 3)],
                    [(O - 8, O - 8), (O + 6, O + 1), (O + 4, O + 4), (O + 1, O + 6)]):
            Sh = new(28, 28)
            facet_gem(Sh, pts, RUBY, table=0)
            part(g, Sh, do_bevel=False)
    elif shape == "knot":
        rails(g)
        K_ = new(28, 28)
        D(K_).ellipse([O - 7, O - 7, O + 5, O + 5], outline=GOLD[2], width=2)
        part(g, K_, do_bevel=False)
        G = new(28, 28)
        ell(G, O - 4, O - 4, O + 2, O + 2, RUBY[2])
        ell(G, O - 4, O - 4, O, O, RUBY[3])
        part(g, G, do_bevel=False)
        put(g, O - 3, O - 3, WHITE)
    return g


def layer(shape):
    lay = K.place_corners(piece(shape), origin=(O, O))
    outline(lay)
    return K.protect(lay)


def export(emit, meta):
    for s in SHAPES:
        emit(f"corner-{s}", layer(s))
    meta["corners"] = list(SHAPES)
