# Plans

A plan doc is the approved plan for one piece of work, written by the controller chat and handed to a build chat together with its brief. It is one-use: the PR that implements it deletes it (`CLAUDE.md` rule 8.4). Only this README stays in the folder; `npm run lint` (`scripts/check-workflow.mjs`) fails CI when any other file is still here on a PR into `main` or on `main`.
