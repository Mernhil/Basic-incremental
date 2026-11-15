/* global __BI_DEV_BUILD__ */
// The pattern the renderer uses to load the dev cheats (see src/game/dev.ts): a dynamic import
// behind import.meta.env.DEV or the dev build's baked-in flag (__BI_DEV_BUILD__), which a public
// (production) build removes with its chunk.
export async function loadDevCheats() {
  if (import.meta.env.DEV || __BI_DEV_BUILD__) return import('../../../src/game/dev');
  return null;
}
