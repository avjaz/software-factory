---
id: java-pack
title: Add the Java pack and migrate procurement-mcp onto it
design: ['4', '6', '13']
---

## What to build

- `packs/java/`, in the §6 shape:
  - `Makefile`: generic Maven targets, taken from procurement-mcp's current `Makefile`, keeping `unit`, `acceptance` and `verify` plus its other targets (`build`, `test`, `mutate`, `scan`, `run`, `db-up`, `db-down`). Anything repo-specific (ports, Compose project, how the app starts) moves into repo hook scripts the Makefile calls.
  - `manifest.yaml`: the §6 example values, plus `mvnw` and `.mvn/**` sealed. `network: [repo.maven.apache.org]`.
  - `CLAUDE.factory.md`: the worker's Java rules, from procurement-mcp's `docs/CLAUDE.md` minus anything the factory now enforces itself.
  - `skills/java-standards/`, copied from procurement-mcp's `.claude/skills/`.
- Run `factory init --repo ../procurement-mcp --pack java`, and add `.factory.yaml` with procurement-mcp's extra sealed paths: `ArchitectureTest.java`, `.semgrepignore`, `.gitleaks.toml`, any `osv-scanner.toml`.
- Prove `make unit` runs inside the native sandbox: no Docker, network limited to Maven Central, starting from an empty Maven cache.

## What already exists

- procurement-mcp at `../procurement-mcp`: a `Makefile` with `unit` already Docker-free (`mvn test`), `scripts/acceptance.sh` and `scripts/scan.sh`, and a GATES block in `pom.xml`. Facts about its runtime, ports and gates are in `../software-factory-deprecated/docs/handoff.md`.
- `make acceptance` already copies `acceptance/` to `target/acceptance-run/` before running it.

## Out of scope

Changing procurement-mcp's gates, thresholds or tests. Its slice 2.

## Acceptance criteria

- `make verify` on procurement-mcp after migration passes, with the same unit, integration and acceptance test counts as before, coverage at 100% and the same PIT result.
- procurement-mcp's `Makefile` is byte-identical to `packs/java/Makefile`.
- `factory check` on a throwaway pending ticket that adds one failing acceptance test reports `ok: main is green, <id> is red`.
- `make unit` passes in the native sandbox with the Java pack's network allowlist and a fresh Maven cache. The command used is recorded in the PR.
- No language-specific line was added outside `packs/java/`.
