// The pattern the renderer uses to load the dev cheats (see src/game/dev.ts): a dynamic import
// behind import.meta.env.DEV, which a release (production) build removes with its chunk.
export async function loadDevCheats() {
  if (import.meta.env.DEV) return import('../../../src/game/dev');
  return null;
}
