import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { listWorktreeFiles } from '../../../src/integrity/worktree-files.js';
import { someString } from '../../support/data.js';

describe('listWorktreeFiles', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'walk-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function write(path: string): void {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), someString());
  }

  it('Can_list_every_file_with_its_type_and_posix_path', () => {
    write('a.txt');
    write('deep/er/b.sh');
    chmodSync(join(root, 'deep/er/b.sh'), 0o755);
    write('.hidden/c');
    symlinkSync('a.txt', join(root, 'link'));

    // When
    const actual = listWorktreeFiles(root);

    // Then
    expect(actual).toEqual(
      new Map([
        ['.hidden/c', 'file'],
        ['a.txt', 'file'],
        ['deep/er/b.sh', 'executable'],
        ['link', 'symlink'],
      ]),
    );
  });

  it('Can_skip_the_git_dir_and_the_worktree_git_file_at_the_root', () => {
    write('.git/config');
    write('x');

    // When
    const actual = listWorktreeFiles(root);

    // Then
    expect([...actual.keys()]).toEqual(['x']);
  });

  it('Can_skip_a_git_pointer_file_at_the_root', () => {
    writeFileSync(join(root, '.git'), `gitdir: ${someString()}\n`);
    write('x');

    // When
    const actual = listWorktreeFiles(root);

    // Then
    expect([...actual.keys()]).toEqual(['x']);
  });

  it('Can_list_files_inside_a_nested_git_dir_when_it_is_not_at_the_root', () => {
    write('acceptance/hidden/.git/HEAD');
    write('acceptance/hidden/test.sh');

    // When
    const actual = listWorktreeFiles(root);

    // Then
    expect([...actual.keys()]).toEqual([
      'acceptance/hidden/.git/HEAD',
      'acceptance/hidden/test.sh',
    ]);
  });

  it('Can_list_a_symlinked_dir_as_one_symlink_without_following_it', () => {
    write('real/x');
    symlinkSync('real', join(root, 'alias'));

    // When
    const actual = listWorktreeFiles(root);

    // Then
    expect(actual).toEqual(
      new Map([
        ['alias', 'symlink'],
        ['real/x', 'file'],
      ]),
    );
  });

  it('Can_skip_special_files_when_the_tree_has_a_fifo', () => {
    write('x');
    spawnSync('mkfifo', [join(root, 'pipe')]);

    // When
    const actual = listWorktreeFiles(root);

    // Then
    expect([...actual.keys()]).toEqual(['x']);
  });

  it('Can_list_nothing_when_the_dir_is_empty', () => {
    // When
    const actual = listWorktreeFiles(root);

    // Then
    expect(actual).toEqual(new Map());
  });
});
