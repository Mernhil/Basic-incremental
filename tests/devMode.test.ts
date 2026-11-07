import { describe, expect, it } from 'vitest';
import { devCheatsEnabled } from '../src/main/devMode';
import { IPC_CHANNELS } from '../src/preload/api';

describe('dev cheats gating in the main process', () => {
  it('allows the cheats only when the app is not packaged', () => {
    expect(devCheatsEnabled({ isPackaged: false }, {})).toBe(true);
    expect(devCheatsEnabled({ isPackaged: true }, {})).toBe(false);
  });

  it('can be switched off in a dev build with BI_NO_CHEATS=1, never on in a packaged one', () => {
    expect(devCheatsEnabled({ isPackaged: false }, { BI_NO_CHEATS: '1' })).toBe(false);
    expect(devCheatsEnabled({ isPackaged: true }, { BI_NO_CHEATS: '0' })).toBe(false);
  });

  it('has an IPC channel the preload asks', () => {
    expect(IPC_CHANNELS.devCheatsEnabled).toBe('dev:cheats-enabled');
  });
});
