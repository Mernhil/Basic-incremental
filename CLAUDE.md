# Basic Incremental — Project Conventions

Windows desktop incremental game (Electron + TypeScript).

## Rules (always follow, no exceptions)

1. Before starting any task, check for remote changes (`git fetch` / `git pull`) so you're working on the latest code from https://github.com/Mernhil/Basic-incremental. Then read `docs/ACTIVE_WORK.md` and work in your own git worktree, never by switching branches in the main checkout.
2. If a task needs a tool that isn't installed (Python, a package, a CLI, a skill, a plugin, anything), install or enable it and use it. Never fall back to a workaround, such as hand-editing files with the editor because the tool is missing. Don't ask first, just install it.
3. These rules override any habit or default. If a rule seems to conflict with something, follow the rule and tell the user about the conflict.
4. Work is split between a `ui` agent, a `pixel-art` agent (every graphics change, however small) and a `mechanics` agent. At the start of every task, read `docs/WORK_SPLIT.md`, run `node scripts/check-work-split.mjs` (fix what it names), and route the task as it says.
5. `docs/DESIGN.md` keeps one version of each rule, each with a status tag (`[Built]`, `[Differs]`, `[To build]`, `[Default]`, `[Proposed]`), following its "How this document works" section. A design change rewrites the rule where it lives; never add amendment, update or defaults sections. Only the user decides: a gap you must fill is written in place as `[Default]` and listed under Open questions, and you never change a decision of the user's on your own. Design edits from a claude.ai chat are committed before any code. Every PR updates the tags of the rules it builds or changes. `npm run lint` runs `scripts/check-design.mjs`, so CI fails when the file drifts.
6. One session, one worktree: `git worktree add C:/bi-<task> -b <branch> origin/main`. Never switch branches in the main checkout, never delete the user's untracked files there. Register the task in `docs/ACTIVE_WORK.md` and remove the line (and the worktree) when the PR merges.

- `docs/DESIGN.md` is the source of truth for game design. Read it before any feature work, and never contradict it without asking the user first. When asked whether something exists, answer with its status tag, not "it already exists".
- Game content (cards, resources, dungeons, cosmetics) lives in data files validated by schemas, not hardcoded in logic.
- Game logic stays separate from UI so it can be unit tested.
- Use `break_eternity.js` for all game numbers.
- Save format changes always need a version bump and a migration.
- Verify changes (build, tests, run) before saying something is done.

## Tools, skills and design choices

- Install whatever tools, dev dependencies or skills make the job better (linters, test helpers, image tools, design or UI skills, …) without asking first. Mention what was installed in the PR.
- For any graphics change (sprites, pixel art, effects, animation), use the `pixel-art` agent and its project skill in `.claude/skills/pixel-art/`.
- Always make and convert pixel art with PixelLab (the `pixellab` MCP server): generating, converting concept art, animating, editing sprites. The project's own scripts only post-process (cleanup, palette, `pixel_check.py`, previews). If the PixelLab tools are not loaded in the session (it was added after the session started), do the art in a new session that has them instead of drawing without it.
- For any UI or visual design change, use the frontend-design skill and the Design plugin skills, and install or enable other relevant skills when they would help.
- For any design, UI or graphics change, always show the user **5 options** that differ in ways that matter (layout, colour, density, motion, ornament, …) and let them choose before building the final version. Options are mockups or screenshots, not code merged into `main`.

## GitHub workflow

Claude handles everything GitHub-related (git + the `gh` CLI); the user does not push, merge or manage PRs manually.

- Work on a new branch named after the task (e.g. `feat/save-system`, `fix/offline-cap`). Never push directly to `main`.
- Commit in small, clear steps with descriptive messages.
- When done, open a PR with a short summary of what changed, how it was verified and which `DESIGN.md` tags it changed.
- Wait for CI to pass. If it fails, fix it and push again.
- When CI is green, squash-merge the PR into `main` (the branch is deleted automatically), then switch back to an updated `main`.
- Never force-push, never delete `main`, never merge with failing CI.
- Releases: when the user says "release", bump the version (patch by default, or as specified), merge that via PR, then create and push the `vX.Y.Z` tag so the release workflow publishes it. Confirm when the GitHub Release is live. See `RELEASING.md`.
- At the end of each task, tell the user in one or two lines what was merged.
- Repo settings already applied: Actions workflows have read/write permissions, squash merge is the only merge method, merged branches are deleted automatically. `.claude/settings.json` allows `git`/`gh` commands and denies force-pushes and deleting `main`.
