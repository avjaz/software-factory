# Software factory v2

Read `docs/design.md` before any change. Work one ticket at a time from `docs/tickets/pending/`, lowest number first; read the design sections the ticket names.

The factory is TypeScript. Load the `node-standards` skill (vendored in `.claude/skills/`) before writing code.

## Rules

- The factory core never contains a language-specific line. Languages live in `packs/`.
- Out-of-scope items in design §12 stay out. If a ticket seems to need one, stop and ask.
- Test first. Every acceptance criterion in the ticket gets a test.
- Check the current version before adding a dependency. Pin exact versions. pnpm guard: `minimumReleaseAge: 10080`, `minimumReleaseAgeStrict: true`; never add `minimumReleaseAgeExclude` entries.
- Propose the plan and a file tree, then wait for approval. Stop after each step for review.
- Commit only when asked. Don't push.
- When a ticket is done, move it to `docs/tickets/done/<NN-id>.md` in the same commit.
