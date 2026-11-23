# Java rules (factory pack)

These rules come from the factory's Java pack. The repo's own rules are in its other `CLAUDE.md` files.

- Load the `java-standards` skill in `.claude/skills/` before writing code. It sets the house style: 100% line, branch and instruction coverage, constructor injection, records for value types, small classes, BDD-style tests with random data.
- Test first. Write a failing unit test, then the code that makes it pass.
- Production code goes in `src/main/java`, unit tests in `src/test/java`. `make unit` runs the unit tests and the coverage gate, with no Docker. Tests that need Docker run only in `make verify`, after you finish.
- `pom.xml` is sealed: never edit it. If the ticket needs a new dependency or plugin, stop and finish with `spec_defect`, naming the dependency and why it is needed.
- Never weaken a gate to make a build pass. Coverage and mutation thresholds live in the GATES block of `pom.xml`; the scans live in `scripts/`. If a gate blocks you, finish with `spec_defect` and explain why.
- Check the existing code for the library or pattern you need before adding your own.
