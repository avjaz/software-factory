---
id: acceptance-author-skill
title: Add the factory-acceptance-author skill that turns a ticket into red tests or questions
design: ['3', '5', '7.1', '11.2']
---

## What to build

A Claude Code skill at `.claude/skills/factory-acceptance-author/SKILL.md`, as §11.2 describes. Given one pending ticket path, it:

- reads only the ticket, the design sections it names, and the target's existing `acceptance/` harness: its runner and tests show the language, layout and style to follow;
- either writes one test per acceptance criterion into the ticket's pending folder at the paths they will have in the repo, then runs `factory check` and reports the result;
- or, if any criterion is ambiguous or missing, appends `## Open questions` to `ticket.md`, one numbered question per gap, each naming the criterion it blocks, and writes no tests;
- after red tests, asks whether to commit, and on a yes commits only the ticket's pending folder, in one commit, never pushing;
- never edits anything outside the ticket's pending folder, and never reads or writes Claude Code memory.

## What already exists

`factory check` (05) and `validate-ticket` (11). `intake-demo`: a Java skeleton with the NZ public holidays design and pending tickets 01 to 04 from ticket 11's session. Its harness is `acceptance/run.sh`, which runs each `acceptance/tests/*.sh` with curl against `BASE_URL` (see `acceptance/tests/health.sh`).

## Out of scope

Reviewing the tests: the user does that before saying yes to the commit.

## Acceptance criteria

- Run in a fresh session on `intake-demo`'s `01-list-holidays`, it writes one test per acceptance criterion into that ticket's folder, and `factory check` reports them red.
- Run on a copy of `intake-demo` where `01-list-holidays`'s first criterion reads "`GET /holidays?year=2026` returns that year's holidays", it writes no tests and appends an open question naming that criterion.
- After each run, before any commit, `git status` in the target shows changes only inside the ticket's pending folder.
- The skill's text tells it to commit only the ticket's pending folder and only on the user's yes, and never to read or write Claude Code memory.

Amended 20 Nov 2026: the target moved from procurement-mcp's `01-get-purchase-order` (abandoned with ticket 11's procurement intake) to `intake-demo`'s `01-list-holidays`, and the harness is whatever the target already has. Commit-on-yes and no memory match the intake skill (ticket 11). Session transcripts are not kept in the repo; the commit message records what each session showed. After the first session, the skill gained two steps: every failure prints its message (one test there died silently under `set -e`), and the tests are run against a throwaway stub before the red check.
