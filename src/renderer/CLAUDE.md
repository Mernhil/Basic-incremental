# src/renderer — UI layer

Owned by the `ui` agent (`.claude/agents/ui.md`). Import game code only from `../../../game` and `../../../data` (no deep imports). No game rules here: adapters turn state into view models. Any visual change needs 5 options first. New game data or rules belong to the `mechanics` agent. See `docs/WORK_SPLIT.md`.
