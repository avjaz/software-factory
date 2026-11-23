---
id: ticket-queue
title: Find, parse and validate the next pending ticket, and guard against unmerged branches
design: ['4', '5', '7.2']
---

## What to build

- A ticket parser for `ticket.md` that applies every rule in §5, including that each `design` section exists in the target's `docs/design.md` and is non-empty. A section is a Markdown heading starting with that number (`## 5.`, `### 5.3`) and runs until the next heading of the same or higher level.
- A queue reader: lists `docs/tickets/pending/NN-<id>/` folders, sorted by prefix, and returns the first as a parsed ticket plus its test files (every file in the folder except `ticket.md`, with its repo-relative target path).
- The refusals listed at the top of §7.2, run in the order listed there. Wire them into `factory next`, which for now stops after picking the ticket and prints `next ticket: <NN-id>` with exit 0. Ticket 05 replaces that.

## What already exists

Tickets 01–03. The tiny repo has `01-greet` and `02-farewell`.

## Out of scope

Worktrees and running anything.

## Acceptance criteria

- On a fresh tiny repo, `factory next` prints `next ticket: 01-greet`.
- With `01-greet` moved to `done/`, it prints `next ticket: 02-farewell`.
- With no pending folders: exit 2, `no pending ticket`.
- A local branch `factory/greet` that is not merged into `main`: exit 2, `unmerged factory branch: factory/greet`. Once it is merged into `main`, the refusal goes away.
- Each of these makes the ticket invalid, with exit 2 and a message naming the field: missing `id`; `id` not matching the folder (`01-greet` with `id: hello`); an unknown header key; a header that is not valid YAML; empty body; no `## Acceptance criteria` section or an empty one; `design: ['9']` when the design doc has no section 9; a design section with a heading but no text.
- A pending folder name without a two-digit prefix (`greet/`) is invalid: `ticket folder must be NN-<id>: greet`.
- The returned test files for `01-greet` are exactly `acceptance/greet.sh`.
