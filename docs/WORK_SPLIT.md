# Work split: UI, pixel art and mechanics

This repo splits Claude's work between three project agents, each with its own skills and its own folders. Read this file whenever a task starts, and follow **Setup check** first.

## Setup check

At the start of any task run `node scripts/check-work-split.mjs`. It checks that the three agent files, the pixel-art skill, `src/game/CLAUDE.md`, `src/renderer/CLAUDE.md`, `docs/ACTIVE_WORK.md` and the renderer import rule in `eslint.config.mjs` exist. If it prints "ok", carry on. If it fails, restore what it names from git history on a branch `chore/work-split-setup` and open a PR (see `CLAUDE.md`). The agent files in `.claude/agents/` are the single source of truth for each agent's rules; this file no longer copies them.

The skills listed in the agents must be available. If one is missing, install or enable its plugin (rule 2 in `CLAUDE.md`). If a plugin is installed under a different name, fix the name in the agent's `skills:` list and tell the user.

## Who does what

| Agent       | Owns                                                                             | Skills                                                                              |
| ----------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `ui`        | `src/renderer/**` except the art below, `design/**` except `design/pixel`        | frontend-design, Design plugin (critique, design-system, accessibility, UX copy)    |
| `pixel-art` | `src/renderer/src/art/**`, `src/renderer/src/theme/effects.*`, `design/pixel/**` | pixel-art (project skill), frontend-design, Design plugin (critique, accessibility) |
| `mechanics` | `src/game/**`, `src/data/**`, `src/main/**`, `src/preload/**`, `tests/**`        | test-driven-development, systematic-debugging                                       |

Both also use verification-before-completion.

## Cost

`ui` and `mechanics` run on Sonnet (`model: sonnet`); `pixel-art` stays on the strongest model because it has to invent distinct styles. Run one agent at a time per task, each session in its own worktree (see `docs/ACTIVE_WORK.md`), take one screenshot set per PR, run the full test suite once before the PR, and start from `docs/CODE_MAP.md` instead of exploring.

## Routing

- Any change to the art itself (sprites, pixel art, palettes, shading, sprite animation, element effects, hit animations, sparkles, icons as drawings), however small → delegate to `pixel-art`. Every graphics tweak goes there, not to `ui`.
- Other visual task (layout, CSS, theme colours, pages, tooltips, copy on screen) → delegate to `ui`, which reads `docs/UI_RULES.md` (the only UI rulebook).
- A screen that needs new art → `pixel-art` draws the asset, `ui` places it.
- Pure logic, numbers, content, saves, process task → delegate to `mechanics`.
- A feature that needs both → `mechanics` first (logic + tests + exports in `src/game/index.ts` / `src/data/index.ts`), then `ui` builds the screen on those exports. One PR for each part.
- If an agent hits work outside its folders, it stops and writes a handoff (what is needed, the types it wants, why) instead of doing it.
- The contract between the two is the public exports of `src/game` and `src/data`. The renderer never imports their internal files, and `src/game` never imports UI, Electron or Node. ESLint enforces both.
- To run a whole session as one worker: `claude --agent ui`, `claude --agent pixel-art` or `claude --agent mechanics`.

## Running dev apps in parallel

Dev builds share one save folder (`%APPDATA%\basic-incremental-dev`) by default. Two dev apps running at the same time autosave over each other, which makes resources look like they jump back or go down. Give each agent its own folder:

- `BI_PROFILE=<name>` (or `--bi-profile=<name>` on the Electron command line) uses `%APPDATA%\basic-incremental-dev-<name>`, e.g. `BI_PROFILE=ui npm run dev`;
- `BI_USER_DATA_DIR=<folder>` uses that folder as is.

Profile names are letters, digits, `-` and `_`. Packaged builds ignore all of this.
