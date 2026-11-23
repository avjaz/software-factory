import { describe, expect, it } from 'vitest';

import { parseTree } from '../../../src/git/tree.js';
import { someString } from '../../support/data.js';

describe('parseTree', () => {
  it('Can_map_each_mode_to_its_file_type_when_git_lists_blobs', () => {
    const [file, exe, link] = [someString(), someString(), someString()];

    // When
    const actual = parseTree(
      `100644 blob aa\t${file}\x00100755 blob bb\t${exe}\x00120000 blob cc\t${link}\x00`,
    );

    // Then
    expect(actual).toEqual(
      new Map([
        [file, { type: 'file', oid: 'aa' }],
        [exe, { type: 'executable', oid: 'bb' }],
        [link, { type: 'symlink', oid: 'cc' }],
      ]),
    );
  });

  it('Can_keep_tabs_and_spaces_in_paths_when_they_appear', () => {
    // When
    const actual = parseTree('100644 blob aa\ta b\tc\x00');

    // Then
    expect(actual).toEqual(new Map([['a b\tc', { type: 'file', oid: 'aa' }]]));
  });

  it('Can_skip_submodules_when_the_tree_has_one', () => {
    // When
    const actual = parseTree('160000 commit aa\tvendor/lib\x00100644 blob bb\tx\x00');

    // Then
    expect(actual).toEqual(new Map([['x', { type: 'file', oid: 'bb' }]]));
  });

  it('Can_return_an_empty_map_when_the_tree_is_empty', () => {
    // When
    const actual = parseTree('');

    // Then
    expect(actual).toEqual(new Map());
  });

  it.each(['garbage\x00', '100644 blob aa\x00', '100600 blob aa\tx\x00'])(
    'Can_throw_when_an_entry_is_malformed_like_%j',
    (text) => {
      // When
      const actual = () => parseTree(text);

      // Then
      expect(actual).toThrow(/^unexpected git ls-tree entry: /);
    },
  );
});
