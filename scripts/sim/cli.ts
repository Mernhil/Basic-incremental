/**
 * `npm run sim -- [--hours 40] [--seeds 5] [--seed 1] [--step 5] [--late-step 15] [--profile both]
 *  [--strict]`:
 * runs the balance sim for several seeds (one child process each, as many at once as the machine
 * has cores) and prints, per DESIGN.md §14 milestone, the target, the median sim time, the spread
 * (min-max), the worst seed, how many runs reached it and the band check (median within 25% of
 * the target, worst seed within 2x), with the idle profile's median and worst seed beside the
 * active one. Then the end state of the median seed's run, its run milestones and the Ascension
 * guard. `--profile active` or `--profile idle` runs one profile only. A balance PR runs
 * `--seeds 20`. `--strict` exits with 1 when a band check fails.
 */
import { spawn } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { loadContent } from '../../src/data';
import {
  bandsPass,
  formatGuard,
  LATE_STEP_SECONDS,
  formatProgress,
  formatRunTable,
  formatSeedTable,
  formatSummary,
  formatTable,
  runSim,
  summarizeRuns,
  type SimProfile,
  type SimResult,
} from './sim';

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const value = Number(process.argv[i + 1]);
  if (!Number.isFinite(value) || value <= 0) {
    console.error(`--${name} needs a positive number`);
    process.exit(1);
  }
  return value;
}

function profileArg(): SimProfile | 'both' {
  const i = process.argv.indexOf('--profile');
  const value = i < 0 ? 'both' : process.argv[i + 1];
  if (value !== 'active' && value !== 'idle' && value !== 'both') {
    console.error('--profile needs active, idle or both');
    process.exit(1);
  }
  return value;
}

const hours = arg('hours', 40);
const seeds = Math.floor(arg('seeds', 5));
const firstSeed = arg('seed', 1);
const step = arg('step', 5);
const lateStep = arg('late-step', Math.max(step, LATE_STEP_SECONDS));
const profile = profileArg();
const strict = process.argv.includes('--strict');
const worker = process.argv.includes('--worker');

interface WorkerOutput {
  seed: number;
  hits: SimResult['hits'];
  dps: SimResult['dpsSamples'];
  pulls: SimResult['pullSamples'];
  runs: SimResult['runs'];
  progress: SimResult['progress'];
  maxedWeaponAt: SimResult['maxedWeaponAt'];
  simSeconds: number;
  summary: string;
}

function runOne(seed: number, as: SimProfile): WorkerOutput {
  const content = loadContent();
  const result = runSim(content, {
    hours,
    seed,
    stepSeconds: step,
    lateStepSeconds: lateStep,
    profile: as,
  });
  return {
    seed,
    hits: result.hits,
    dps: result.dpsSamples,
    pulls: result.pullSamples,
    runs: result.runs,
    progress: result.progress,
    maxedWeaponAt: result.maxedWeaponAt,
    simSeconds: result.simSeconds,
    summary: `${formatTable(result)}\n\n${formatSummary(result, content)}`,
  };
}

/** Runs one seed in a child process (same loader flags) and reads its JSON line. */
function runChild(seed: number, as: SimProfile): Promise<WorkerOutput> {
  return new Promise((resolve, reject) => {
    const args = [
      ...process.execArgv,
      process.argv[1]!,
      '--worker',
      '--seed',
      String(seed),
      '--hours',
      String(hours),
      '--step',
      String(step),
      '--late-step',
      String(lateStep),
      '--profile',
      as,
    ];
    const child = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'inherit'] });
    let out = '';
    child.stdout.on('data', (d: Buffer) => (out += d.toString()));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(`seed ${seed} (${as}) exited with ${code}`));
      const line = out.trim().split('\n').pop() ?? '';
      resolve(JSON.parse(line) as WorkerOutput);
    });
  });
}

/** Runs the jobs with at most `limit` at once and returns their results in the jobs' order. */
async function pool<T>(jobs: ReadonlyArray<() => Promise<T>>, limit: number): Promise<T[]> {
  const results: T[] = new Array<T>(jobs.length);
  let next = 0;
  const runNext = async (): Promise<void> => {
    while (next < jobs.length) {
      const i = next++;
      results[i] = await jobs[i]!();
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, jobs.length) }, runNext));
  return results;
}

async function main(): Promise<void> {
  if (worker) {
    console.log(JSON.stringify(runOne(firstSeed, profile === 'idle' ? 'idle' : 'active')));
    return;
  }
  const started = Date.now();
  const seedList = Array.from({ length: seeds }, (_, i) => firstSeed + i);
  const profiles: SimProfile[] = profile === 'both' ? ['active', 'idle'] : [profile];
  const all = await pool(
    profiles.flatMap((as) => seedList.map((seed) => () => runChild(seed, as))),
    Math.max(1, availableParallelism()),
  );
  const of = (as: SimProfile): WorkerOutput[] =>
    profiles.includes(as)
      ? all.slice(profiles.indexOf(as) * seeds, (profiles.indexOf(as) + 1) * seeds)
      : [];
  // The main table is the active profile's (the targets are for active play); with only the idle
  // profile asked for, it is the idle one's.
  const outputs = profile === 'idle' ? of('idle') : of('active');
  const idleOutputs = profile === 'both' ? of('idle') : [];
  const simSeconds = outputs[0]?.simSeconds ?? hours * 3600;
  const summary = summarizeRuns(outputs.map((o) => o.hits));
  const idleSummary =
    idleOutputs.length > 0 ? summarizeRuns(idleOutputs.map((o) => o.hits)) : undefined;
  if (profile === 'idle') console.log('Idle profile only.\n');
  console.log(formatSeedTable(summary, simSeconds, { seeds: seedList, idle: idleSummary }));
  if (idleSummary) {
    console.log(
      'Idle profile: checks in every 30 min and is offline 8 h a day; the targets are for active play, the idle columns are there to catch dead ends.',
    );
  }
  // The run whose milestones sit closest to the medians, as the example end state.
  const median = (id: string): number => summary[id]?.median ?? simSeconds;
  const distance = (o: WorkerOutput): number =>
    Object.keys(summary).reduce(
      (a, id) => a + Math.abs((o.hits[id] ?? simSeconds) - median(id)),
      0,
    );
  // Median damage per second against the first dungeon, one column per sample hour.
  const sampleHours = [0.25, 0.5, 1, 2, 4, 8, 12, 16, 20, 30, 40].filter((h) => h <= hours);
  const medianDps = sampleHours.map((h) => {
    const values = outputs
      .map((o) => o.dps.find(([t]) => t === h * 3600)?.[1])
      .filter((v): v is number => v !== undefined)
      .sort((a, b) => a - b);
    return `${h} h ${(values[Math.floor(values.length / 2)] ?? 0).toExponential(1)}`;
  });
  console.log(`
Median DPS vs first dungeon: ${medianDps.join(', ')}`);
  // Median pulls in the hour before each sample hour (DESIGN §7: 12 to 15 an hour).
  const pullHours = [1, 2, 4, 8, 10, 12, 16, 20, 30, 40].filter((h) => h <= hours);
  const pullsAt = (o: WorkerOutput, seconds: number, j: 1 | 2): number =>
    seconds <= 0 ? 0 : (o.pulls.find(([t]) => t === seconds)?.[j] ?? 0);
  const medianPulls = (j: 1 | 2): string =>
    pullHours
      .map((h) => {
        const values = outputs
          .map((o) => pullsAt(o, h * 3600, j) - pullsAt(o, (h - 1) * 3600, j))
          .sort((a, b) => a - b);
        return `${h} h ${values[Math.floor(values.length / 2)] ?? 0}`;
      })
      .join(', ');
  console.log(`Median Card Portal pulls in the hour before: ${medianPulls(1)}`);
  console.log(`Median Wardrobe Gate pulls in the hour before: ${medianPulls(2)}`);
  const typical = [...outputs].sort((a, b) => distance(a) - distance(b))[0];
  if (typical) {
    console.log(`\nMost typical run (seed ${typical.seed}):\n`);
    console.log(typical.summary);
  }
  console.log(
    `\n(${hours} h simulated for seeds ${seedList.join(', ')}, step ${step} s (${lateStep} s after 2 h), in ${((Date.now() - started) / 1000).toFixed(1)} s)`,
  );
  // After the closing line, so the part above stays comparable with older sim outputs.
  if (typical) {
    console.log(
      `\nRuns of seed ${typical.seed} (time from the start of each run to its first milestones):\n`,
    );
    console.log(formatRunTable(typical.runs));
  }
  console.log(`\n${formatGuard(outputs.map((o) => ({ seed: o.seed, runs: o.runs })))}`);
  console.log(`
${formatProgress(outputs, hours)}`);
  if (strict && !bandsPass(summary)) process.exit(1);
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
