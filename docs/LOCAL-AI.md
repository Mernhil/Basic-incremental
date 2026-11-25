# Local AI: how work is split

A local coding model runs on the user's PC next to Claude Code:

- llama.cpp server, started with `C:\LocalAI\start-solo.bat` (or `start-with-comfyui.bat` while ComfyUI is open).
- OpenAI-compatible endpoint `http://127.0.0.1:8080/v1`, model id `qwen-coder`, any API key.
- Qwen3.6-35B-A3B (Q4), about 59 tokens/s out; context 64K tokens in solo mode, 32K in ComfyUI mode.
- Used from VS Code through Cline. Cline reads `.clinerules` (its rules) and `.clineignore` (what it never loads).

## Who does what

**Local model (Cline), one task card at a time:**

- balance-number tweaks in `src/data/content/*.json`;
- adding single entries to an existing family (an achievement, a cosmetic, a card or item, a quest);
- one self-contained screen or component;
- a small bug fix inside one system;
- explaining code.

**Claude Code:**

- anything touching several systems at once;
- save-format changes, new systems, refactors;
- big sectioned prompts and briefs, art and look work (the art controller);
- all git and GitHub work: branches, commits, PRs, merges, releases;
- reviewing every change the local model made.

## Task cards

A task for the local model is written as a card in `docs/local-tasks/`, from `TEMPLATE.md`, with a short file name (`tune-ember-crypt-drops.md`). The user pastes it into Cline. When a request is small enough, Claude Code may suggest writing a card instead of doing it itself, and writes the card.

## Review loop

1. The user runs the task card in Cline. The local model edits files and runs typecheck and tests; it does no git.
2. The user asks Claude Code to review the uncommitted diff (`git diff`).
3. Claude Code checks it against `docs/DESIGN.md`, the card's acceptance checks and the tests, fixes or flags problems, then puts it on a branch and PR the usual way.

## Asking the local model from the terminal

`npm run ai:local -- --ping` says whether the server is running. `npm run ai:local -- "question" path/to/file.ts` sends the question with the files' contents and prints the answer (`scripts/ask-local.mjs`, dev only, never packaged). Claude Code may use it for cheap bulk jobs, such as summarising a large file or drafting repetitive data entries, and always checks the output before using it.
