/**
 * Whether the dev cheats panel may run (Phase 9). Only in a dev build (the app is not
 * packaged); `BI_NO_CHEATS=1` hides it in a dev build too (to check the player's view). A
 * packaged (release) app never allows it, whatever the environment says. The renderer also
 * loads the cheats code only behind `import.meta.env.DEV`, so a release bundle never ships it.
 */
export function devCheatsEnabled(
  app: { isPackaged: boolean },
  env: Record<string, string | undefined>,
): boolean {
  if (app.isPackaged) return false;
  return env['BI_NO_CHEATS'] !== '1';
}
