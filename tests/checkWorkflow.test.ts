import { describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs script without types
import * as w from '../scripts/check-workflow.mjs';

describe('check-workflow: overview rule', () => {
  it('passes when src is untouched', () => {
    expect(w.checkOverview(['docs/DESIGN.md', 'tests/a.test.ts'], '')).toEqual([]);
  });
  it('fails when src changes without the overview', () => {
    expect(w.checkOverview(['src/game/tick.ts'], 'fix')).toHaveLength(1);
  });
  it('passes when the overview changes too', () => {
    expect(w.checkOverview(['src/game/tick.ts', 'docs/PROJECT_OVERVIEW.md'], '')).toEqual([]);
  });
  it('accepts the opt-out only as an exact line', () => {
    expect(w.checkOverview(['src/a.ts'], 'Typo.\n\nno overview change\n')).toEqual([]);
    expect(w.checkOverview(['src/a.ts'], 'Typo.\r\n  no overview change  \r\n')).toEqual([]);
    expect(w.checkOverview(['src/a.ts'], 'there is no overview change here')).toHaveLength(1);
    expect(w.checkOverview(['src/a.ts'], 'No Overview Change')).toHaveLength(1);
    expect(w.checkOverview(['src/a.ts'], null)).toHaveLength(1);
    expect(w.checkOverview(['src/a.ts'], '')).toHaveLength(1);
  });
  it('handles Windows paths', () => {
    expect(w.checkOverview(['src\\game\\tick.ts'], '')).toHaveLength(1);
    expect(w.checkOverview(['src\\game\\tick.ts', 'docs\\PROJECT_OVERVIEW.md'], '')).toEqual([]);
  });
});

describe('check-workflow: plan docs', () => {
  it('allows the README only', () => {
    expect(w.checkPlans(['docs/plans/README.md', 'docs/DESIGN.md'])).toEqual([]);
  });
  it('flags every other file under docs/plans', () => {
    const errs = w.checkPlans([
      'docs/plans/README.md',
      'docs/plans/shop.md',
      'docs\\plans\\sub\\x.md',
    ]);
    expect(errs).toHaveLength(2);
    expect(errs[0]).toContain('docs/plans/shop.md');
  });
  it('ignores similar paths', () => {
    expect(w.leftoverPlans(['docs/plansible.md', 'src/docs/plans/a.md'])).toEqual([]);
  });
});
