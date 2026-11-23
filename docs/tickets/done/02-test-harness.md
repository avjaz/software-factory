---
id: test-harness
title: Add the fixture target repo, the fake pack and the scripted worker
design: ['4', '6', '8.3']
---

## What to build

A harness that lets later tickets prove every run outcome end to end in seconds, with no model calls.

- **`tests/fixtures/packs/fake/`**: a pack in the §6 shape. Its `Makefile` implements:
  - `unit`: runs every `unit/*.sh`; fails if any fails.
  - `acceptance`: runs every `acceptance/*.sh`; fails if any fails.
  - `verify`: fails if the file `BROKEN` exists in the repo root, otherwise runs `unit`, then `acceptance`.
  - Manifest: `sealed: [acceptance/**, docs/tickets/**, Makefile, .factory.yaml]`, `network: []`.
- **`tests/fixtures/tiny-repo/`**: a template target repo using the fake pack. It has one passing `acceptance/hello.sh` (checks that `src/hello.txt` contains `hello`), `src/hello.txt`, one `unit/hello.sh`, `docs/design.md` with sections `1` and `2`, and two pending tickets:
  - `01-greet`: its pending folder adds `acceptance/greet.sh`, which checks that `src/greet.txt` contains `greetings`.
  - `02-farewell`: adds `acceptance/farewell.sh`, which checks `src/farewell.txt`.
- **`createTinyRepo(options)`**: a test helper that copies the template to a fresh temp dir, runs `git init`, commits it on `main`, and returns the path. Options: `broken` (adds `BROKEN`), `alreadyGreen` (also creates `src/greet.txt` with `greetings`).
- **`ScriptedWorker`**: implements the `Worker` interface (define it here, from §8.3: `start(prompt)` and `resume(message)`, each returning the finish result plus usage). It is built from a list of steps; each step writes or deletes files in the worktree, then returns a given result. It records every prompt and message it received.

## What already exists

The scaffold from ticket 01.

## Out of scope

Any factory command using the harness. That starts in ticket 03.

## Acceptance criteria

- `createTinyRepo()` returns a repo where `make verify` passes and `git status` is clean on `main`.
- `createTinyRepo({ broken: true })`: `make verify` fails.
- Copying `01-greet`'s `acceptance/greet.sh` into the repo makes `make acceptance` fail; then adding `src/greet.txt` with `greetings` makes it pass.
- `createTinyRepo({ alreadyGreen: true })` plus `greet.sh` copied in: `make acceptance` passes.
- A `ScriptedWorker` with two steps returns step 1's result from `start`, step 2's from `resume`, and records both inputs; a third call fails with `no more scripted steps`.
- Two `createTinyRepo()` calls give two independent directories.
