/**
 * `npm run dist:dev`: builds the local-only dev app (DESIGN.md §2 Dev tools) into release-dev/.
 * "Basic Incremental Dev" has the dev cheats on although it is packaged (BI_DEV_BUILD=1, baked in
 * at build time), its own save folder and no auto-updater. It builds into out-dev/, never out/,
 * and nothing here runs in CI or the Release workflow. The result is
 * release-dev/win-unpacked/Basic Incremental Dev.exe.
 */
import { spawnSync } from 'node:child_process';
import { findDevCheats, MARKER } from './check-release-bundle.mjs';

const env = { ...process.env, BI_DEV_BUILD: '1' };
const shell = process.platform === 'win32';

function run(label, command, args) {
  console.log(`\n== ${label}`);
  const result = spawnSync(command, args, { stdio: 'inherit', env, shell });
  if (result.status !== 0) {
    console.error(`\nFailed: ${label}`);
    process.exit(result.status ?? 1);
  }
}

run('Type check', 'npx', ['tsc', '--noEmit', '-p', 'tsconfig.node.json']);
run('Type check (renderer)', 'npx', ['tsc', '--noEmit', '-p', 'tsconfig.web.json']);
run('Build the app into out-dev/', 'npx', ['electron-vite', 'build']);

// The opposite of the public check: this bundle must carry the cheats, or the flag did not take.
if (findDevCheats('out-dev').length === 0) {
  console.error(`\nout-dev/ has no dev cheats (${MARKER}); the dev flag did not take.`);
  process.exit(1);
}
run('Package release-dev/', 'npx', [
  'electron-builder',
  '--win',
  'dir',
  '--config',
  'electron-builder.dev.yml',
  '--publish',
  'never',
]);
console.log('Done: release-dev/win-unpacked/Basic Incremental Dev.exe');
