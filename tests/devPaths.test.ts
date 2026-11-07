import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { devUserDataDir } from '../src/main/devPaths';

const APPDATA = join('C:', 'Users', 'me', 'AppData', 'Roaming');

describe('dev save folder', () => {
  it('defaults to the shared dev folder', () => {
    expect(devUserDataDir(APPDATA, {}, [])).toBe(join(APPDATA, 'basic-incremental-dev'));
  });

  it('takes a profile name from BI_PROFILE or --bi-profile, so parallel apps never share saves', () => {
    expect(devUserDataDir(APPDATA, { BI_PROFILE: 'ui' }, [])).toBe(
      join(APPDATA, 'basic-incremental-dev-ui'),
    );
    expect(devUserDataDir(APPDATA, {}, ['electron', '.', '--bi-profile=mechanics'])).toBe(
      join(APPDATA, 'basic-incremental-dev-mechanics'),
    );
  });

  it('takes a whole folder from BI_USER_DATA_DIR', () => {
    const dir = join('D:', 'scratch', 'bi');
    expect(devUserDataDir(APPDATA, { BI_USER_DATA_DIR: dir, BI_PROFILE: 'x' }, [])).toBe(dir);
  });

  it('ignores profile names that are not plain words', () => {
    expect(devUserDataDir(APPDATA, { BI_PROFILE: '../evil' }, [])).toBe(
      join(APPDATA, 'basic-incremental-dev'),
    );
  });
});
