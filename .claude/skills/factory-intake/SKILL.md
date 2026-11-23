---
name: factory-intake
description: Grill the user about a feature for a factory target repo, then write the target's docs/design.md and one pending ticket per agreed slice, in the factory's ticket format. Use when the user wants to plan work for a target repo, write factory tickets, or says "intake" or "factory-intake". Writes no tests, and commits its own files only when the user says yes.
---

# Factory intake

You turn what the user wants into a design and pending tickets in a **target repo** (not this
factory repo). The format is the factory's `docs/design.md` §4 and §5. This repo's own
`docs/design.md` and `docs/tickets/` came from a session like this one and show the output to aim
for.

If the user has not named the target repo, ask for its path first.

## Hard rules

- **Write no tests.** No acceptance files, no test code, nothing in the ticket folder except
  `ticket.md`. Tests are a separate skill's job, run later in a fresh context.
- **Commit only on the user's yes** (see Finish). One commit in the target, of your own files only.
  No push, no branches, no other git changes.
- **Change nothing but** the target's `docs/design.md` and the new `ticket.md` files. Never edit
  code, tickets in `done/`, or existing pending tickets unless the user asks.
- **Don't use Claude Code memory.** Don't write or update memory files, and don't act on memory
  loaded into the session: plans for the factory itself are not this session's work. Everything
  that should last goes in the target's design or tickets.
- **Number after the highest existing ticket** (see Numbering). Never reuse or renumber.

## 1. Read before asking

Read these in the target first. Do not ask the user anything they already answer:

- `docs/design.md`: its numbered sections are what tickets reference.
- Every ticket in `docs/tickets/pending/*/ticket.md` and `docs/tickets/done/*.md`.
- `.factory.yaml`, `CLAUDE.md`, and enough of the code, seed data, and existing tests to know what
  exists: which classes, which tools or endpoints, which seed users, ids, codes and amounts.

## 2. Grill

Interview the user relentlessly about every part of the feature until you reach a shared
understanding. Walk each branch of the design tree and settle the decisions that others depend on
first.

- Ask **one question at a time**.
- Give **your recommended answer** with each question, and say why in a sentence.
- If the target repo can answer a question, **look it up instead of asking**. Then state what you
  found, so the user can correct it.
- Keep a running list of decisions. Don't revisit a settled one unless a later answer conflicts
  with it; if one does, say so and ask.

Then agree on the **slices**: small tickets, each a single behaviour the worker can finish in one
run, in the order they should run. Push for small.

Keep grilling each slice until its acceptance criteria meet this bar:

- **Concrete examples, not rules.** Real seed values from the target: the actual caller names, ids,
  codes, amounts and messages. Never a placeholder like "a valid user" or "an unknown id".
- **One line per behaviour**: the input or request, then the exact result.
- Errors and edge cases get their own lines, with the exact code or message.
- **The test is: could a fresh agent write the tests from this ticket and the design sections it
  names, without guessing?** If not, ask more.
- If a criterion needs a value the seed data does not have, agree on the new value with the user
  and say in the ticket that the seed must gain it.

## 3. Confirm, then write

Show the user the slice list (number, id, title, one-line summary) and any design changes. Write
only once they agree.

### Design

Write or update the target's `docs/design.md`:

- Record the decisions from the session in the right sections.
- **Never renumber existing sections.** Tickets in `done/` cite them. Add new sections or
  subsections after the existing ones.
- Each section a ticket cites must have text under its heading.

### Numbering

Find the highest two-digit number `NN` among the folders in `docs/tickets/pending/` (`NN-<id>/`)
and the files in `docs/tickets/done/` (`NN-<id>.md`). The new tickets start at that number plus
one, two digits, in slice order. If there are none, start at `01`. Ignore files whose names do not
start with two digits and a hyphen.

### Tickets

Write one `docs/tickets/pending/NN-<id>/ticket.md` per slice:

```markdown
---
id: <id>
title: <What the commit will say>
design: ['<section>', '<section>']
---

## What to build

<The behaviour, in a few sentences.>

## What already exists

<Real file and class names, so the worker does not rebuild them.>

## Out of scope

<What not to do, including the later slices.>

## Acceptance criteria

- <input or request> gives <exact result>
```

- `id`: lowercase words joined by single hyphens; equal to the folder name without `NN-`.
- `title`: required and non-empty.
- `design`: optional; only sections that exist in `docs/design.md` and have text.
- No other header keys. The body must have `## Acceptance criteria` with at least one item.

## 4. Validate

From the factory root (this repo), for each new ticket:

```
corepack pnpm -s factory validate-ticket --repo <target> --ticket NN-<id>
```

Exit 0 means the ticket is valid. Exit 2 prints what is wrong: fix the ticket or the design, then
run it again. Don't finish until every new ticket passes.

## 5. Finish

Tell the user which files you wrote or changed, then ask: **"Commit these to `<target>`?"**

- On a clear yes: in the target, `git add` exactly those paths (`docs/design.md` and the new
  `docs/tickets/pending/NN-<id>/ticket.md` files), then `git commit` with the message
  `Intake: <feature in a few words>` and a body listing the new tickets. Don't use `git add -A` or
  `git add .`. If the target has other uncommitted changes, leave them out and say so. Report the
  commit SHA.
- On anything else: commit nothing and say the files are uncommitted for them to review.

Then give the next step: the acceptance-test author writes each ticket's tests in a fresh session
(design §11.2).
