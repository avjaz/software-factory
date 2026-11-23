import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import type { TreeEntry } from '../../../src/git/tree.js';
import { sealedChanges, testMismatches } from '../../../src/integrity/sealed-changes.js';
import { someString } from '../../support/data.js';

interface Ignorer {
  readonly ignored: (paths: readonly string[]) => ReadonlySet<string>;
}

function entry(type: TreeEntry['type'] = 'file'): TreeEntry {
  return { type, oid: someString() };
}

describe('sealedChanges', () => {
  it('Can_report_deleted_modified_and_added_paths_when_each_kind_occurs', () => {
    // Given
    const same = entry();
    const changed = entry();
    const ignorer = mock<Ignorer>();
    ignorer.ignored.mockReturnValue(new Set(['build/out']));

    // When
    const actual = sealedChanges({
      baseSealed: new Map([
        ['same', same],
        ['changed', changed],
        ['gone', entry()],
        ['retyped', { ...same, type: 'file' }],
      ]),
      diskSealed: ['same', 'changed', 'retyped', 'new', 'build/out'],
      hashed: new Map([
        ['same', same],
        ['changed', { ...changed, oid: someString() }],
        ['retyped', { ...same, type: 'executable' }],
      ]),
      ignored: ignorer.ignored,
    });

    // Then
    expect(actual).toEqual([
      { path: 'gone', kind: 'deleted' },
      { path: 'changed', kind: 'modified' },
      { path: 'retyped', kind: 'modified' },
      { path: 'new', kind: 'added' },
    ]);
    expect(ignorer.ignored).toHaveBeenCalledExactlyOnceWith(['new', 'build/out']);
  });

  it.each([
    ['added', new Map<string, TreeEntry>(), ['x/.gitignore', 'build/out']],
    ['deleted', new Map([['.gitignore', entry()]]), ['build/out']],
  ])('Can_report_ignored_files_too_when_a_gitignore_is_%s', (_, baseSealed, diskSealed) => {
    // Given
    const ignorer = mock<Ignorer>();

    // When
    const actual = sealedChanges({
      baseSealed,
      diskSealed,
      hashed: new Map(),
      ignored: ignorer.ignored,
    });

    // Then
    expect(actual).toContainEqual({ path: 'build/out', kind: 'added' });
    expect(ignorer.ignored).not.toHaveBeenCalled();
  });

  it('Can_report_nothing_when_disk_matches_the_base', () => {
    const same = entry('symlink');
    const ignorer = mock<Ignorer>();
    ignorer.ignored.mockReturnValue(new Set());

    // When
    const actual = sealedChanges({
      baseSealed: new Map([['a', same]]),
      diskSealed: ['a'],
      hashed: new Map([['a', same]]),
      ignored: ignorer.ignored,
    });

    // Then
    expect(actual).toEqual([]);
  });
});

describe('testMismatches', () => {
  it('Can_flag_each_copied_test_that_differs_from_or_lacks_its_base_copy', () => {
    const good = entry();
    const changed = entry();

    // When
    const actual = testMismatches(
      [
        { target: 'good', pendingPath: 'p/good' },
        { target: 'changed', pendingPath: 'p/changed' },
        { target: 'missing-on-disk', pendingPath: 'p/missing-on-disk' },
        { target: 'missing-at-base', pendingPath: 'p/missing-at-base' },
      ],
      new Map([
        ['p/good', good],
        ['p/changed', changed],
        ['p/missing-on-disk', entry()],
      ]),
      new Map([
        ['good', good],
        ['changed', { ...changed, oid: someString() }],
        ['missing-at-base', entry()],
      ]),
    );

    // Then
    expect(actual).toEqual([
      { path: 'changed', kind: 'test_mismatch' },
      { path: 'missing-on-disk', kind: 'test_mismatch' },
      { path: 'missing-at-base', kind: 'test_mismatch' },
    ]);
  });
});
