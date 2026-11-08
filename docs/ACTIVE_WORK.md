# Active work

One line per task in flight, so parallel sessions do not collide. Read this at the start of every task; add your line when you start and delete it when your PR merges.

## Session rules

- **One session, one worktree.** Never switch branches in the main checkout (`C:\Basic Incremental`). Start with `git fetch && git worktree add C:/bi-<task> -b <branch> origin/main` and work there. When the PR merges, `git worktree remove C:/bi-<task>`.
- Two sessions never edit the same files. If your files overlap a line below, stop and tell the user.
- Untracked files in the main checkout (references, drafts) are the user's local files: never delete or move them. Work that must survive goes in a commit on your branch, or in `docs/handoffs/`.
- A session that stops mid-task writes a short note in `docs/handoffs/` (what is done, what is left, which files).

## In flight

| Branch                     | Worktree                                   | Owner agent    | Files / area                                                                     | Started    |
| -------------------------- | ------------------------------------------ | -------------- | -------------------------------------------------------------------------------- | ---------- |
| chore/session-coordination | C:/bi-coord                                | mechanics      | CLAUDE.md, docs/WORK_SPLIT.md, docs/ACTIVE_WORK.md                               | 2026-11-08 |
| feat-scythe-skins-b78d7b   | .claude/worktrees/feat-scythe-skins-b78d7b | mechanics + ui | weapon skins test (cards.json, save, wardrobe tab, art/pixel/hand/skin-scythe-*) | 2026-11-08 |
