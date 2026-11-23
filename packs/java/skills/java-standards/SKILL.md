---
name: java-standards
description: >
  House Java coding standards. Use whenever writing, refactoring, reviewing,
  or testing Java in this workspace: new classes, services, mappers, Maven
  modules or poms, unit/acceptance tests, or build config. Prescribes enforced
  100% coverage, constructor injection, immutability, small classes, and BDD
  unit-test style with random data.
---

# Java House Standards

## Non-negotiables (apply to every Java change)

1. **Every class is 100% unit tested** — line, branch, and instruction. The
   build enforces it (JaCoCo `check`, per CLASS). Write the test with the class,
   never after "it works".
2. **Constructor injection only.** All collaborators `private final`, explicit
   constructor, no field/setter injection. **No Lombok.**
3. **`final` on every parameter and local.**
4. **Records for hand-written value types.** Mutable JavaBeans only come from
   generators.
5. **Small classes**: target ≤60 lines; a class approaching 150+ lines of
   *logic* (constants excluded) should be split.
6. **Never hand-write API models or clients** — generate from OpenAPI/WSDL
   specs into dedicated modules, excluded from coverage.
7. **All object mapping via MapStruct** (constructor injection,
   `ignoreByDefault` — every mapped field explicit).
8. **Custom runtime exception per failure domain**; catch-log-rethrow with
   context at boundaries only.
9. **Instance logger**: `private final Logger log = LoggerFactory.getLogger(getClass());`
   (SLF4J). Guard-clause early returns, log-then-return for no-op paths.
10. **Test names are behavior sentences**: `Can_<do_thing>_when_<condition>`
    in snake_case, with `// Given // When // Then` sections.

## Reference index (load before the matching task)

| Task | File |
|------|------|
| Writing/reviewing a unit test | `references/testing.md` |
| Writing/refactoring a class | `references/class-style.md` |
| New module, mapper, client, or integration | `references/architecture.md` |
| Maven pom, coverage, CI config | `references/build-quality.md` |
