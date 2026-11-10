/**
 * `npm run sim -- [--hours 40] [--seeds 5] [--seed 1] [--step 5]`: runs the balance sim for
 * several seeds in parallel (one child process each) and prints, per DESIGN.md §14 milestone,
 * the target, the median sim time, the spread (min-max) and how many runs reached it, then the
 * end state of the median seed's run. `--seeds 1` prints the single-run table and summary.
 */
import { spawn } from 'node:child_process';
import { loadContent } from '../../src/data';
import {
  formatSeedTable,
  formatSummary,
  formatTable,
  runSim,
  summarizeRuns,
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

const hours = arg('hours', 40);
const seeds = Math.floor(arg('seeds', 5));
const firstSeed = arg('seed', 1);
const step = arg('step', 5);
const worker = process.argv.includes('--worker');

interface WorkerOutput {
  seed: number;
  hits: SimResult['hits'];
  dps: SimResult['dpsSamples'];
  pulls: SimResult['pullSamples'];
  simSeconds: number;
  summary: string;
}

function runOne(seed: number): WorkerOutput {
  const content = loadContent();
  const result = runSim(content, { hours, seed, stepSeconds: step });
  return {
    seed,
    hits: result.hits,
    dps: result.dpsSamples,
    pulls: result.pullSamples,
    simSeconds: result.simSeconds,
    summary: `${formatTable(result)}\n\n${formatSummary(result, content)}`,
  };
}

/** Runs one seed in a child process (same loader flags) and reads its JSON line. */
function runChild(seed: number): Promise<WorkerOutput> {
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
    ];
    const child = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'inherit'] });
    let out = '';
    child.stdout.on('data', (d: Buffer) => (out += d.toString()));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(`seed ${seed} exited with ${code}`));
      const line = out.trim().split('\n').pop() ?? '';
      resolve(JSON.parse(line) as WorkerOutput);
    });
  });
}

async function main(): Promise<void> {
  if (worker) {
    console.log(JSON.stringify(runOne(firstSeed)));
    return;
  }
  const started = Date.now();
  const seedList = Array.from({ length: seeds }, (_, i) => firstSeed + i);
  const outputs = await Promise.all(seedList.map(runChild));
  const simSeconds = outputs[0]?.simSeconds ?? hours * 3600;
  const summary = summarizeRuns(outputs.map((o) => o.hits));
  console.log(formatSeedTable(summary, simSeconds));
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
    `\n(${hours} h simulated for seeds ${seedList.join(', ')}, step ${step} s, in ${((Date.now() - started) / 1000).toFixed(1)} s)`,
  );
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
