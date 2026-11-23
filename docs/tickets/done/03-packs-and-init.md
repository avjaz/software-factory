---
id: packs-and-init
title: Load pack manifests and implement factory init
design: ['4', '6']
---

## What to build

- A pack loader: reads `packs/<name>/manifest.yaml` from a packs root (the factory's `packs/` by default; tests pass the fixture root), validates it (`name` equal to the folder name, `sealed` a non-empty list of globs, `network` a list of hostnames, no other keys) and checks that `Makefile` and `CLAUDE.factory.md` exist.
- A `.factory.yaml` loader for target repos (`pack` required, `sealed` optional list, no other keys).
- `factory init --repo <dir> --pack <name>`, exactly as §6 describes.

## What already exists

The CLI stub (01) and the fake pack and `createTinyRepo` (02). The tiny-repo template already has its pack files; give `createTinyRepo` an option `uninitialised` that leaves out the `Makefile`, `CLAUDE.factory.md`, `CLAUDE.md` and `.factory.yaml`.

## Out of scope

The Java pack (ticket 10). Committing anything.

## Acceptance criteria

- `init --pack fake` on an uninitialised tiny repo creates `Makefile` (byte-identical to the pack's), `CLAUDE.factory.md`, `.claude/skills/<the pack's skills>` and `.factory.yaml` containing `pack: fake`, and a `CLAUDE.md` whose only line is `@CLAUDE.factory.md`. Exit 0. Nothing is committed.
- When `CLAUDE.md` already exists without the import line, `init` appends it once; running `init` again does not add a second.
- Running `init` twice leaves the same file contents as running it once; an existing `.factory.yaml` with an extra `sealed` entry is kept unchanged.
- `init` on a repo with uncommitted changes exits 2 with `working tree is dirty`.
- `init --pack nope` exits 2 with `unknown pack: nope`.
- A manifest with an unknown key, an empty `sealed`, or a `name` not matching its folder fails to load with a message naming the problem.
- `init` on a directory that is not a git repo exits 2 with `not a git repo`.
