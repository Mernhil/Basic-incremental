import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { build } from 'vite';
import { DEV_CHEATS_MARKER } from '../src/game/dev';
// @ts-expect-error plain .mjs script without type declarations
import { findDevCheats } from '../scripts/check-release-bundle.mjs';

const entry = resolve(__dirname, 'fixtures/devGate/entry.js');
const outDirs: string[] = [];

/** Builds the dev-gate fixture like the renderer build does, in a mode. */
async function buildFixture(mode: 'production' | 'development'): Promise<string> {
  const outDir = mkdtempSync(join(tmpdir(), `bi-devgate-${mode}-`));
  outDirs.push(outDir);
  const before = process.env['NODE_ENV'];
  // Vite derives import.meta.env.DEV from NODE_ENV; vitest sets it to "test".
  process.env['NODE_ENV'] = mode;
  try {
    await build({
      configFile: false,
      logLevel: 'silent',
      mode,
      build: {
        outDir,
        emptyOutDir: true,
        minify: false,
        lib: { entry, formats: ['es'], fileName: 'entry' },
      },
    });
  } finally {
    process.env['NODE_ENV'] = before;
  }
  return outDir;
}

afterAll(() => {
  for (const dir of outDirs) rmSync(dir, { recursive: true, force: true });
});

describe('release bundles never ship the dev cheats', () => {
  it('a production build of the dev-gated import leaves the cheats out', async () => {
    const out = await buildFixture('production');
    expect(findDevCheats(out)).toEqual([]);
  }, 60_000);

  it('a development build of the same import contains them (the check can see them)', async () => {
    const out = await buildFixture('development');
    const found: string[] = findDevCheats(out);
    expect(found.length).toBeGreaterThan(0);
  }, 60_000);

  it('looks for the marker the cheats module carries', () => {
    expect(DEV_CHEATS_MARKER).toBe('bi-dev-cheats-entry');
  });
});
