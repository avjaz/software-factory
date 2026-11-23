import { describe, expect, it } from 'vitest';

import { parseChanges } from '../../../src/git/change.js';
import { someString } from '../../support/data.js';

describe('parseChanges', () => {
  it('Can_map_each_status_letter_to_its_kind_when_git_lists_tracked_changes', () => {
    const [a, d, m, t] = [someString(), someString(), someString(), someString()];

    // When
    const actual = parseChanges(`A\0${a}\0D\0${d}\0M\0${m}\0T\0${t}\0`, '');

    // Then
    expect(actual).toEqual(
      [
        { kind: 'added', path: a },
        { kind: 'deleted', path: d },
        { kind: 'modified', path: m },
        { kind: 'modified', path: t },
      ].sort((x, y) => x.path.localeCompare(y.path)),
    );
  });

  it('Can_report_untracked_files_as_added_in_path_order_when_git_lists_them', () => {
    // When
    const actual = parseChanges('M\0b/x\0', 'c y\0a\0');

    // Then
    expect(actual).toEqual([
      { kind: 'added', path: 'a' },
      { kind: 'modified', path: 'b/x' },
      { kind: 'added', path: 'c y' },
    ]);
  });

  it('Can_return_nothing_when_both_lists_are_empty', () => {
    // When
    const actual = parseChanges('', '');

    // Then
    expect(actual).toEqual([]);
  });

  it('Can_throw_when_git_reports_an_unexpected_status', () => {
    // When
    const actual = () => parseChanges('X\0a\0', '');

    // Then
    expect(actual).toThrow(/^unexpected git status X for a$/);
  });

  it('Can_throw_when_a_status_has_no_path', () => {
    // When
    const actual = () => parseChanges('M\0', '');

    // Then
    expect(actual).toThrow(/^unexpected git status M for $/);
  });
});
