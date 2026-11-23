---
name: factory-acceptance-author
description: Turn one pending factory ticket in a target repo into red acceptance tests, one per acceptance criterion, or into open questions when a criterion can't be tested without guessing. Use when the user wants the acceptance tests for a factory ticket written, or says "acceptance author" or "factory-acceptance-author". Run in a fresh session with one ticket. Commits the ticket's folder only when the user says yes.
---

# Factory acceptance author

You write the acceptance tests for **one pending ticket** in a **target repo** (not this factory
repo). The factory's worker will later write the code that makes them pass, and the tests are the
only judge of that work. So they must test exactly what the ticket says: no more, no less, and
nothing guessed.

You need the target repo path and the ticket, as `NN-<id>` or as the path
`<target>/docs/tickets/pending/NN-<id>/`. If the user has not given both, ask for them first.

## Hard rules

- **Read only what §1 lists.** Not the app's code, not other tickets, not git history. The tests
  must follow from the ticket and design alone, as the worker will read them.
- **Never guess.** If a criterion leaves a value, a format, a status or an order open, it becomes a
  question (§2), not a test.
- **Write only inside the ticket's pending folder** `docs/tickets/pending/NN-<id>/`. Never edit the
  repo's own `acceptance/` files, code, design, or other tickets. The only change you may make to
  `ticket.md` is appending `## Open questions`. The one exception is the throwaway stub in §4,
  which lives in a temporary directory outside the repo and is deleted afterwards.
- **Commit only on the user's yes** (see §6). One commit in the target, of the ticket's pending
  folder only. No push, no branches, no other git changes.
- **Don't use Claude Code memory.** Don't write or update memory files, and don't act on memory
  loaded into the session: plans for the factory itself are not this session's work.

## 1. Read

In the target, read only:

- `docs/tickets/pending/NN-<id>/ticket.md`.
- The sections of `docs/design.md` named in the ticket's `design:` header, including their
  subsections. If a section the criteria depend on is not named, that is a question (§2).
- The existing acceptance harness under `acceptance/`: the runner and every existing test. They show
  the language, file layout, naming, how a test reaches the app (for example `BASE_URL`), and how a
  failure is reported. Follow them exactly.
- `.factory.yaml`, to know the pack.

## 2. Judge each criterion

For each line under `## Acceptance criteria`, ask: **could a fresh agent write a test for this
from what I have read, without guessing?** It can only if the line, or a design section the ticket
names, gives the exact input and the exact expected result (status, body, field values, order,
message).

If any criterion fails that test, write no tests. Append this to `ticket.md`, one numbered question
per gap:

```markdown
## Open questions

1. Criterion "<the criterion's text, quoted>": <what is missing>. <A concrete proposal, for example
   the exact body you would assert.>
```

Each question names the criterion it blocks and asks for one decision. Then go to §6 and stop. The
user answers by amending the ticket, then runs you again in a fresh session.

## 3. Write the tests

Write **one test per acceptance criterion**, in criterion order, into the ticket's pending folder at
the path it will have in the repo. The factory copies every file in the pending folder except
`ticket.md` to the same relative path at run time, so `acceptance/tests/x.sh` in the folder becomes
`acceptance/tests/x.sh` in the repo.

- Use the harness's language and style. Match an existing test's structure, comments and failure
  messages.
- Name each file after the behaviour, with the ticket's id first so files from different tickets
  never clash, for example `acceptance/tests/list-holidays-year-2026.sh`.
- Open each test with a comment that quotes its criterion.
- Assert exactly what the criterion says. Use its literal values: compare a whole body when the
  criterion gives a whole body, and only the named fields when it names fields.
- On failure, print the request, the expected value and the actual value.
- **Every failure prints its message.** A test must never exit early without saying why. Under
  `set -e` (or the harness's equivalent), a command that can fail as part of a check, such as
  `grep` that finds nothing inside `$(…)` or a pipeline, must be guarded (`|| true`, or an
  `if`) so the script reaches its own failure message.
- Tests must be independent: no shared state, any order, each can run alone.
- No new tools, libraries or harness changes. If a criterion can't be tested with the existing
  harness, that is a question (§2).

## 4. Prove the tests can pass and fail

A red check only shows that the tests fail. Before it, show that each test passes against a correct
app and fails with its message against a wrong one:

1. Write a throwaway stub of the app outside the target repo, in a temporary directory (for example
   from `mktemp -d`). It answers exactly what the criteria and design sections say, and nothing
   more. Use a tool the machine already has (for example `python3 -m http.server` with a small
   handler, or a short script); don't install anything.
2. Start it, wait until it answers, and run every test against it the way the harness does (for
   example with `BASE_URL` pointing at it). Every test must pass. If one fails, fix the test, not
   the stub, unless the stub disagrees with the criterion.
3. Run every test with nothing listening (for example `BASE_URL=http://127.0.0.1:1`). Every test
   must fail and print its message.
4. Stop the stub and delete its directory. The stub is never saved, never goes in the pending
   folder, and is never offered to the user as code.

Report both results. Then prove red against the real app.

## 5. Prove red

From the factory root (this repo), run:

```
corepack pnpm -s factory check --repo <target> --ticket NN-<id>
```

It checks out `main` in a fresh worktree, runs `make verify` there, copies your test files in, and
runs `make acceptance`. It needs no API credit; expect a minute or two.

- Exit 0 and `ok: main is green, NN-<id> is red`: the tests are red, as they should be. Below that
  line the check prints the end of the `make acceptance` output; report from it which of your tests
  failed and which passed. A criterion that the current app already meets (such as "`GET /health`
  still gives 200") passes now; say so, but don't drop it. Every other test should fail: if one of
  yours passes and its criterion is new behaviour, the test is too weak; fix it and check again.
- Exit 1 `ticket_already_green`: every test passes before any work. Either the ticket is already
  done or the tests don't test it. Report this and stop without committing.
- Exit 1 `baseline_red`: `main` itself fails `make verify`. Not your tests' fault. Report the tail
  and stop without committing.
- Exit 2: a refusal (for example an invalid ticket, or a leftover worktree). Report the message and
  stop.

If one of your tests fails for the wrong reason (a syntax error, a wrong path, a harness misuse),
fix it and run the check again.

## 6. Finish

Tell the user:

- which files you wrote (or that you appended open questions, and how many);
- for tests: the `factory check` result and which tests are red and which already pass;
- the output of `git status --short` in the target, which should show changes only inside the
  ticket's pending folder.

If you wrote open questions, or the check did not end in exit 0, stop here: commit nothing.

If the tests are red, ask: **"Commit the tests for NN-<id> to `<target>`?"**

- On a clear yes: in the target, `git add docs/tickets/pending/NN-<id>/` and nothing else, then
  `git commit` with the message `Acceptance tests: NN-<id>` and a body listing the test files. If
  the target has other uncommitted changes, leave them out and say so. Report the commit SHA.
- On anything else: commit nothing and say the tests are uncommitted for them to review.

Then give the next step: `factory next --repo <target>` runs the lowest-numbered pending ticket.
