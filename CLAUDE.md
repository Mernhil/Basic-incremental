# Basic Incremental — project rules

Windows desktop incremental game (Electron + TypeScript, repo https://github.com/Mernhil/Basic-incremental).

These are the rules the user decided on 2026-11-17, in their wording. Two more groups apply to every chat on this PC and live in the user's own `CLAUDE.md`: how Claude reports and what counts as a yes (group 1), and test windows (group 6). Claude never adds, drops or changes a rule here on its own; a rule that seems missing is a question to the user.

## Where things are

- `docs/DESIGN.md`: the game's design, one rule per decision, each with a status tag (`[Built]`, `[Differs]`, `[To build]`, `[Default]`, `[Proposed]`). Its "How this document works" section explains the tags.
- `docs/PROJECT_OVERVIEW.md`: the project as built now, and which file does what.
- `docs/UI_RULES.md`: the UI rulebook. `docs/ASSET_RULES.md`: the art rulebook.
- `RELEASING.md`: how a release is made (a version bump by PR, then the `vX.Y.Z` tag).
- `npm run lint` also runs `scripts/check-workflow.mjs` and `scripts/check-design.mjs`: CI fails when a PR touches `src/` without the overview (a tiny job with no behaviour change may instead put the exact line `no overview change` in its PR description), or when a plan doc is still in `docs/plans/`.
- Optional helpers: `.claude/agents/` (`ui`, `pixel-art`, `mechanics`) and `.claude/skills/pixel-art/`. Nothing requires routing through them.

## Setup notes (facts, not rules)

- A new worktree: `git worktree add C:/bi-<task> -b <branch> origin/main`. Never switch branches in the main folder, and never delete the user's untracked files there.
- In a new worktree `npm ci` skips Electron's install script on this PC: run `node node_modules/electron/install.js` once before starting the dev app.
- Bare `python` is not on PATH; use `py`.
- The `gh` CLI does everything on GitHub; the user does not push, merge or manage PRs by hand.

## 2. Showing work and picking

1. **Picker page.** Every time there is a choice to make between pictures, it is shown on the picker page. What the user picks is what gets built.
2. **Single picture.** When Claude is only showing one picture, it is sent at the end of the reply.
3. **Approval before release.** Nothing graphic is merged or released before the user's explicit approval or choice.
4. **Options.** At least two, at most five. Each option differs from every other in layout or in how it works; if two could be described as "the same thing in another colour or font", one of them is dropped. Small direct jobs need none. Options are never merged into `main`.

## 3. Money and approved art

1. **Nothing that costs real money without an explicit yes.** PixelLab generations and anything else paid. Each paid job has a cap the user sets. Inside it, Claude shows every batch before running it: the prompts, what they make and the total price; the user's yes covers that batch only, and the results go to the picker page. Free tools are used where they give the same quality; for pixel art nothing free has matched PixelLab so far, so Claude does not draw it by hand instead.
2. **Who spends.** Only the controller chat spends; build chats never do.
3. **Balance and log.** During PixelLab work every reply ends with the generations left, and every paid call is logged with its price and the running total.
4. **Approved art.** Art the user approved is not redone, fixed or regenerated without their yes, and Claude does not act on its own audit findings.
5. **One art set at a time.** One set per pass, approved and merged before the next starts.
6. **Usage is money.** The user's usage credits are real money, the same as any paid tool. Before Claude starts or restarts another chat, a helper agent or a workflow, or any job that reads the whole code or the big docs, it says roughly how big the job is (model and strength, how many helpers, what it reads) and waits for the user's explicit yes. No yes, no start. A yes covers that one job only.

## 4. Running the work

1. **One build, one fresh chat.** A chat that finished a build gets no new job and is closed when its work is merged.
2. **Progress.** A long job shows how far it is. This goes into the status overlay as rough progress per job, not an exact countdown.
3. **Balance numbers are Claude's.** The user says what they feel when they play; tuning and pacing are settled by Claude with the sim and reported, not asked.
4. **One sim at the end.** Jobs that change the game's balance are all finished first; then one full sim balances everything before the release. A single job may run a short sim (the first hours of play, one seed) only to catch a broken game: finished far too fast, stuck, numbers exploding.
5. **Model for build chats.** Sonnet at medium strength is the default Claude suggests when it asks which model and strength a new chat runs on (rule 1.7); the user can change it.
6. **The brief.** When one chat starts another, it writes the instruction as a complete spec the new chat can follow with nothing else: what to build in the starting chat's own words, with one concrete example; the user's words on it, quoted with dates; what is already decided and what was tried and rejected; the files; what done looks like and what to show the user; what it must not do. If the starting chat is not sure what the user meant, it asks the user before writing the brief.
7. **A confused chat asks, it does not guess.** A build chat that is unsure what is wanted sends one short question to the chat that started it and waits; that chat answers, or asks the user if it cannot.

## 5. Chats and releases

1. **Merged is not released.** After a merge, Claude says in one line that the work is merged but not yet released.
2. **The controller chat** talks to the user, plans, writes briefs, merges and releases. It runs on the smartest model, so it stays short: it clears itself between builds and keeps what is in flight in a short hand-over note.
3. **A build chat does one job.** Before it is closed it writes a closing note of about 20 lines: what it built, the user's decisions in their words, what was rejected, what is left.
4. **Closing notes go into one folder.** The controller reads them only when asked; closed chats are not re-read. The folder is `C:\Basic Incremental\design\closing-notes\` (local, not in the repo).
5. **Release size.** Merged work is collected into releases of about 10 points: a small change counts 1, a big one 3 to 5. Claude gives the points and says the count. A job bigger than that is split sensibly over several releases.
6. **Before a release** Claude lists what the player will see differently and waits for the user's OK.
7. **A broken release is fixed at once.** A fix for a release that broke the game does not wait for 10 points.

## 7. Git and GitHub

1. **Latest code first.** A chat fetches the newest code before it starts.
2. **One chat, one worktree.** A build chat works in its own copy of the project folder; the copy is removed when its work is merged.
3. **Nothing goes straight into `main`.** Work goes through a branch and a PR. No force-push, and `main` is never deleted (the last two are also blocked by `.claude/settings.json`).
4. **Merge only when the checks pass** on a branch brought up to date with `main` first; squash merge.
5. **Version tags are never reused or moved.** A bad release is fixed by a newer version.

## 8. Docs

1. **DESIGN.md is the truth for game design** and is never contradicted without asking the user. UI_RULES is for UI, ASSET_RULES for art.
2. **One current text per rule.** A rule in DESIGN is rewritten where it stands, never patched with an "update" section below it, and carries a tag saying whether the game has it yet. Tags change in the same PR as the code.
3. **The project overview is updated in every PR that changes the code.**
4. **A plan doc is deleted by the PR that builds it.** Exact numbers live in the data files, not in DESIGN.
5. **Whose decision it is.** Rules 1.2 and 1.3 applied to the docs: what a chat filled in is tagged Default and listed under Open questions, and becomes decided only on the user's explicit yes; the user's decisions carry their words and the date.
6. **Decisions are written into DESIGN before the code.** A decision never lives only in a chat's memory.
7. **A chat reads only what its job touches.** The brief names the parts of DESIGN and the overview to read; nobody reads both files whole. Graphics jobs read the graphics rule file, which carries a short description of the game's style to follow.
8. **Only good models touch the rules and the docs.** The rule files, the overview and DESIGN are written and changed only by Opus or Fable, at medium to high strength.

## 9. Code

1. **Content in data files.** Cards, resources, dungeons and cosmetics live in data files checked by schemas, and every tunable number goes through the modifier pipeline.
2. **Game logic apart from the screen.** `src/game` knows nothing of the UI, so it can be tested alone; the renderer holds no game rules. Game logic is written test first.
3. **`break_eternity.js` for all game numbers.**
4. **A save format change** needs a version bump, a migration and a migration test.
5. **Verify before saying done:** lint, tests, build, and a run or screenshot for UI.
6. **Dev cheats never ship**, and layouts holding pixel art use whole pixel scales.

## 10. Tools and art

1. **Tools.** Before installing anything on the user's PC, Claude asks once. After the yes it uses the tool and does not ask again for that tool. It never fakes a tool's work by hand.
2. **Weapon style.** The weapon sprites now in the game are the style to keep.
3. **Reference art** is studied, never copied or put into the game.
4. **Art helper files** (the pixel-art agent and skill) follow these rules wherever they overlap.
5. **Asset packs** the user picked are allowed, each with a credit line.
6. **Reuse.** For icons, a picture already in the game is used again where it fits instead of making a new one. Not for weapons: every weapon has its own sprite.
