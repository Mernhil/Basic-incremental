# Prompt for Claude Code

Read CLAUDE.md first. Task: land the design-doc cleanup made in claude.ai. The four patches are in `design-cleanup/` at the repo root (not committed).

1. `git fetch`, then create the branch `docs/design-one-version` from `origin/main`.
2. `git am design-cleanup/*.patch`. If a patch does not apply because `main` moved, stop and tell me which file.
3. Delete `design-cleanup/`. Run `npm run lint`, `npm run typecheck`, `npm test` and `npm run build`.
4. Run the WORK_SPLIT setup check: the agent files were changed together with `docs/WORK_SPLIT.md`, so they should already match.
5. Open one PR, "DESIGN.md as one tagged version + rule 5", summarising the four commits. Wait for CI, squash-merge, switch back to `main`.
6. From now on, follow CLAUDE.md rule 5 and the "How this document works" section of `docs/DESIGN.md` on every task.

What the patches do:

- `docs/DESIGN.md` rewritten as one current version: every rule tagged Built / Differs / To build / Default / Proposed; sections 11.x and 12 merged into the rules they changed; the 2026-11-08 decisions and the lost 2026-11-07 beta systems added; Open questions and a changelog at the end.
- `scripts/check-design.mjs`, run by `npm run lint` (so CI): fails on an untagged rule, an amendment-style heading or a missing Open questions / Changelog section.
- CLAUDE.md rule 5, the mechanics agent and `docs/WORK_SPLIT.md`, the pixel-art agent and skill, and `docs/BETA_PLAN.md` (no more "add a default to section 12").
- Every `DESIGN.md <number>` reference in code comments, tests and docs points at the new sections (comments only; typecheck, 787 tests and the build pass).
