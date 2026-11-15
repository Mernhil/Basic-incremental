import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** The z-index of the first rule whose selector is exactly `selector`. */
function zIndex(file: string, selector: string): number {
  const css = readFileSync(file, 'utf8');
  const at = css.indexOf(`\n${selector} {`);
  expect(at, `${selector} in ${file}`).toBeGreaterThan(-1);
  const block = css.slice(at, css.indexOf('}', at));
  const m = /z-index:\s*(\d+)/.exec(block);
  expect(m, `z-index of ${selector}`).not.toBeNull();
  return Number(m?.[1]);
}

describe('shell stacking', () => {
  it('keeps the header (and the Goals list dropping from it) above the open view layer', () => {
    // 2026-11-15: the header sat at 3 under the view layer at 5, so the Goals list hid behind
    // every full view. `scripts/check-goals-popup.mjs` checks it in the running app.
    expect(zIndex('src/renderer/src/shell/shell.css', '.shell-header')).toBeGreaterThan(
      zIndex('src/renderer/src/table/viewHost.css', '.vh-layer'),
    );
  });
});
