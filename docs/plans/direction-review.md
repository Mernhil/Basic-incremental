# Plan: Graphify + direction review, bug fixes and optimization

Approved in the home chat on 2026-11-10. Goes in `docs/plans/direction-review.md` and is deleted by the PR that carries it out.

## Fable's role

Fable is the direction engineer. It reads where the game is going and brainstorms what comes next: mechanics, balance, ideas and how to build them. It also fixes bugs and makes safe optimizations. Design stays with the user (DESIGN "How this document works", rule 3): ideas and design changes are proposals the user picks in the home chat, while bugs and optimizations that do not change the design are fixed directly.

The job produces two PRs, merged in order:

1. **Direction PR:** Graphify, plus `docs/DIRECTION_REVIEW.md`. No code changes.
2. **Fixes PR:** bug fixes and optimizations, plus the overview update.

## Part A: Graphify

1. The user approved Graphify in the home chat (CLAUDE.md rule 3). Check whether it is already installed. `graphify-out/` is already in `.gitignore`.
2. If it is missing, install the official package (`pip install graphifyy`), pin the version in the PR description, and run `graphify install`.
3. Build the graph (`/graphify .`). The output stays local.
4. Do not run `graphify claude install`, because it would change CLAUDE.md and add a Glob/Grep hook. Recommend whether to turn it on in the review.

## Part B: Direction review (`docs/DIRECTION_REVIEW.md`)

Read CLAUDE.md, PROJECT_OVERVIEW.md, DESIGN.md (including the changelog), UI_RULES.md and ASSET_RULES.md in full, and use the graph to trace systems through the code. The review is a snapshot: it is deleted by the PR that writes the user's chosen direction into DESIGN.md. It has these sections:

1. **Where the game is going.** Fable's read of the vision and direction, drawn from the decisions and the changelog. For each loop (production, cards and weapons, dungeons, summon, cosmetics, Ascension, account), say what it is meant to feel like, where it stands, and what holds it back.
2. **Every unfinished rule.** Cover each `[To build]`, `[Differs]`, `[Default]` and `[Proposed]` rule and every Open questions line in the three rule docs. For each one give:
   - what it is;
   - what the code does today;
   - a release verdict (Blocker / Ship as is / Ship with the default / Defer / Cut candidate);
   - size (S/M/L);
   - dependencies and risks;
   - how Claude would build it.
3. **Tag drift.** List every rule whose tag does not match the code.
4. **Pacing and balance.** Run `npm run sim -- --hours 40 --seeds 5`. Give each milestone's target, median and spread, explain why the misses happen, and propose a balance approach for the user to approve. Do not retune anything yet.
5. **Play-through.** In a dev profile (`BI_PROFILE=direction`), play a new game with screenshots or probes. Note:
   - dead ends and unreachable content;
   - placeholders;
   - flat spots;
   - bugs.
6. **Ideas.** Mechanics, systems and content that fit DESIGN §1 and the direction above. For each idea give:
   - the problem it solves;
   - what the player sees;
   - how it is built;
   - size;
   - its effect on pacing and the save format.
   Ideas are proposals only and are not written into DESIGN.md.
7. **UI and art direction.** Read docs/UI_RULES.md and docs/ASSET_RULES.md in full. Give Fable's read of the interface and the art, screen by screen and asset family by asset family. Cover:
   - where the look and layout are heading, judged from the user's picks and the changelogs;
   - what is inconsistent, cramped, unclear or unfinished;
   - which screens still show placeholder or interim art;
   - accessibility problems found with the `a11y-*` scripts.

   Then give UI and art ideas, each with:
   - the problem it solves;
   - the screens or assets it touches;
   - its size;
   - whether it needs new art.

   These are text proposals only. Do not make mockups or art here: under "Five options first", a chosen direction gets its 5 mockup options in the home chat later, and all art is made with PixelLab in a session that has it.
8. **Five release scopes.** Five options that differ in ways that matter, from smallest to biggest. For each, say what is in it, what is cut, what ships on defaults, and its rough phases. Do not pick one.
9. **Decision list.** Every question the user must answer, short, each with a recommendation.
10. **Phase sketch.** The order of plan-doc-sized phases after the user decides, and which phases need the strongest model.
11. **Fixes made.** What the fixes PR fixed and optimized. This is filled in when the fixes PR merges.

## Part C: Fixes PR

After the direction PR merges, open a second branch and worktree from an updated `main`.

**What it covers.**
- Fix the bugs and the tag drift found in Part B, including UI bugs such as broken layouts, overflow, focus and accessibility failures, as long as the look stays the same.
- Make optimizations that leave game behaviour unchanged: performance (tick loop, offline, renderer frame cost, startup, bundle size), dead code, and duplicated logic.

**What it must not touch.** Every change must leave the design and the numbers as they are. Keep out:
- content data values;
- pacing;
- save format;
- rules;
- the look.

Anything that would need one of these goes back into the review as a proposal.

**How it is verified.**
- `npm run lint`, `npm test` and `npm run build` pass.
- The balance sim, run with the same seeds before and after, gives the same results. This shows behaviour did not change.
- A screenshot of each screen that was touched.

**Overview and PR description.**
- `docs/PROJECT_OVERVIEW.md` is updated if `src/` changes.
- Tags change only where drift was fixed.
- The PR lists each fix and each optimization, with a before/after figure for the performance ones.

## Rules for this job

- Follow the CLAUDE.md workflow for both PRs: fetch first, one worktree per PR, real CI on the up-to-date branch, squash-merge, then report in one or two lines.
- The direction PR deletes this plan doc. The fixes PR adds section 11 to the review.

## Done when

- Graphify is installed and its version is named.
- `docs/DIRECTION_REVIEW.md` is on `main` with all eleven sections.
- The fixes PR is merged with an unchanged sim and green CI.
