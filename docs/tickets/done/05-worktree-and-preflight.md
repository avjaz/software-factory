---
id: worktree-and-preflight
title: Create the run worktree and prove main is green and the ticket is red
design: ['7.1', '7.2', '7.3']
---

## What to build

- A `Git` interface and its implementation over the `git` CLI, run on the host: add a worktree on a new branch, status, diff against the base, add-all and commit with a given identity, remove a worktree.
- A `Make` interface that runs a target in a directory and returns the exit code and combined output.
- Steps 2–5 of §7.2: the worktree at `.factory/worktrees/<repo>-<id>`, baseline `make verify`, copying the test files in, `make acceptance` red-check.
- `factory check --repo <dir> --ticket <NN-id>`: steps 2–5 for the named ticket. On success it prints `ok: main is green, <NN-id> is red` and exits 0; then it removes the worktree and deletes its branch. On `baseline_red` or `ticket_already_green` it prints the outcome and the output tail, exits 1, and also cleans up.
- `factory next` runs steps 1–5. It stops after step 5 and prints `pre-flight ok` until ticket 07 adds the loop.

## What already exists

Tickets 01–04, and the harness options `broken` and `alreadyGreen`.

## Out of scope

The worker, integrity, commits and reports.

## Acceptance criteria

- `check --ticket 01-greet` on a fresh tiny repo: exit 0, the `ok` line, and afterwards no worktree and no `factory/greet` branch.
- On a `broken` tiny repo: exit 1 with `baseline_red`.
- On an `alreadyGreen` tiny repo: exit 1 with `ticket_already_green`.
- `next` on a fresh tiny repo: the worktree exists at `.factory/worktrees/<repo>-greet` on branch `factory/greet`, containing `acceptance/greet.sh`, and the target repo's own checkout is unchanged.
- `next` when `.factory/worktrees/<repo>-greet` already exists: exit 2 with `worktree already exists: <path>`.
- `check --ticket 09-nope`: exit 2 with `no such pending ticket: 09-nope`.
