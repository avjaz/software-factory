import { basename } from 'node:path';

import type { TreeEntry } from '../git/tree.js';
import type { CopiedTest } from './copied-tests.js';
import type { Violation } from './violation.js';

export interface SealedComparison {
  readonly baseSealed: ReadonlyMap<string, TreeEntry>;
  readonly diskSealed: readonly string[];
  readonly hashed: ReadonlyMap<string, TreeEntry>;
  readonly ignored: (paths: readonly string[]) => ReadonlySet<string>;
}

export function sealedChanges(comparison: SealedComparison): readonly Violation[] {
  const { baseSealed, hashed } = comparison;
  const onDisk = new Set(comparison.diskSealed);
  const deleted = [...baseSealed.keys()].filter((path) => !onDisk.has(path));
  const modified = [...baseSealed]
    .filter(([path, entry]) => onDisk.has(path) && differs(entry, hashed.get(path)))
    .map(([path]) => path);
  const candidates = comparison.diskSealed.filter((path) => !baseSealed.has(path));
  const touched = [...deleted, ...modified, ...candidates];
  const ignoreRulesChanged = touched.some((path) => basename(path) === '.gitignore');
  const ignored = ignoreRulesChanged ? new Set<string>() : comparison.ignored(candidates);
  return [
    ...deleted.map((path): Violation => ({ path, kind: 'deleted' })),
    ...modified.map((path): Violation => ({ path, kind: 'modified' })),
    ...candidates
      .filter((path) => !ignored.has(path))
      .map((path): Violation => ({ path, kind: 'added' })),
  ];
}

export function testMismatches(
  copied: readonly CopiedTest[],
  baseTree: ReadonlyMap<string, TreeEntry>,
  hashed: ReadonlyMap<string, TreeEntry>,
): readonly Violation[] {
  return copied
    .filter(({ target, pendingPath }) => {
      const expected = baseTree.get(pendingPath);
      return expected === undefined || differs(expected, hashed.get(target));
    })
    .map(({ target }): Violation => ({ path: target, kind: 'test_mismatch' }));
}

function differs(expected: TreeEntry, actual: TreeEntry | undefined): boolean {
  return actual?.type !== expected.type || actual.oid !== expected.oid;
}
