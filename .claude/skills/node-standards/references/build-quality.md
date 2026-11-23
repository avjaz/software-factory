# Build & quality gates

## The gate is compound: coverage AND types AND lint

Java had one enforcer (compiler) plus one gate (JaCoCo). Node splits the same
duties across three tools, wired into a single hook contract — every repo has
a Makefile with:

```make
test:
	pnpm prettier --check .
	pnpm eslint .
	pnpm tsc --noEmit
	pnpm vitest run --coverage
```

`make test` green means: formatted, linted (type-aware), strictly typed, 100%
per-file line + branch covered. Nothing merges otherwise. `tsc --noEmit` runs
even though Vitest transpiles tests itself — Vitest does **not** type-check,
so skipping the tsc step silently drops the contract half of the gate.

## Coverage: 100%, enforced, per file

Vitest's `perFile: true` is genuinely per-file — the JaCoCo per-CLASS rule
with no workaround needed:

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: [
        'src/**/generated/**',
        'src/composition.ts',
        'src/config.ts',
        'src/entrypoints/main.ts',
      ],
      thresholds: {
        perFile: true,
        lines: 100,
        branches: 100,
        functions: 100,
        statements: 100,
      },
    },
  },
});
```

- Four counters instead of Java's three; branches is still the one doing the
  real work. Instruction coverage doesn't exist outside JVM bytecode.
- v8 provider counts implicit-else and optional-chaining branches — that's a
  feature: a `?.` nobody tested is an untested branch.
- Integration tests are a **separate Vitest project** (`tests/integration/`,
  `*.it.test.ts`), run as their own CI job, coverage-excluded — the
  Surefire/Failsafe analogue.

## Exclusions: principled and narrow

The exclude list above is the whole list: generated code plus the no-logic
composition/config modules (the `@Generated` analogue). A file that is "hard
to test" gets redesigned, not excluded. Inline escape hatches are banned in
hand-written code: no `/* v8 ignore */`, no `// @ts-expect-error` without a
linked issue, no `eslint-disable` without a justifying comment on the same
line. A leaf *with* logic (a store, a guard branch, a zod refinement) is
tested normally.

## TypeScript: strict-plus

```jsonc
// tsconfig.json (compilerOptions)
{
  "strict": true,
  "noUncheckedIndexedAccess": true,
  "exactOptionalPropertyTypes": true,
  "noImplicitOverride": true,
  "noFallthroughCasesInSwitch": true,
  "verbatimModuleSyntax": true,
  "module": "NodeNext",
  "moduleResolution": "NodeNext",
  "target": "ES2023"
}
```

`noUncheckedIndexedAccess` is the one people want to turn off — it forces a
guard on every `map[key]` / `arr[i]`. Those guards are exactly the branches
the 100% rule then makes you test. Leave it on.

## Lint: type-aware

```ts
// eslint.config.ts — flat config
// tseslint.config() is deprecated and fails no-deprecated; use ESLint's defineConfig.
// A .ts config needs jiti as a devDependency.
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true, // the type-checked rules need type information
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
      // the vi.mock() ban, mechanically enforced:
      'no-restricted-syntax': ['error', {
        selector: "CallExpression[callee.object.name='vi'][callee.property.name=/^(mock|doMock)$/]",
        message: 'Module mocking is banned — inject the collaborator and use mock<T>() instead.',
      }],
    },
  },
  { ignores: ['**/generated/**', 'dist/**'] },
);
```

Tests are linted and type-checked to the same standard as src — typed
fixtures are what keep `mock<T>()` honest at the seam. The `assertionStyle:
'never'` rule bans `as` outright; the rare legitimate cast goes through a
typed narrowing function instead.

## Conventions

- Node 22 LTS, `"type": "module"` (ESM only), `engines` pinned in
  package.json.
- **pnpm with a committed `pnpm-lock.yaml`** and `save-exact=true` in
  `.npmrc` — every dependency version pinned; the `pluginManagement`
  analogue. Tool versions (eslint, prettier, typescript, vitest) live in
  devDependencies, not developer machines; `packageManager` field pins pnpm
  itself.
- Test-support deps declared once, devDependencies only: vitest,
  @vitest/coverage-v8, vitest-mock-extended, @faker-js/faker, fishery,
  @cucumber/cucumber (acceptance), msw (integration/acceptance stubbing).
- Renovate/Dependabot with auto-merge — safe because `make test` (types +
  lint + 100% per-file coverage) runs first.
- Versioning via tags + changesets or equivalent; no snapshot flow —
  lockfile discipline replaces it.
