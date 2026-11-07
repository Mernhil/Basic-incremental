import { join } from 'node:path';

const PROFILE = /^[a-z0-9][a-z0-9_-]{0,31}$/i;

/**
 * Where a dev build (not packaged) keeps its saves, settings and logs. By default one shared
 * folder next to the installed game's; several dev apps running at once (parallel agents) would
 * then autosave over each other. Give each its own:
 * - `BI_USER_DATA_DIR=<folder>`: use that folder;
 * - `BI_PROFILE=<name>` or `--bi-profile=<name>`: use `basic-incremental-dev-<name>`.
 */
export function devUserDataDir(
  appData: string,
  env: Record<string, string | undefined>,
  argv: readonly string[],
): string {
  const dir = env['BI_USER_DATA_DIR']?.trim();
  if (dir) return dir;
  const flag = argv.find((a) => a.startsWith('--bi-profile='))?.slice('--bi-profile='.length);
  const profile = (env['BI_PROFILE'] ?? flag ?? '').trim();
  const name = PROFILE.test(profile) ? `basic-incremental-dev-${profile}` : 'basic-incremental-dev';
  return join(appData, name);
}
