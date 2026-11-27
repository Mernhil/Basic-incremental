/**
 * `npx tsx scripts/sim/arenaSearch.ts [--seed 1] [--write]`: the arena's combo search (DESIGN.md
 * Arena and raids: "we will have to find good combos"). For each rank band it climbs from random
 * teams of four (any fighting card the band's tier pool and cost cap allow, in any slot order) by
 * changing one card or swapping two, scoring each team by its win rate in the arena duel against a
 * fixed field of random teams of the same pool, then ranks the climbers' results by a round robin
 * among them and keeps the best few that differ in element mix and roles. `--write` puts them into
 * `src/data/content/arena.json` (archetypes and each band's list), tags included.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { loadContent, type Card } from '../../src/data';
import { cardCost, duelTeams, rivalTeam } from '../../src/game';

const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? fallback : process.argv[i + 1]!;
};
const seed = Number(arg('seed', '1'));
const write = process.argv.includes('--write');
const only = arg('band', '');
const content = loadContent();
type Band = (typeof content.arena.bands)[number];

let rngState = seed * 2654435761 + 12345;
const rnd = (): number => {
  rngState = (Math.imul(rngState, 1664525) + 1013904223) >>> 0;
  return rngState / 0x100000000;
};
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;

/** The pool of each band: tiers allowed and the loadout cost cap. */
const POOLS: Record<string, { tiers: string[]; cap: number }> = {
  b_contender: { tiers: ['gold', 'prismatic'], cap: 30 },
  b_top100: { tiers: ['prismatic', 'mythic'], cap: 40 },
  b_top50: { tiers: ['mythic'], cap: 56 },
  b_top10: { tiers: ['mythic', 'heirloom'], cap: 58 },
  b_champion: { tiers: ['mythic', 'heirloom'], cap: 64 },
};
const PER_BAND = 4;

const fighting = content.cards.filter((c) => c.job === 'fighting' && !c.shop);

type Team = string[];
const key = (t: Team): string => t.join('|');
const cost = (t: Team): number => t.reduce((a, id) => a + cardCost(content, id), 0);
const heirlooms = (t: Team): number => t.filter((id) => content.cardById.get(id)!.heirloom).length;
const legal = (t: Team, cap: number): boolean =>
  new Set(t).size === 4 && cost(t) <= cap && heirlooms(t) <= 2;

function randomTeam(pool: Card[], cap: number): Team {
  for (;;) {
    const t = [pick(pool).id, pick(pool).id, pick(pool).id, pick(pool).id];
    if (legal(t, cap)) return t;
  }
}

function mutate(t: Team, pool: Card[], cap: number): Team {
  for (let n = 0; n < 50; n++) {
    const u = [...t];
    if (rnd() < 0.3) {
      const i = Math.floor(rnd() * 4);
      const j = Math.floor(rnd() * 4);
      [u[i], u[j]] = [u[j]!, u[i]!];
    } else u[Math.floor(rnd() * 4)] = pick(pool).id;
    if (legal(u, cap) && key(u) !== key(t)) return u;
  }
  return t;
}

const cache = new Map<string, ReturnType<typeof rivalTeam>>();
function built(t: Team, band: Band): ReturnType<typeof rivalTeam> {
  const k = `${band.id}:${key(t)}`;
  let b = cache.get(k);
  if (!b) {
    b = rivalTeam(content, { id: 'x', name: 'x', tags: [], cards: t }, band);
    cache.set(k, b);
  }
  return b;
}

/** Share of two fights (each team first) that `a` wins; a tie goes to the second team. */
function wins(a: Team, b: Team, band: Band): number {
  const A = built(a, band);
  const B = built(b, band);
  const r1 = duelTeams(content, A, B).won ? 1 : 0;
  const r2 = duelTeams(content, B, A).won ? 0 : 1;
  return (r1 + r2) / 2;
}

function tagsOf(t: Team): string[] {
  const cards = t.map((id) => content.cardById.get(id)!);
  const tags: string[] = [];
  const roles = cards.map((c) => (c.job === 'fighting' ? c.role : 'dps'));
  if (roles.filter((r) => r === 'tank').length >= 2) tags.push('wall');
  if (roles.includes('support')) tags.push('healer');
  if (roles.filter((r) => r === 'dps').length >= 3) tags.push('rush');
  if (cards.some((c) => c.heirloom)) tags.push('heirloom');
  const els: Record<string, number> = {};
  for (const c of cards) if (c.element) els[c.element] = (els[c.element] ?? 0) + 1;
  const top = Object.entries(els).sort((a, b) => b[1] - a[1])[0];
  if (top && top[1] >= 3) tags.push(`mono_${top[0]}`);
  else if (Object.keys(els).length >= 3) tags.push('mixed');
  if (tags.length === 0) tags.push('plain');
  return tags;
}

const ADJ: Record<string, string> = {
  earth: 'Stonebound',
  fire: 'Ember',
  water: 'Tidal',
  light: 'Dawn',
  dark: 'Dusk',
};
function nameOf(tags: string[], used: Set<string>): string {
  const mono = tags.find((t) => t.startsWith('mono_'));
  const adj = mono ? ADJ[mono.slice(5)]! : tags.includes('mixed') ? 'Prism' : 'Plain';
  const noun = tags.includes('wall')
    ? 'Wall'
    : tags.includes('rush')
      ? 'Rush'
      : tags.includes('healer')
        ? 'Sustain'
        : 'Line';
  let n = `${adj} ${noun}`;
  for (let i = 2; used.has(n); i++) n = `${adj} ${noun} ${i}`;
  used.add(n);
  return n;
}

const found: { band: string; team: Team; tags: string[]; score: number }[] = [];
for (const band of content.arena.bands) {
  const spec = POOLS[band.id];
  if (!spec || (only && band.id !== only)) continue;
  const pool = fighting.filter((c) => spec.tiers.includes(c.tier));
  const field: Team[] = Array.from({ length: process.argv.includes('--quick') ? 14 : 24 }, () =>
    randomTeam(pool, spec.cap),
  );
  const score = (t: Team): number => field.reduce((a, f) => a + wins(t, f, band), 0) / field.length;
  const best = new Map<string, number>();
  for (let restart = 0; restart < (process.argv.includes('--quick') ? 4 : 6); restart++) {
    let cur = randomTeam(pool, spec.cap);
    let curScore = score(cur);
    for (let step = 0; step < (process.argv.includes('--quick') ? 45 : 80); step++) {
      const next = mutate(cur, pool, spec.cap);
      const s = score(next);
      if (s >= curScore) {
        cur = next;
        curScore = s;
      }
    }
    best.set(key(cur), curScore);
  }
  const finalists = [...best.keys()].map((k) => k.split('|'));
  const rr = finalists.map((a) => ({
    team: a,
    score:
      finalists.reduce((s, b) => (key(a) === key(b) ? s : s + wins(a, b, band)), 0) /
      Math.max(1, finalists.length - 1),
  }));
  rr.sort((a, b) => b.score - a.score);
  const seen = new Set<string>();
  let kept = 0;
  for (const r of rr) {
    const tags = tagsOf(r.team);
    const sig = tags.join('+');
    if (seen.has(sig) && rr.length > PER_BAND * 2) continue;
    seen.add(sig);
    found.push({ band: band.id, team: r.team, tags, score: r.score });
    if (++kept >= PER_BAND) break;
  }
  console.log(`${band.id}: ${kept} archetypes from ${finalists.length} climbers`);
}

const used = new Set<string>();
const archetypes = found.map((f, i) => ({
  id: `${f.band.replace('b_', '')}_${i}`,
  name: nameOf(f.tags, used),
  tags: f.tags,
  cards: f.team,
  band: f.band,
  score: f.score,
}));
for (const a of archetypes)
  console.log(
    `${a.band.padEnd(11)} ${a.name.padEnd(18)} [${a.tags.join(',')}] ${a.cards.join(', ')}  rr=${a.score.toFixed(2)}`,
  );
if (write) {
  const path = 'src/data/content/arena.json';
  const json = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown> & {
    archetypes: unknown[];
    bands: { id: string; archetypes: string[] }[];
  };
  json.archetypes = archetypes.map(({ id, name, tags, cards }) => ({ id, name, tags, cards }));
  for (const b of json.bands)
    b.archetypes = archetypes.filter((a) => a.band === b.id).map((a) => a.id);
  writeFileSync(path, JSON.stringify(json, null, 2) + '\n');
  console.log('written to', path);
}
