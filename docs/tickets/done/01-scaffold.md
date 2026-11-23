---
id: scaffold
title: Scaffold the TypeScript factory repo and the factory CLI
design: ['1', '7.1', '14']
---

## What to build

- A pnpm TypeScript project at the repo root: strict TypeScript, ESLint, Prettier and Vitest, all set up as the `node-standards` skill prescribes, with 100% line and branch coverage per file enforced.
- A `Makefile` with `make test`: format check, lint, type-check, then unit tests with coverage.
- A `factory` CLI entry point (`pnpm factory <command>`) with the subcommands `init`, `next` and `check` from §7.1. Each one parses its options and prints `not implemented` with exit 2 for now.
- `factory.config.yaml` with the §7.1 values, plus a typed loader that validates it.
- `.gitignore` covering `node_modules/`, `coverage/` and `.factory/`.

## What already exists

- `docs/design.md`, `CLAUDE.md` and `docs/tickets/`.
- `../software-factory-deprecated/` has a working v1 setup to copy from: `package.json`, `tsconfig.json`, `eslint.config.ts`, `.prettierrc.json`, `vitest.config.ts`, `.npmrc`, `pnpm-workspace.yaml` and `.claude/skills/node-standards/`. Vendor that skill into `.claude/skills/node-standards/`. Re-check every dependency version; don't copy versions blindly.

## Out of scope

Any subcommand's real behaviour. Packs, tickets, git.

## Acceptance criteria

- `make test` passes on a clean clone after `corepack pnpm install`.
- `pnpm factory` with no arguments prints usage that lists `init`, `next` and `check`, and exits 2.
- `pnpm factory next --repo x` prints `not implemented` and exits 2.
- `pnpm factory next` with no `--repo` prints `--repo is required` and exits 2.
- `pnpm factory bogus` prints `unknown command: bogus` and exits 2.
- Loading a `factory.config.yaml` with `maxAttempts: 0`, a missing `model` or an unknown key fails with a message naming the field.
- Removing one tested branch from any source file makes `make test` fail on coverage.
