---
id: run-loop
title: Implement the attempt loop, outcomes and the commit on green
design: ['7.2', '7.3', '8.2', '8.3']
---

## What to build

- Steps 6–9 of §7.2 in `factory next`, against the `Worker` interface from ticket 02.
- The first-prompt builder from §8.2.
- Feedback for a failed verify: `make verify failed with exit <code>. Last <tailLines> lines:` followed by the lines.
- Mapping SDK or worker exceptions to `worker_error`.
- On exit, print the outcome and its exit code from §7.3. The report itself is ticket 08.

Composition: production wiring picks the real worker (ticket 09; until then, a placeholder that throws `worker not configured`). Tests inject a `ScriptedWorker`.

## What already exists

Tickets 01–06.

## Out of scope

The report files (08) and the real SDK worker (09).

## Acceptance criteria

All with tiny repo `01-greet` and a `ScriptedWorker`:

- Step 1 writes `src/greet.txt` (`greetings`) and returns `done`: outcome `green`, exit 0. Branch `factory/greet` has one new commit by `software-factory`, message `Ticket greet: <title>`, containing `src/greet.txt`, `acceptance/greet.sh` and `docs/tickets/done/01-greet.md`, with no `docs/tickets/pending/01-greet/`. The worktree is removed. `main` is unchanged.
- Step 1 writes nothing and returns `done`; step 2 writes the file: `green` after 2 attempts. The resume message contains `make verify failed with exit` and the failing script's output.
- Three steps that never fix it: `escalated`, exit 1, no commit, worktree kept. A 4th step is never requested.
- Step 1 returns `spec_defect` with evidence: outcome `spec_defect` after 1 attempt; verify does not run.
- Step 1 edits `acceptance/hello.sh`: `integrity_violation` after 1 attempt; verify does not run; no commit.
- The worker throws: `worker_error`, exit 1, worktree kept.
- With `maxAttempts: 2` in config, a never-fixing worker is asked twice.
- The first prompt contains the ticket body, design sections `1` and `2` in the order the ticket names them (give `01-greet` `design: ['2', '1']`), and `acceptance/greet.sh`.
- After a `green` run and a merge of `factory/greet`, the next `factory next` picks `02-farewell`.
