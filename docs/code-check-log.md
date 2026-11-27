# Code check log

## 2026-11-27, commit fe58afed, scope: all

Tools: build pass, typecheck pass, lint pass, tests pass (161 files, 1786 tests; 1790 after the fixes), `npm audit` 14 moderate (dev-only: minimatch via eslint and electron-builder; 0 in production dependencies).

Findings:

1. fixed in draft PR 361 (Warning): an unreadable save was overwritten by a fresh game (`app.ts`, `saveStore.ts`). It is now copied to `save.unreadable-<timestamp>`; the copy text is corrected.
2. fixed in draft PR 361 (Warning): a clock set far ahead and then corrected froze `GameLoop` (`loop.ts`). A step back past the 8 h cap now restarts from the new time; a smaller step back still waits (the existing test keeps that).
3. fixed in draft PR 361 (downgraded to unsure): a non-`SaveError` at load now shows the fatal box and writes nothing. A fuzz of 4000 mutated saves (random fields deleted or set to wrong values, random older versions) produced only `SaveError`s, so no real input is known to trigger it.
4. fixed in draft PR 361 (Suggestion): `serve-web.mjs` answers 400 on a malformed URL.
5. partly fixed (Suggestion): tests added for keeping an unreadable save (desktop and web store) and for the clock jump. Still no tests for `src/main/saves.ts` (close-time flush), `updater.ts` or the startup path in `app.ts`.
6. open (Suggestion, unsure): `rendered()` runs `collectModifiers` and income per resource every 100 ms; measure first.

Full pass (game and UI code side), report only:

- Fuzz: 4000 mutated saves through `readSave`, 376 loaded and were run through 1 h of offline play: no NaN or negative resource, no non-`SaveError` exception.
- Local AI read `combat.ts`, `cards.ts`, `prestige.ts`, `summon.ts`, `heirlooms.ts`, `account.ts` for bugs. Everything it reported was a content value the data schemas already forbid (for example `starShards` has `min(1)`) or a documented mutate-in-place function whose callers clone first; no finding kept.
- UI: the window-level listeners (`specialAttack.ts`, `motion.ts`, `backdrop.ts`, `viewHost.ts`) are created once; the arenas are singletons, so nothing leaks. Tests: none without assertions, no `.skip` or `.only`, no `vi.mock`.
- Not read line by line: `combat.ts`, `migrations.ts`, `specialAttack.ts`, `arena.ts` and the UI pages beyond the checks above.
