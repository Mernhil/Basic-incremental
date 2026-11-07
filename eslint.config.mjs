import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '.claude/worktrees/**',
      'design/**',
      'node_modules/**',
      'out/**',
      'dist/**',
      'release/**',
      'coverage/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: [
      'src/main/**/*.ts',
      'src/preload/**/*.ts',
      'electron.vite.config.ts',
      'vitest.config.mts',
      'tests/**/*.ts',
      'scripts/**/*.mjs',
      'scripts/**/*.ts',
    ],
    languageOptions: { globals: globals.node },
  },
  {
    // Playwright scripts run in Node but pass callbacks that execute in the page.
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    files: ['src/renderer/**/*.ts'],
    languageOptions: { globals: globals.browser },
    rules: {
      // UI talks to mechanics only through the public entry points.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              // game/dev is the dev cheats entry: import it only behind import.meta.env.DEV.
              group: ['**/game/*', '!**/game/dev', '**/data/*'],
              message: "Import from 'game' or 'data' (their index.ts), not their internal files.",
            },
          ],
        },
      ],
    },
  },
  {
    // Game logic must stay pure: no UI, Electron or Node imports.
    files: ['src/game/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['electron', 'electron/*'], message: 'src/game must not import Electron.' },
            {
              group: ['**/main/**', '**/preload/**', '**/renderer/**'],
              message: 'src/game must not import UI/process code.',
            },
            { group: ['node:*'], message: 'src/game must stay environment-agnostic.' },
          ],
        },
      ],
    },
  },
  prettier,
);
