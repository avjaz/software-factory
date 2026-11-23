---
name: node-standards
description: >
  House Node/TypeScript coding standards — the Java pack's java-standards
  discipline (enforced 100% coverage, constructor injection, immutability,
  small classes, BDD-style unit tests with random data) ported to Node. Use whenever writing,
  refactoring, reviewing, or testing TypeScript/Node in this workspace: new
  modules, classes, services, mappers, Express/Fastify apps, Lambda handlers,
  package.json or build config, unit/acceptance tests. Prescribes TypeScript
  strict-plus as the enforcement layer, typed vitest-mock-extended
  collaborator mocks, a ban on vi.mock() module mocking, readonly value
  types, and Vitest with 100%
  per-file line + branch coverage. Complements java-standards — same
  philosophy, Node enforcement.
---

# Node/TypeScript House Standards

The Java house discipline, ported. Everything is TypeScript — plain
JavaScript cannot hold this standard. Enforcement splits two ways: `tsc --noEmit` strict-plus catches
contracts, Vitest per-file thresholds catch coverage — both inside one
`make test`.

## Non-negotiables (apply to every TS change)

1. **Every file is 100% unit tested** — lines, branches, functions, and
   statements, enforced **per file** by Vitest coverage thresholds
   (`perFile: true`). The build enforces it via `make test`. Write the test
   with the code, never after "it works".
2. **TypeScript strict-plus, everywhere.** `strict: true` plus
   `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`;
   `tsc --noEmit` is part of the gate. No `any`, no non-null `!`, no `as`
   escape hatches — eslint (typescript-eslint strictTypeChecked) enforces it.
   Tests are typed to the same standard.
3. **Constructor injection only.** Collaborators arrive as constructor
   parameters into `private readonly` fields. **`vi.mock()` /
   `vi.doMock()` module mocking is banned in unit tests** — it is
   import-path-coupled and brittle. Anything you'd
   module-mock gets injected instead.
4. **Typed mocks only**: `mock<Interface>()` from **vitest-mock-extended**.
   A typo'd method name or wrong argument type fails compilation — the
   `mock(X.class)` honesty Java gave for free. Never an untyped `vi.fn()`
   grab-bag object standing in for a collaborator.
5. **Value types are `readonly` interfaces + object literals.** Collections
   exposed or stored: `ReadonlyArray` / `ReadonlyMap` / `ReadonlySet`. No
   classes for pure data; no value equality in JS — deep equality lives in
   `toEqual`.
6. **Functions before classes.** No collaborators + no state → exported
   function. Collaborators → class with constructor injection. Small either
   way: target ≤60 lines; a class approaching 150+ lines of *logic*
   (constant tables excluded) gets split.
7. **Never hand-write API models or clients** — generate from OpenAPI specs
   (openapi-typescript + openapi-fetch) into a dedicated `generated/`
   directory, excluded from coverage and lint.
8. **All object mapping via explicit mapper functions** returning typed
   object literals — a missing required field AND an excess field are both
   compile errors on a literal; optional-field gaps are closed by the
   mapper's unit test.
9. **Custom `Error` subclass per failure domain**, `name` set,
   `{ cause: e }` chaining; catch-log-rethrow with context at boundaries
   only.
10. **Structured logging via pino**, one module-level child logger per file.
    Guard-clause early returns, log-then-return for no-op paths. Every
    promise awaited or returned — `no-floating-promises` is non-negotiable.
11. **Test names are behavior sentences**:
    `it('Can_<do_thing>_when_<condition>')`, with `// Given // When // Then`
    sections and no literal test data (`someString()`, Fishery factories).

## Reference index (load before the matching task)

| Task | File |
|------|------|
| Writing/reviewing a unit test | `references/testing.md` |
| Writing/refactoring a module or class | `references/class-style.md` |
| New package, mapper, client, or integration | `references/architecture.md` |
| package.json, tsconfig, coverage, CI config | `references/build-quality.md` |
