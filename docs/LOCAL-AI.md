# Local AI: how work is split

A local coding model runs on the user's PC next to Claude Code:

- The **Local Chat** background service (starts with Windows) serves the OpenAI-compatible endpoint `http://127.0.0.1:8080/v1`, any API key. It loads the requested model on the first request: after a model switch or 30 minutes idle that request waits 10-25 s, then answers are instant.
- Context is 64K tokens for every model.
- Used from VS Code through Cline. Cline reads `.clinerules` (its rules) and `.clineignore` (what it never loads).

## Models

The model id picks the model. Only one is loaded at a time and a switch reloads (10-25 s), so keep one model per session.

| Model id                       | Model              | Speed        | Use it for                                 |
| ------------------------------ | ------------------ | ------------ | ------------------------------------------ |
| `qwen-coder` (alias `qwen-q4`) | Qwen3.6-35B-A3B Q4 | ~55-59 tok/s | everyday work; Cline's default             |
| `qwen-q8-quality`              | the same model, Q8 | ~37 tok/s    | tricky logic, where mistakes cost the most |
| `qwen-fast`                    | Qwen3.5-9B         | fastest      | quick simple jobs; weaker                  |

Thinking is on by default. Adding `"chat_template_kwargs": {"enable_thinking": false}` to a request turns it off, which is much faster for simple, bulk or repetitive drafting (`--no-think` in the terminal helper).

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

`npm run ai:local -- --ping` says whether Local Chat is up (the model itself loads on first use). `npm run ai:local -- [--model <id>] [--no-think] "question" path/to/file.ts` sends the question with the files' contents and prints the answer; the default model is `qwen-coder` and a request waits up to 5 minutes, since the first one may wait for the model to load (`scripts/ask-local.mjs`, dev only, never packaged).

Claude Code may use it for cheap bulk jobs, such as summarising a large file or drafting repetitive data entries. It passes `--no-think` unless the job needs reasoning, keeps one model id for the whole session to avoid reloads, and always checks the output before using it.
