---
id: intake-skill
title: Add the factory-intake skill that grills the user into a design and pending tickets
design: ['3', '5', '11.1']
---

## What to build

A Claude Code skill at `.claude/skills/factory-intake/SKILL.md`, as §11.1 describes. It:

- builds on the `grill-me` approach: one question at a time, each with a recommended answer, explores the target repo instead of asking when it can;
- reads the target's `docs/design.md` and existing tickets (pending and done) first;
- keeps going until each agreed slice has acceptance criteria that meet the §5 bar (concrete values, one line per behaviour);
- writes or updates the target's `docs/design.md`, then one `ticket.md` per slice in `docs/tickets/pending/NN-<id>/`, numbered after the highest existing number;
- validates each ticket against the §5 rules before finishing (reuse the ticket parser from 04 through a `factory validate-ticket --repo <dir> --ticket <NN-id>` subcommand added here, exit 0 or 2);
- writes no tests; asks at the end whether to commit, and on a yes commits only the files it wrote, in one commit, never pushing;
- never reads or writes Claude Code memory.

## What already exists

The ticket parser (04). `grill-me` at `~/.claude/skills/grill-me/`. This repo's own `docs/design.md` and tickets came from such a session and are a model of the output.

## Out of scope

Writing acceptance tests (12).

## Acceptance criteria

- `factory validate-ticket` exits 0 on a valid ticket and 2, with the parser's message, on each invalid case from ticket 04.
- A recorded session (transcript saved under `docs/tickets/done/11-intake-skill/`) running the skill on a fresh skeleton repo with no design and no tickets (`intake-demo`, an NZ public holidays API) writes its `docs/design.md` and pending tickets numbered from `01`. Each passes `validate-ticket`. Its acceptance criteria name concrete values agreed in the session (exact dates, holiday names, error codes and messages).
- The skill's text tells it never to write tests, to commit only its own files and only on the user's yes, never to read or write Claude Code memory, and to number after the highest existing ticket.

Amended 20 Nov 2026: the recorded session first targeted procurement-mcp (OAuth, then get_purchase_order). That intake was abandoned in favour of a much simpler target with no existing design, so the session tests the skill rather than the procurement domain. The second recorded session was dropped; the numbering rule rests on the skill's text. The commit-on-yes and no-memory rules were added after the session, because intake sessions loaded and updated the factory's own Claude Code memory. The transcript was committed in 04e6f75 and removed with ticket 12: session transcripts are not kept in the repo.
