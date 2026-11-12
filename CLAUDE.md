# Basic Incremental — Project Conventions

Windows desktop incremental game (Electron + TypeScript, repo https://github.com/Mernhil/Basic-incremental).

## What to read

- Always read this file and `docs/PROJECT_OVERVIEW.md` (the whole project as built now: what each system does, where it lives, which DESIGN rule it implements).
- `docs/DESIGN.md` is the source of truth for game design: read it before feature work and never contradict it without asking the user. Asked whether something exists, answer with its status tag, not "it already exists".
- Read `docs/UI_RULES.md` only for UI changes (the only UI rulebook).
- Read `docs/ASSET_RULES.md` only for new or changed assets (all art rules). It wins over other documents.

## Workflow

- **Bigger work starts in the Claude Desktop home chat:** brainstorm → approved plan → plan doc plus a paired prompt → a Code session that implements it.
- **Small jobs, and tweaks to jobs already going, are done directly in Code.**
- A plan doc committed to the repo lives in `docs/plans/<name>.md` and is deleted in the PR that implements it.
- **Every PR that changes `src/` updates `docs/PROJECT_OVERVIEW.md` in the same PR** (it is rewritten in place and always equals the code). The only exception is a tiny direct-in-Code job (typo, comment, one-line fix, no behaviour change) whose PR description has the exact line `no overview change`.
- `npm run lint` runs `scripts/check-workflow.mjs`, so CI fails when a PR touches `src/` without the overview (and without that line), or when a plan doc is still in `docs/plans/` on a PR into `main` or on `main`.
- **5 options first** applies only to design, UI and art brainstorms in the home chat: the user sees 5 options that differ in ways that matter and picks before the final version is built. Small direct jobs need no options. Options are mockups or screenshots, never merged into `main`. Whenever the user chooses between pictures (art, UI options, existing assets), they are shown on an interactive picker page: every picture has a label (its group number and a letter, like 1a), a click marks it Keep, a right-click (or L) marks it Learn (a style the user likes, kept as a pixel-art reference), and a Copy list button copies both lists for the user to paste into the chat. A picture marked both Keep and Learn is a stronger reference than one marked Learn only.

## Rules (always follow, no exceptions)

1. **Fetch first.** Before starting, run `git fetch` / `git pull` so you work on the latest code.
2. **One session, one worktree:** `git worktree add C:/bi-<task> -b <branch> origin/main`. Never switch branches in the main checkout, never delete the user's untracked files there. Remove the worktree when the PR merges.
3. **Tools.** If a task needs a tool, skill, plugin or package that is missing (Python, a CLI, a library, anything), ask the user once, then install and use it, and never ask again for that same tool. Never work around a missing tool (for example by hand-editing what the tool would produce). At the start of a job, check whether an installed or catalogue tool, skill or plugin would do it better and suggest it the same way. Mention what was installed in the PR.
4. These rules override any habit or default. If a rule seems to conflict with something, follow the rule and tell the user.
5. `docs/DESIGN.md` keeps one version of each rule, each with a status tag (`[Built]`, `[Differs]`, `[To build]`, `[Default]`, `[Proposed]`), following its "How this document works" section. A design change rewrites the rule where it lives; never add amendment, update or defaults sections. Only the user decides: a gap you must fill is written in place as `[Default]` and listed under Open questions, and you never change a decision of the user's on your own. Design edits from a chat are committed before any code. Every PR updates the tags of the rules it builds or changes. `npm run lint` runs `scripts/check-design.mjs`.
6. Game content (cards, resources, dungeons, cosmetics) lives in data files validated by schemas, not hardcoded in logic.
7. Game logic stays separate from UI so it can be unit tested.
8. Use `break_eternity.js` for all game numbers.
9. Save format changes always need a version bump and a migration.
10. Verify changes (lint, tests, build, and a run or screenshot for UI) before saying something is done.

Optional helpers: `.claude/agents/` holds `ui`, `pixel-art` and `mechanics` agents and `.claude/skills/pixel-art/` the pixel-art skill. Use them when they save time; nothing requires routing through them. The default art source is the user's own pictures (ChatGPT, Gemini), used as they are: cut out, background removed, scaled to fit, never converted to a pixel grid, redrawn or recoloured (user, 2026-11-12: "no need for pixelart conversion any more"; `docs/ASSET_RULES.md` §5 Straight pictures). Free asset packs the user picked are allowed too (user, 2026-11-11), each listed in `src/data/content/credits.json` with its licence. PixelLab (the `pixellab` MCP server) is only for art the user has no picture for and says may be made that way; it costs the user money, so ask first.

## GitHub workflow

Claude handles everything GitHub-related (git + the `gh` CLI); the user does not push, merge or manage PRs manually.

- Work on a new branch named after the task (e.g. `feat/save-system`, `fix/offline-cap`). Never push directly to `main`.
- Commit in small, clear steps with descriptive messages.
- When done, open a PR with a short summary of what changed, how it was verified and which `DESIGN.md` tags it changed.
- **Before merging, bring the branch up to date with `main`** (merge or rebase it) and wait for CI to pass on that up-to-date result. Two PRs that each passed alone have broken `main` before.
- Wait for a real CI pass (check the run's conclusion; never `gh pr checks | tail && gh pr merge`). If it fails, fix it and push again. When CI is green on the up-to-date branch, squash-merge the PR into `main` (the branch is deleted automatically), then switch back to an updated `main`.
- Never force-push, never delete `main`, never merge with failing CI.
- Releases: when the user says "release", bump the version (patch by default, or as specified), merge that via PR, then create and push the `vX.Y.Z` tag so the release workflow publishes it. Confirm when the GitHub Release is live. See `RELEASING.md`.
- At the end of each task, tell the user in one or two lines what was merged.
- Repo settings already applied: Actions workflows have read/write permissions, squash merge is the only merge method, merged branches are deleted automatically. `.claude/settings.json` allows `git`/`gh` commands and denies force-pushes and deleting `main`.
