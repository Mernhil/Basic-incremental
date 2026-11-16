import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CURRENT_SAVE_VERSION,
  MIGRATIONS,
  collectModifiers,
  createSaveText,
  readSave,
  skillModifiers,
  skillPoints,
} from '../src/game';
import { content } from './helpers';

const fixture = readFileSync(
  join(__dirname, 'fixtures', 'saves', 'v37-skill-ranks.save.txt'),
  'utf8',
);
const raw = JSON.parse(fixture) as { version: number; state: { account: Record<string, unknown> } };

describe('v37 -> v38 (the skill web)', () => {
  it('is format 38 or later', () => {
    expect(CURRENT_SAVE_VERSION).toBeGreaterThanOrEqual(38);
  });

  it('carries the old ranks of a real format 37 save into the web, and drops the old branch ranks', () => {
    expect(raw.version).toBe(37);
    const oldSkills = raw.state.account['skills'] as Record<string, number>;
    expect(Object.keys(oldSkills).length).toBeGreaterThan(3);
    const { state } = readSave(fixture, content);
    const web = state.account.web;
    // Sharp Saws took over Grove Yield and Old Growth: three of Logging's four small ranks became levels
    expect(web['lg_saws']).toBeGreaterThan(0);
    // light ranks in a skill that became one of ten levels round down: they come back as free points
    // every carried node hangs off a node with a level
    for (const id of Object.keys(web)) {
      const node = content.webNodeById.get(id)!;
      expect(node.parent === null || (web[node.parent] ?? 0) > 0).toBe(true);
      expect(web[id]).toBeLessThanOrEqual(node.maxLevel);
    }
    // no old branch rank is left, and the points are not overspent
    expect(Object.keys(state.account.skills)).toEqual([]);
    const points = skillPoints(state, content);
    expect(points.spent).toBeLessThanOrEqual(points.total);
    // what the old ranks cost is close to what the carried levels cost
    const oldCost = Object.entries(oldSkills).reduce(
      (a, [id, rank]) => a + rank * (content.account.tree.find((n) => n.id === id)?.cost ?? 0),
      0,
    );
    // never more than they paid; what rounded away is free to spend again
    expect(points.spent).toBeLessThanOrEqual(oldCost);
    expect(points.available).toBeGreaterThan(0);
  });

  it('a fully bought old tree becomes a fully bought web with the same power', () => {
    const skills: Record<string, number> = {};
    for (const n of content.account.tree) if (!n.circle) skills[n.id] = n.maxRank;
    const out = MIGRATIONS[37]!({ account: { skills: { ...skills }, level: 1 } }) as {
      account: { skills: Record<string, number>; web: Record<string, number> };
    };
    expect(out.account.skills).toEqual({});
    for (const n of content.web.nodes) expect(out.account.web[n.id]).toBe(n.maxLevel);
    // power: the stats no node shares between two arms add up to the same total
    const oldMods = content.account.tree
      .filter((n) => !n.circle)
      .flatMap((n) => skillModifiers(n, n.maxRank));
    const newMods = content.web.nodes.flatMap((n) =>
      n.perLevel.map((m) => ({
        ...m,
        value: m.value.mul(['percent', 'flat'].includes(m.kind) ? n.maxLevel : 1),
      })),
    );
    const total = (
      mods: { stat: string; kind: string; value: { toNumber(): number }; scope?: unknown }[],
      stat: string,
    ) =>
      mods
        .filter((m) => m.stat === stat && ['percent', 'flat'].includes(m.kind))
        .reduce((a, m) => a + m.value.toNumber(), 0);
    for (const stat of [
      'combat.damage',
      'combat.health',
      'xp.card',
      'stars.damage',
      'drops.rareChance',
      'element.bonus',
      'forge.speed',
    ]) {
      expect(total(newMods, stat), stat).toBeCloseTo(total(oldMods, stat), 3);
    }
  });

  it('round-trips a migrated save and keeps the web in a new save', () => {
    const { state } = readSave(fixture, content);
    const again = readSave(createSaveText(state, Date.now()), content).state;
    expect(again.account.web).toEqual(state.account.web);
    // the web's modifiers reach the game
    const mods = collectModifiers(again, content);
    expect(mods.some((m) => m.source.kind === 'skill' && m.source.id === 'lg_saws')).toBe(true);
  });
});

describe('v37 -> v38 with a half-bought old tree', () => {
  it('carries about half of every node and never charges more than the old ranks cost', () => {
    const skills: Record<string, number> = {};
    for (const n of content.account.tree) {
      if (!n.circle) skills[n.id] = Math.floor(n.maxRank / 2);
    }
    const oldCost = Object.entries(skills).reduce(
      (a, [id, r]) => a + r * (content.account.tree.find((n) => n.id === id)?.cost ?? 0),
      0,
    );
    const out = MIGRATIONS[37]!({ account: { skills, level: 60 } }) as {
      account: { web: Record<string, number> };
    };
    const saws = out.account.web['lg_saws'] ?? 0;
    expect(saws).toBeGreaterThanOrEqual(3);
    expect(saws).toBeLessThanOrEqual(6);
    let spent = 0;
    for (const n of content.web.nodes) {
      for (let l = 0; l < (out.account.web[n.id] ?? 0); l++)
        spent += n.cost.base ? Number(n.cost.base) : 0;
    }
    expect(spent).toBeLessThanOrEqual(oldCost + 20);
  });
});
