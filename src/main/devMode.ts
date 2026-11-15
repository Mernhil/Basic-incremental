/**
 * Whether the dev cheats panel may run. Three cases (DESIGN.md §2 Dev tools):
 * - unpackaged (running from source): on, unless `BI_NO_CHEATS=1` hides it (to check the
 *   player's view);
 * - packaged local dev build (the local dev build, `devBuild` is a build-time constant, never
 *   read from the environment): on;
 * - packaged public release: never, whatever the environment says.
 * The renderer loads the cheats code only behind `import.meta.env.DEV` or that same build
 * constant, so a public bundle never ships it (scripts/check-release-bundle.mjs).
 */
export function devCheatsEnabled(
  app: { isPackaged: boolean },
  env: Record<string, string | undefined>,
  devBuild = false,
): boolean {
  if (app.isPackaged) return devBuild;
  return env['BI_NO_CHEATS'] !== '1';
}
