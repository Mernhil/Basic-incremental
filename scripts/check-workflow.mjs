// Workflow checks (CLAUDE.md, "Workflow"). Runs in `npm run lint` and in CI.
//  (a) A PR that changes `src/` must also change docs/PROJECT_OVERVIEW.md, unless its description has
//      the line `no overview change`.
//  (b) Nothing but a README may remain under docs/plans/ on main or when a PR merges into main.
// In GitHub Actions the PR description is read from the event payload. Locally the description is
// unknown, so (a) only warns and (b) only warns (a plan is allowed to exist while you work).
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const OVERVIEW = 'docs/PROJECT_OVERVIEW.md';
export const OPT_OUT = 'no overview change';

const norm = (f) => f.replace(/\\/g, '/');

/** True when the PR description has the opt-out as a line of its own. */
export function hasOptOut(body) {
  return (body ?? '').split(/\r?\n/).some((line) => line.trim() === OPT_OUT);
}

/** Errors for rule (a). `prBody` is null when the description is unknown. */
export function checkOverview(changedFiles, prBody) {
  const files = changedFiles.map(norm);
  if (!files.some((f) => f.startsWith('src/'))) return [];
  if (files.includes(OVERVIEW)) return [];
  if (prBody !== null && hasOptOut(prBody)) return [];
  return [
    `This change touches src/ but not ${OVERVIEW}. Update the overview entries for what you changed, ` +
      `or (tiny direct job with no behaviour change only) put the line "${OPT_OUT}" in the PR description.`,
  ];
}

/** Plan docs still present: every file under docs/plans/ except README.md. */
export function leftoverPlans(files) {
  return files
    .map(norm)
    .filter((f) => f.startsWith('docs/plans/') && f !== 'docs/plans/README.md' && !f.endsWith('/'));
}

/** Errors for rule (b). */
export function checkPlans(files) {
  return leftoverPlans(files).map(
    (f) => `${f} is still in docs/plans/. The PR that implements a plan deletes its plan doc.`,
  );
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean);
}

function listPlans() {
  if (!existsSync('docs/plans')) return [];
  return readdirSync('docs/plans', { recursive: true }).map((f) => `docs/plans/${f}`);
}

function main() {
  const env = process.env;
  const ci = env.GITHUB_ACTIONS === 'true';
  const event = env.GITHUB_EVENT_NAME;
  let payload = {};
  if (ci && env.GITHUB_EVENT_PATH && existsSync(env.GITHUB_EVENT_PATH)) {
    payload = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8'));
  }
  const errors = [];
  const warnings = [];

  // (a) overview
  if (ci && event === 'pull_request') {
    const base = payload.pull_request?.base?.ref ?? env.GITHUB_BASE_REF ?? 'main';
    const changed = git(['diff', '--name-only', `origin/${base}...HEAD`]);
    errors.push(...checkOverview(changed, payload.pull_request?.body ?? ''));
  } else if (!ci) {
    try {
      const changed = git(['diff', '--name-only', 'origin/main...HEAD']);
      const local = checkOverview(changed, null);
      if (local.length) {
        warnings.push(
          local[0] +
            ' (Locally the PR description is unknown, so this is only a warning; CI decides.)',
        );
      }
    } catch {
      warnings.push('Could not compare against origin/main; skipped the PROJECT_OVERVIEW check.');
    }
  }

  // (b) plans: enforced for PRs into main and for main itself
  const plans = checkPlans(listPlans());
  const intoMain =
    (event === 'pull_request' &&
      (payload.pull_request?.base?.ref ?? env.GITHUB_BASE_REF) === 'main') ||
    (event === 'push' && env.GITHUB_REF === 'refs/heads/main');
  if (ci && intoMain) errors.push(...plans);
  else
    warnings.push(
      ...plans.map((p) => `${p} (allowed while you work; it must be gone before merge)`),
    );

  for (const w of warnings) console.warn(`check-workflow: warning: ${w}`);
  if (errors.length) {
    console.error('check-workflow failed:\n- ' + errors.join('\n- '));
    process.exit(1);
  }
  console.log('check-workflow: ok');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
