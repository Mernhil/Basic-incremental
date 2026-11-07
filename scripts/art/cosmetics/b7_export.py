"""B7 skill nodes: five gem-node styles for the account tree (six branch colours, locked / open /
owned, normal 24 px and keystone 32 px) and the card enhancement star chart (18 px chart stars,
24 px major stars and the night-sky panel)."""
from b5_b7_misc import B7, node
from px import *  # noqa: F403

BRANCHES = {
    "logging": "#4caf3a",
    "mining": "#e07a32",
    "combat": "#e0303a",
    "luck": "#9b5cff",
    "collection": "#f2c230",
    "automation": "#33c3e0",
}
STATES = ["locked", "open", "owned"]
STYLE_IDS = dict(zip("abcde", "ABCDE"))
CHART = "#b48cff"


def sky(seed=9, w=200, h=120):
    img = new(w, h)
    rect(img, 0, 0, w - 1, h - 1, H("#120f22"))
    rr = rng(seed)
    for _ in range(46):
        x, y = rr.randint(1, w - 2), rr.randint(1, h - 2)
        put(img, x, y, H("#3a3560") if rr.random() < 0.8 else H("#6a64a0"))
    for _ in range(4):
        plus(img, rr.randint(4, w - 5), rr.randint(4, h - 5), H("#4a4478"), core=H("#8a84c0"))
    return img


def export(emit, meta):
    for sid, opt in STYLE_IDS.items():
        for br, col in BRANCHES.items():
            for k, st in enumerate(STATES):
                emit(f"node-{sid}-{br}-{st}", node(opt, col, k, 24))
                emit(f"key-{sid}-{br}-{st}", node(opt, col, k, 32))
        for k, st in enumerate(STATES):
            emit(f"chart-{sid}-{st}", node(opt, CHART, k, 18))
            emit(f"chartmajor-{sid}-{st}", node(opt, CHART, k, 24))
        emit(f"chartsky-{sid}", sky(), sweep=False)
    meta["nodes"] = dict(styles={k: B7[v]["name"] for k, v in STYLE_IDS.items()}, branches=list(BRANCHES),
                         states=STATES, size=24, keystone=32, chart=dict(size=18, major=24, sky=[200, 120],
                                                                         line="#4a4470", lit=hx(ramp(CHART)[3])))
    meta["skins"]["nodes"] = list(STYLE_IDS)


def hx(c):
    return "#%02x%02x%02x" % c[:3]
