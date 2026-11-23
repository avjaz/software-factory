---
id: run-report
title: Write report.json, report.md and transcript.jsonl for every run
design: ['10', '7.3']
---

## What to build

- A run recorder that collects what §10 lists while a run proceeds, and writes the three files to `.factory/runs/<id>-<UTC timestamp>/` when it ends, whatever the outcome. Timestamps are `YYYYMMDDTHHMMSSZ`. Inject a `Clock` so tests are deterministic.
- `Worker` results carry `usage` (`inputTokens`, `outputTokens`, `costUsd`) and the raw messages for the transcript. Extend `ScriptedWorker` so each step can supply both.
- `factory next` prints the report directory as its last line.
- A JSON schema (or Zod schema) for `report.json`, used by the tests.

## What already exists

The run loop (07).

## Out of scope

Reports for refusals (exit 2): those write nothing.

## Acceptance criteria

- A `green` run's `report.json` validates against the schema and has: `outcome: green`, ticket id, base SHA, branch `factory/greet`, the commit SHA, the model from config, one attempt with status `done`, the step's tokens and cost, `integrity: ok`, `verifyExit: 0`, and timings for pre-flight, the worker turn and verify.
- An `escalated` run has 3 attempts, each with its verify exit code and output tail, the worktree path, and no commit SHA.
- An `integrity_violation` report lists the violations from §9.
- A `baseline_red` report has zero attempts and the verify output tail.
- `transcript.jsonl` has one line per scripted message, in order, across all attempts.
- `report.md` names the outcome on its first line, and per attempt shows the status, cost and verify result.
- Total cost in `report.json` equals the sum of the attempts' costs.
- Two runs of the same ticket write two separate directories.
