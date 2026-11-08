# src/renderer — UI layer

Owned by the `ui` agent (`.claude/agents/ui.md`). Import game code only from `../../../game` and `../../../data` (no deep imports). No game rules here: adapters turn state into view models. UI rules and conventions (including 5 options first): `docs/UI_RULES.md`. New game data or rules belong to the `mechanics` agent. See `docs/WORK_SPLIT.md`.
