---
id: integrity-check
title: Add the integrity check over sealed paths, copied tests and the Makefile
design: ['9']
---

## What to build

A function `checkIntegrity(worktree, base, pack, factoryYaml, copiedTests)` that applies the four rules of §9 and returns either `ok` or a list of `{ path, kind }` violations. It compares files against the base commit's tree, not against the worktree's git index, so a change staged through git is still caught.

## What already exists

The `Git` interface (05), pack and `.factory.yaml` loaders (03), and the test-file list (04).

## Out of scope

Calling it from the run loop (07).

## Acceptance criteria

On a tiny-repo worktree after pre-flight for `01-greet`:

- No other changes: `ok`.
- Adding `src/greet.txt`: `ok` (not sealed).
- Editing `acceptance/hello.sh`: `{ acceptance/hello.sh, modified }`.
- Deleting `acceptance/hello.sh`: `deleted`.
- Adding `acceptance/extra.sh`: `added`.
- Editing the copied-in `acceptance/greet.sh`: `test_mismatch`.
- Editing `docs/tickets/pending/01-greet/ticket.md`: `modified`.
- Editing `Makefile`: both `modified` and `makefile_mismatch`.
- A path listed only in the repo's `.factory.yaml` `sealed`, when edited: `modified`.
- Editing `.factory.yaml` to drop a sealed entry, then editing that path: both are reported, because the base's `.factory.yaml` is the one used.
- Changing `.git/config` in the main repo or the worktree's git dir: `{ .git/config, modified }`.
- Several violations at once are all reported, sorted by path.
