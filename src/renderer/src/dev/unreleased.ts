/**
 * The dev flag for dungeons that wait for their theme (DESIGN.md §6 Three new dungeons): dev
 * builds can open them, with their placeholder names and drops, from the dev cheats panel. The
 * flag is a per-player preference in localStorage, read when the app loads its content; packaged
 * builds never read it (`app.ts` asks only behind `import.meta.env.DEV` and `devCheatsEnabled`).
 */
const KEY = 'bi.dev.unreleasedDungeons';

export function unreleasedDungeonsOn(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function setUnreleasedDungeons(on: boolean): void {
  try {
    if (on) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch {
    /* storage blocked: nothing to remember */
  }
}
