/**
 * Release guard (Phase 9): fails when a built bundle contains the dev cheats. `npm run build`
 * runs it on `out/` after electron-vite, so `npm run dist` and the release workflow can never
 * package the cheats. The marker is DEV_CHEATS_MARKER in src/game/dev.ts.
 *
 *   node scripts/check-release-bundle.mjs [dir=out]
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MARKER = 'bi-dev-cheats-entry';
const SCANNED = /\.(m?js|cjs|html)$/;

/** Files under `dir` (bundled code) that contain the dev cheats marker. */
export function findDevCheats(dir) {
  const found = [];
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const path = join(d, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (SCANNED.test(name) && readFileSync(path, 'utf8').includes(MARKER)) found.push(path);
    }
  };
  walk(dir);
  return found;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = resolve(process.argv[2] ?? 'out');
  const found = findDevCheats(dir);
  if (found.length > 0) {
    console.error(`Dev cheats found in the release bundle:\n${found.join('\n')}`);
    process.exit(1);
  }
  console.log(`Release bundle check: no dev cheats in ${dir}`);
}
