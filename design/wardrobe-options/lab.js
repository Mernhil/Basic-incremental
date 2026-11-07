// Options lab for review round B8-B10 (not part of the app). Served by the renderer dev server
// and driven by build.mjs: it renders the REAL card renderer and the REAL Wardrobe page with the
// shipped CSS, then options.css layers each option on top, scoped by data-b8 / data-b9 / data-b10.
import { loadContent } from '../../src/data/index.ts';
import * as g from '../../src/game/index.ts';
import {
  applyGlobalTheme,
  assertVisualsImplemented,
  configureCardLevels,
} from '../../src/renderer/src/theme/apply.ts';
import { installArtDefs } from '../../src/renderer/src/art/defs.ts';
import { createCard } from '../../src/renderer/src/ui/card.ts';
import { cardFaceProps } from '../../src/renderer/src/pages/loadoutCards.ts';
import { createWardrobePage } from '../../src/renderer/src/pages/wardrobe.ts';
import '../../src/renderer/src/shell/shell.css';
import '../../src/renderer/src/style.css';
import '../../src/renderer/src/pages/cards.css';
import './lab.css';
import './options.css';

const content = loadContent();
assertVisualsImplemented(content);
configureCardLevels(content);

// ---- demo state (same as scripts/shoot-wardrobe.mjs) -------------------------------------------
function demoState(levels) {
  let s = g.createInitialState(content);
  const own = (id, tier, stars) => {
    s.cards.owned[id] = { ...g.newOwnedCard(), tier, stars, level: 40 };
  };
  own('dawnblade_regent', 'prismatic', 6);
  own('storm_duelist', 'gold', 6);
  own('ember_squire', 'prismatic', 3);
  s.cards.loadouts.fighting.main = 'dawnblade_regent';
  for (const id of [
    'gilded_filigree',
    'aurora_veil',
    'holo_hex',
    'holo_hex',
    'holo_hex',
    'gilded_plate',
    'ember_crown',
    'gt_border',
    'gt_finish',
    'gt_table',
    'gt_number',
    'prism_pointer',
  ])
    g.grantCosmetic(s, id);
  for (const [id, lv] of Object.entries(levels)) s.cosmetics.owned[id].level = lv;
  s.resources['glimmer_dust'] = new g.Decimal(5000);
  s.resources['facet_shard'] = new g.Decimal(1200);
  s.resources['ember_sigil'] = new g.Decimal(240);
  const eq = (id, card) => {
    const r = g.equipCosmetic(s, content, id, card);
    if (r.ok) s = r.state;
  };
  eq('gilded_filigree');
  eq('aurora_veil', 'dawnblade_regent');
  eq('ember_crown', 'dawnblade_regent');
  return s;
}
const max = (id) => g.cosmeticMaxLevel(content, content.cosmeticById.get(id));
const state = demoState({
  gilded_filigree: max('gilded_filigree'),
  aurora_veil: max('aurora_veil'),
  ember_crown: max('ember_crown'),
});
applyGlobalTheme(content, state.cosmetics.loadout);
installArtDefs();

// ---- helpers --------------------------------------------------------------------------------------
const h = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};
const AMB = {
  gilded_filigree: 'motes',
  gilded_plate: 'motes',
  ember_crown: 'embers',
  gt_border: 'glints',
  aurora_veil: 'stars',
  holo_hex: 'bubbles',
  holo_waves: 'bubbles',
  gt_finish: 'glints',
};

/** A real card wearing the given border and finish at their max level. */
function card(id, rank, border, finish, scale = 1) {
  let loadout = g.emptyLoadout();
  const on = (cid) => (content.cosmeticById.get(cid).exclusiveCard ? id : undefined);
  if (border)
    loadout = g.equip(content, loadout, 'border', { id: border, level: max(border) }, on(border));
  if (finish)
    loadout = g.equip(content, loadout, 'finish', { id: finish, level: max(finish) }, on(finish));
  const face = cardFaceProps(content, state, id);
  const def = content.cardById.get(id);
  const view = createCard({
    ...face,
    rank,
    theme: g.resolveCard(content, loadout, { id, rank, rarity: def.rarity }),
  });
  if (border) view.el.dataset.ambB = AMB[border];
  if (finish) view.el.dataset.ambF = AMB[finish];
  const fit = h('div', 'lab-card');
  fit.style.setProperty('--s', String(scale));
  fit.append(view.el);
  return fit;
}

function batchTitle(code, text) {
  const t = h('h2', 'lab-batch__title');
  t.append(h('span', 'lab-batch__code', code), h('span', '', text));
  return t;
}

function figure(node, caption) {
  const f = h('figure', 'lab-fig');
  f.append(node, h('figcaption', '', caption));
  return f;
}

function optionRow(batch, opt, title, lines, cards) {
  const row = h('div', `lab-row${opt === 'ref' ? ' lab-row--ref' : ''}`);
  row.dataset[batch] = opt;
  const label = h('div', 'lab-label');
  const letter = h('span', 'lab-letter', opt === 'ref' ? 'Now' : opt.toUpperCase());
  const text = h('div', 'lab-label__text');
  text.append(h('h3', 'lab-name', title));
  for (const l of lines) text.append(h('p', 'lab-line', l));
  label.append(letter, text);
  const strip = h('div', 'lab-strip');
  for (const c of cards(opt)) strip.append(c);
  row.append(label, strip);
  return row;
}

// ---- page ------------------------------------------------------------------------------------------
const root = document.getElementById('app');
root.replaceChildren();
const page = h('main', 'lab');
root.append(page);

const head = h('header', 'lab-head');
head.append(
  h('h1', 'lab-title', 'Wardrobe visuals, round B8 to B10'),
  h(
    'p',
    'lab-lead',
    'The Wardrobe screen shipped these three visuals without an options round. Each row below is the real card renderer or the real Wardrobe page with the game CSS; animations run live. Pick one letter per batch. The row marked Now is what is in the game today and is not an option.',
  ),
);
const still = h('button', 'lab-toggle', 'Show still frames (reduced motion)');
still.type = 'button';
still.setAttribute('aria-pressed', 'false');
head.append(still);
page.append(head);

// B8 -------------------------------------------------------------------------------------------------
const b8 = h('section', 'lab-batch');
b8.id = 'b8';
b8.append(
  batchTitle('B8', 'Max-level ambient particles'),
  h(
    'p',
    'lab-batch__rule',
    'Themes: gilt motes, embers, glints (borders); stars, bubbles, glints (finishes). CSS only, transform and opacity, at most 6 particles per card, nothing over the rank footer, a still frame under reduced motion.',
  ),
);
const P = { tier: 'prismatic', stars: 3 };
// particle zone in card px: x = 10.5 + 155 * x%, y = 15 + 198 * y%
const zx = (p) => 10.5 + 1.55 * p;
const zy = (p) => 15 + 1.98 * p;
const up = (x, y, len, cls) =>
  `<path class="${cls}" d="M${x} ${y}V${y - len}" marker-end="url(#mk-${cls})"/><circle class="${cls}-dot" cx="${x}" cy="${y}" r="4"/>`;
const tw = (x, y, cls) =>
  `<path class="${cls}-tw" d="M${x} ${y - 7}L${x + 2} ${y - 2}L${x + 7} ${y}L${x + 2} ${y + 2}L${x} ${y + 7}L${x - 2} ${y + 2}L${x - 7} ${y}L${x - 2} ${y - 2}Z"/>`;
const PATHS = {
  ref: [
    up(zx(22), zy(88), 110, 'pb'),
    up(zx(58), zy(94), 110, 'pb'),
    up(zx(82), zy(84), 110, 'pb'),
    tw(zx(34), zy(30), 'pf'),
    tw(zx(72), zy(46), 'pf'),
    tw(zx(18), zy(62), 'pf'),
  ],
  a: [
    up(zx(2), zy(98), 170, 'pb'),
    up(zx(98), zy(98), 170, 'pb'),
    tw(zx(98), zy(18), 'pf'),
    tw(zx(2), zy(46), 'pf'),
    tw(zx(98), zy(72), 'pf'),
  ],
  b: [
    up(zx(14), zy(26), 18, 'pb'),
    up(zx(88), zy(36), 18, 'pb'),
    up(zx(22), zy(60), 18, 'pb'),
    up(zx(72), zy(16), 18, 'pf'),
    up(zx(10), zy(44), 18, 'pf'),
    up(zx(84), zy(62), 18, 'pf'),
  ],
  c: [
    `<path class="pb" d="M${zx(0)} ${zy(0)}H${zx(100)}V${zy(100)}H${zx(0)}Z" marker-mid="url(#mk-pb)"/>`,
    `<path class="pf" d="M${zx(4)} ${zy(14)}V${zy(14) + 100}H${zx(4) + 140}V${zy(14)}Z" marker-mid="url(#mk-pf)"/>`,
    `<circle class="pb-dot" cx="${zx(0)}" cy="${zy(0)}" r="4"/><circle class="pb-dot" cx="${zx(100)}" cy="${zy(60)}" r="4"/><circle class="pb-dot" cx="${zx(30)}" cy="${zy(100)}" r="4"/>`,
  ],
  d: [
    up(zx(14), zy(22), 14, 'pb'),
    up(zx(86), zy(72), 14, 'pb'),
    up(zx(82), zy(16), 14, 'pf'),
    up(zx(20), zy(64), 14, 'pf'),
  ],
  e: [
    `<path class="pb" d="M${zx(48)} ${zy(100)}Q${zx(30)} ${zy(30)} ${zx(10)} ${zy(60)}" marker-end="url(#mk-pb)"/>`,
    `<path class="pb" d="M${zx(50)} ${zy(100)}Q${zx(52)} ${zy(0)} ${zx(54)} ${zy(30)}" marker-end="url(#mk-pb)"/>`,
    `<path class="pb" d="M${zx(52)} ${zy(100)}Q${zx(72)} ${zy(30)} ${zx(92)} ${zy(60)}" marker-end="url(#mk-pb)"/>`,
    `<circle class="pb-dot" cx="${zx(50)}" cy="${zy(100)}" r="4"/>`,
    tw(zx(16), zy(86), 'pf'),
    tw(zx(50), zy(74), 'pf'),
    tw(zx(84), zy(86), 'pf'),
  ],
};
function pathCard(opt) {
  const s = 0.8;
  const wrap = h('div', 'lab-path');
  wrap.innerHTML = `<svg viewBox="-14 -14 204 276" width="${204 * s}" height="${276 * s}" role="img" aria-label="Particle paths">
    <defs>
      <marker id="mk-pb" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" class="pb-head"/></marker>
      <marker id="mk-pf" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" class="pf-head"/></marker>
      <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="3" height="6" class="hatch"/></pattern>
    </defs>
    <rect x="0" y="0" width="176" height="248" rx="10" class="card"/>
    <rect x="14" y="44" width="148" height="104" rx="6" class="art"/>
    <rect x="6" y="215" width="164" height="27" rx="4" fill="url(#hatch)" class="foot"/>
    <text x="88" y="233" class="foot-t">footer kept clear</text>
    ${PATHS[opt].join('')}
  </svg>`;
  return wrap;
}
const b8Cards = (opt) => [
  figure(card('ember_squire', P, 'gilded_filigree', 'aurora_veil', 1.12), 'Filigree + Aurora Veil: motes, stars'),
  figure(card('dawnblade_regent', P, 'ember_crown', 'holo_hex', 1.12), 'Ember Crown + Hex: embers, bubbles'),
  figure(card('storm_duelist', P, 'gt_border', 'gt_finish', 1.12), 'Gilded Frame + Diamond: glints, glints'),
  figure(pathCard(opt), 'Paths: gold border, blue finish'),
];
const B8 = [
  ['ref', 'Shipped: drift up', ['3 + 3 particles, rise from the lower art window or flash in place', 'Soft round glow shapes, 2.6 to 4.2 s']],
  ['a', 'Rail drift', ['3 + 3, travel up the inner frame rails, never across the item art', 'Small soft shapes, slow (6 s), gentle sway']],
  ['b', 'Cel pop', ['3 + 3, pop in with a bounce around the item, hop, pop out', 'Bigger cel-shaded shapes with a dark ink edge, 3 s']],
  ['c', 'Frame orbit', ['3 + 3, border particles circle the frame, finish particles circle the art window the other way', 'Tiny bright points, steady 9 s loop']],
  ['d', 'Slow pair', ['2 + 2 (4 per card), appear, drift a few pixels, fade', 'Large soft shapes, very slow (8 s), calmest']],
  ['e', 'Footer fountain', ['3 + 3, spring up from just above the rank footer and arc outward', 'Small sharp shapes, quick (2.4 s), staggered, liveliest']],
];
for (const [opt, title, lines] of B8) b8.append(optionRow('b8', opt, title, lines, b8Cards));
page.append(b8);

// B9 -------------------------------------------------------------------------------------------------
const b9 = h('section', 'lab-batch');
b9.id = 'b9';
b9.append(
  batchTitle('B9', 'Max-level corner flourishes'),
  h(
    'p',
    'lab-batch__rule',
    'Corners only, at most about 8% of the card width outside the edge (12 px of 176), tier spikes and wings on top, the star footer never covered. Shown at the Wardrobe size on Gold ★6 and Prismatic ★6.',
  ),
);
/** A real card at 3x, cropped to one corner. */
function zoom(id, rank, border, corner) {
  const z = h('div', `lab-zoom lab-zoom--${corner}`);
  z.append(card(id, rank, border, null, 3));
  return z;
}
const G6 = { tier: 'gold', stars: 6 };
const P6 = { tier: 'prismatic', stars: 6 };
const b9Cards = () => [
  figure(card('storm_duelist', G6, 'gilded_filigree', null, 1.24), 'Gilded Filigree, Gold ★6'),
  figure(card('dawnblade_regent', P6, 'gt_border', null, 1.24), 'Gilded Frame, Prismatic ★6'),
  figure(zoom('storm_duelist', G6, 'gilded_filigree', 'tl'), 'Top corner at 3x: tier spike on top'),
  figure(zoom('storm_duelist', G6, 'gilded_filigree', 'bl'), 'Bottom corner at 3x: stars clear'),
];
const B9 = [
  ['ref', 'Shipped: curled bracket', ['Rounded L bracket with an outer curl and a small red gem', 'Line art, 34 px piece']],
  ['a', 'Acanthus scroll', ['A gilt scroll curls out of each corner and back on itself', 'Rounded, ornate, no gem']],
  ['b', 'Pauldron plate', ['A faceted armour plate wraps the corner, two rivets and a centre stud', 'Angular, heavy, matches the Knight plate']],
  ['c', 'Wing tips', ['Three gilt feathers fan out diagonally from the corner', 'Light and airy, points outward']],
  ['d', 'Gem shards', ['Three faceted crystals jut out of the corner in the accent colour', 'Sharp, colourful, reads as treasure']],
  ['e', 'Knot and cabochon', ['A round gem sits on the corner, held by an interlaced gilt loop', 'Jewellery, the gem is the focal point']],
];
for (const [opt, title, lines] of B9) b9.append(optionRow('b9', opt, title, lines, b9Cards));
page.append(b9);

// B10 ------------------------------------------------------------------------------------------------
const b10 = h('section', 'lab-batch');
b10.id = 'b10';
b10.append(
  batchTitle('B10', 'Wardrobe chrome'),
  h(
    'p',
    'lab-batch__rule',
    'Slot plates around the mannequin, the item tiles and the level ladder, restyled together. Switch between styles; the page below is the real Wardrobe page (buttons are inert in this preview).',
  ),
);
const B10 = [
  ['ref', 'Now', 'Shipped: dark rounded plates with a rarity stripe on the inner edge, tiles with a rarity underline, round level beads on a line.'],
  ['a', 'Sockets', 'Each slot is a plate with the swatch set into a gilt socket ring; tiles are socketed frames; the ladder is a row of gem sockets that fill as levels unlock.'],
  ['b', 'Gilt plaques', 'Bevelled gold-edged plaques like the card name plate; tiles are framed portraits with a nameplate; the ladder is a row of struck coins.'],
  ['c', 'Quiet ink', 'No fills: hairline outlines, rarity as a small dot, more items per row; the ladder is a segmented bar with the step names under it.'],
  ['d', 'Banners', 'Slots are banners whose point aims at the card; tiles carry a rarity ribbon on the corner; the ladder is a row of chevron steps.'],
  ['e', 'Rarity glass', 'Panels tinted by rarity with a soft inner glow; tiles glow in their rarity; the ladder is a staircase of rising bars.'],
];
const tabs = h('div', 'lab-tabs');
tabs.setAttribute('role', 'tablist');
tabs.setAttribute('aria-label', 'B10 styles');
const note = h('p', 'lab-tabnote');
const stage = h('div', 'lab-wd');
stage.dataset.b10 = 'a';
for (const [opt, name, text] of B10) {
  const t = h('button', 'lab-tab');
  t.type = 'button';
  t.setAttribute('role', 'tab');
  t.dataset.opt = opt;
  t.dataset.note = text;
  t.append(h('b', '', opt === 'ref' ? 'Now' : opt.toUpperCase()), h('span', '', opt === 'ref' ? 'shipped' : name));
  tabs.append(t);
}
b10.append(tabs, note, stage);
page.append(b10);

// mount the real Wardrobe page with a partly upgraded item selected so the ladder shows all states
let wdState = demoState({
  gilded_filigree: max('gilded_filigree'),
  aurora_veil: 2,
  ember_crown: max('ember_crown'),
});
const wdPage = h('div', 'lab-wd__page');
stage.append(wdPage);
const wd = createWardrobePage(wdPage, {
  content,
  state: () => wdState,
  apply: (n) => {
    wdState = n;
  },
});
wd.render();
wdPage.querySelector('[data-key="tile-aurora_veil"]')?.click();

const foot = h('footer', 'lab-foot');
foot.append(
  h('p', 'lab-foot__ask', 'Reply like: B8 C, B9 A, B10 D'),
  h('p', 'lab-foot__small', 'Drafts live on the branch ui/wardrobe-options (design/wardrobe-options). Nothing here is merged.'),
);
page.append(foot);

window.__labReady = true;
