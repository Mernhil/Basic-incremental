# Plans

A plan doc is the approved plan for one piece of work, written in the Claude Desktop home chat and handed to a Code session together with its prompt. It is one-use: the PR that implements it deletes it (see "Workflow" in `CLAUDE.md`). Only this README stays in the folder; `npm run lint` (`scripts/check-workflow.mjs`) fails CI when any other file is still here on a PR into `main` or on `main`.
