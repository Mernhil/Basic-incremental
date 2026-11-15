import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

export interface SaveFiles {
  /** Raw text of the main save, or null if it does not exist / cannot be read. */
  primary: string | null;
  /** Raw text of the previous save, or null. */
  backup: string | null;
}

export interface SaveStore {
  read(): SaveFiles;
  write(text: string): void;
  /** Dev builds: copies the main save to `save.before-reset-<timestamp>.json`; its file name,
   *  or null when there is no save to copy. */
  backupBeforeReset(now: Date): string | null;
}

/** `2026-11-15_16-30-05` in local time, safe in a file name. */
export function stampName(now: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}_${p(now.getHours())}-${p(now.getMinutes())}-${p(now.getSeconds())}`;
}

function readOrNull(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

function isJson(text: string | null): boolean {
  if (text === null) return false;
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Stores the save as `save.json` inside `dir`. Writes are atomic (temp file + rename), and the
 * previous save is copied to `save.bak.json` first, so a crash mid-write never loses both.
 * The backup is only replaced by a previous save that is itself valid JSON, so a corrupted
 * main file can never overwrite a good backup.
 */
export function createSaveStore(dir: string): SaveStore {
  const primaryPath = join(dir, 'save.json');
  const backupPath = join(dir, 'save.bak.json');
  const tempPath = join(dir, 'save.json.tmp');
  const corruptPath = join(dir, 'save.corrupt.json');

  return {
    read() {
      return { primary: readOrNull(primaryPath), backup: readOrNull(backupPath) };
    },
    write(text) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(tempPath, text, 'utf8');
      if (existsSync(primaryPath)) {
        // A good previous save becomes the backup; a damaged one is kept aside for recovery
        // instead of being silently destroyed.
        copyFileSync(primaryPath, isJson(readOrNull(primaryPath)) ? backupPath : corruptPath);
      }
      renameSync(tempPath, primaryPath);
    },
    backupBeforeReset(now) {
      if (!existsSync(primaryPath)) return null;
      const name = `save.before-reset-${stampName(now)}.json`;
      copyFileSync(primaryPath, join(dir, name));
      return name;
    },
  };
}
