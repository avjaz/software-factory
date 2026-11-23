import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'tests/unit/**/*.test.ts',
      'tests/init/**/*.test.ts',
      'tests/next/**/*.test.ts',
      'tests/check/**/*.test.ts',
      'tests/validate/**/*.test.ts',
      'tests/integrity/**/*.test.ts',
      'tests/run/**/*.test.ts',
      'tests/cli/**/*.test.ts',
      'tests/harness/**/*.test.ts',
      'tests/report/**/*.test.ts',
      'tests/packs/**/*.test.ts',
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: ['src/entrypoints/**'],
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
