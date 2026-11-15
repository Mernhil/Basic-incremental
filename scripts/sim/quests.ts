/**
 * `npx tsx scripts/sim/quests.ts [--hours 25] [--seeds 8] [--seed 1]`: the quests' tuning run
 * (DESIGN.md §10 Quests, §14). Plays the same seeds twice, without quests (BI_SIM_NO_QUESTS=1) and
 * with them, and prints the Card Portal pulls and the Summon Scrolls quests paid by 1, 5 and 20
 * hours (medians) and each milestone's median time in both runs. One child process per seed.
 */
import { spawn } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { loadContent } from '../../src/data';
import { runSim } from './sim';

const arg = (name: string, fallback: number): number => {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? fallback : Number(process.argv[i + 1]);
};
const hours = arg('hours', 25);
const seeds = Math.floor(arg('seeds', 8));
const firstSeed = arg('seed', 1);
const MARKS = [1, 5, 20].filter((h) => h <= hours);

interface Out {
  pulls: number[];
  quest: number[];
  questGlamour: number[];
  hits: Record<string, number | null>;
  /** Quests claimed in the first two hours: [minute, id, Summon Scrolls]. */
  early: Array<[number, string, number]>;
}

if (process.argv.includes('--worker')) {
  const seed = arg('seed', 1);
  const content = loadContent();
  const r = runSim(content, { hours, seed, stepSeconds: 5, profile: 'active' });
  const claims = r.log.questClaims ?? [];
  const sum = (h: number, k: 1 | 2): number =>
    claims.filter((c) => c[0] <= h * 3600).reduce((n, c) => n + c[k], 0);
  const pullsAt = (h: number): number => {
    const s = [...r.pullSamples].filter((p) => p[0] <= h * 3600).pop();
    return s ? s[1] : 0;
  };
  const out: Out = {
    pulls: MARKS.map(pullsAt),
    quest: MARKS.map((h) => sum(h, 1)),
    questGlamour: MARKS.map((h) => sum(h, 2)),
    hits: r.hits,
    early: claims
      .filter((c) => c[0] <= 2 * 3600)
      .map((c): [number, string, number] => [Math.round(c[0] / 60), c[3], c[1]]),
  };
  console.log(JSON.stringify(out));
} else {
  void main();
}

async function main(): Promise<void> {
  const run = (seed: number, noQuests: boolean): Promise<Out> =>
    new Promise((resolve, reject) => {
      const args = [
        ...process.execArgv,
        process.argv[1]!,
        '--worker',
        '--seed',
        String(seed),
        '--hours',
        String(hours),
      ];
      const env = { ...process.env, ...(noQuests ? { BI_SIM_NO_QUESTS: '1' } : {}) };
      const child = spawn(process.execPath, args, { env, stdio: ['ignore', 'pipe', 'inherit'] });
      let out = '';
      child.stdout.on('data', (d: Buffer) => (out += d.toString()));
      child.on('error', reject);
      child.on('close', (code) =>
        code === 0
          ? resolve(JSON.parse(out.trim().split('\n').pop() ?? '') as Out)
          : reject(new Error(`seed ${seed} exited with ${code}`)),
      );
    });
  const jobs: Array<() => Promise<{ noQuests: boolean; out: Out }>> = [];
  for (let s = 0; s < seeds; s++) {
    for (const noQuests of [true, false]) {
      jobs.push(async () => ({ noQuests, out: await run(firstSeed + s, noQuests) }));
    }
  }
  const results: Array<{ noQuests: boolean; out: Out }> = new Array(jobs.length);
  let next = 0;
  const limit = Math.max(1, availableParallelism() - 1);
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (next < jobs.length) {
        const i = next++;
        results[i] = await jobs[i]!();
      }
    }),
  );
  const median = (list: number[]): number => {
    const s = [...list].sort((a, b) => a - b);
    return s.length === 0 ? NaN : s[Math.floor((s.length - 1) / 2)]!;
  };
  const base = results.filter((r) => r.noQuests).map((r) => r.out);
  const withQ = results.filter((r) => !r.noQuests).map((r) => r.out);
  console.log(`seeds ${seeds}, ${hours} h, active profile (medians)`);
  MARKS.forEach((h, i) => {
    console.log(
      `${h} h: pulls ${median(base.map((o) => o.pulls[i]!)).toFixed(0)} -> ${median(withQ.map((o) => o.pulls[i]!)).toFixed(0)}; ` +
        `quests paid ${median(withQ.map((o) => o.quest[i]!)).toFixed(1)} Summon, ${median(withQ.map((o) => o.questGlamour[i]!)).toFixed(1)} Glamour Scrolls`,
    );
  });
  if (process.argv.includes('--early')) {
    console.log('seed 1, claims in the first 2 h (minute id scrolls):');
    console.log(withQ[0]?.early.map((e) => e.join(' ')).join(String.fromCharCode(10)));
  }
  const ids = Object.keys(withQ[0]?.hits ?? {});
  const fmt = (v: number): string => (Number.isFinite(v) ? `${(v / 3600).toFixed(2)} h` : 'never');
  console.log('milestone | without quests | with quests');
  for (const id of ids) {
    const pick = (list: Out[]): number => {
      const hit = list.map((o) => o.hits[id]).filter((v): v is number => typeof v === 'number');
      return hit.length * 2 > list.length ? median(hit) : NaN;
    };
    console.log(`${id} | ${fmt(pick(base))} | ${fmt(pick(withQ))}`);
  }
}
