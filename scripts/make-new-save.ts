// Writes a brand-new game's save text to the path given (a screenshot helper, scripts/shoot-fix.mjs).
import { writeFileSync } from 'node:fs';
import { loadContent } from '../src/data';
import { createNewGame, createSaveText } from '../src/game';

writeFileSync(
  process.argv[2] ?? 'new.save.txt',
  createSaveText(createNewGame(loadContent()), Date.now()),
);
