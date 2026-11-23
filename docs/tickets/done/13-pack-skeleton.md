---
id: pack-skeleton
title: Let factory init write a pack's skeleton app into a fresh repo
design: ['6', '7.1']
---

## What to build

A pack may ship an app skeleton, so a fresh repo goes from `git init` to a green `make verify` with
one command:

```
factory init --repo <dir> --pack java --skeleton --param package=nz.co.example.demo --param name=demo-app
```

- **Pack side.** An optional `packs/<name>/skeleton/` folder holds the files, and an optional
  `skeleton:` block in `manifest.yaml` declares its params:

  ```yaml
  skeleton:
    params:
      - name: package
        describe: Java package of the app, e.g. nz.co.avjaz.mcp.procurement
        pattern: '^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$'
        pathSeparator: '.'   # optional: in file paths, the value's '.' becomes '/'
  ```

- **Core side.** `--skeleton` is opt-in. Without it, `init` behaves exactly as today. With it,
  `init` checks the params and refuses if any skeleton file already exists in the repo. Then it
  copies `skeleton/` into the repo, replacing `{{<param>}}` in file text and in file and folder
  names. File modes are kept, so scripts and `mvnw` stay executable. The usual pack files,
  `CLAUDE.md` and `.factory.yaml` follow as today. Nothing is committed.
- `init` works on a repo with no commits yet (fresh `git init`), with or without `--skeleton`.
- **Java skeleton** in `packs/java/skeleton/`, a Spring Boot web app at the current Spring Boot
  release (checked and pinned exactly, past the 7-day age guard):
  - `pom.xml` with the GATES block and `<java.version>25</java.version>`, as the pack Makefile and
    `java-standards` expect; `mvnw`, `mvnw.cmd`, `.mvn/`; `.gitignore`.
  - `{{package}}.Main` and a `HealthController`: `GET /health` returns 200
    `{"status":"UP"}`. Unit tests meet the coverage and mutation gates. An `ArchitectureTest`.
  - The hooks the pack Makefile calls: `scripts/acceptance.sh` (build, start the jar on port
    18080, run `acceptance/`, stop), `scripts/scan.sh` (Semgrep and Gitleaks, pinned images, as in
    procurement-mcp), `scripts/run.sh`.
  - `acceptance/` with one shell + curl test of `/health`.
- Design §6 and §7.1 describe the skeleton, the params and `--skeleton`.

## What already exists

- `src/init/factory-init.ts` (`FactoryInit`), `src/packs/pack-manifest.ts` (strict zod schema),
  `src/packs/pack-loader.ts`, `src/cli/run-cli.ts` (option specs), the fake pack in
  `tests/fixtures/packs/fake/`, `tests/init/init.test.ts`.
- `packs/java/Makefile` (hooks: `scripts/acceptance.sh`, `scripts/scan.sh`, `scripts/run.sh`).
- `../procurement-mcp` (Spring Boot 4.1.2, GATES block, scan images, acceptance script) and
  `../java-prototype` (shell + curl acceptance) to copy patterns from.

## Out of scope

- Any language logic in the core: the core knows params, tokens and `pathSeparator`, not Java.
- A database, Docker Compose, OAuth or Spring AI in the skeleton. Those are tickets in the target.
- Running `init --skeleton` on a repo that already has code: it refuses instead of merging.
- A TypeScript acceptance harness in the skeleton; a target ticket can bring one.

## Acceptance criteria

- Fake pack with `skeleton/{{name}}/hello.txt` containing `hi {{name}}` and param `name`
  (`pattern: '^[a-z]+$'`): `init --skeleton --param name=greeter` on a fresh `git init` repo exits 0
  and writes `greeter/hello.txt` containing `hi greeter`, plus the usual pack files; no commit.
- A param with `pathSeparator: '.'` and value `a.b`: the path holds `a/b`, the text holds `a.b`.
- A skeleton file marked executable is still executable in the repo.
- `init` without `--skeleton` on the same fake pack writes no skeleton file.
- `init` (no `--skeleton`) on a fresh `git init` repo with no commits exits 0.
- Each exits 2 with this message and writes nothing:
  - `--skeleton` when `greeter/hello.txt` already exists: `skeleton file exists: greeter/hello.txt`
  - no `--param name`: `--param name is required: <the param's describe>`
  - `--param name=Greeter`: `--param name: "Greeter" does not match ^[a-z]+$`
  - `--param colour=red`: `unknown param: colour`
  - `--param name=greeter` without `--skeleton`: `--param needs --skeleton`
  - `--skeleton` on a pack without `skeleton/`: `pack <name> has no skeleton`
- A manifest `skeleton:` block with an unknown key, or a param without `name`, is a pack error
  naming the field.
- No file under `src/` mentions `java`, `maven`, `spring` or `package` (as a param name).
- Manual, recorded in the commit: empty dir → `git init` → `factory init --pack java --skeleton
  --param package=nz.co.example.demo --param name=demo-app` → `make verify` exits 0 → commit → `make run` and
  `curl localhost:8080/health` gives `{"status":"UP"}`.
