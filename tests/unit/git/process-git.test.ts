import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { GitError } from '../../../src/git/git-error.js';
import { ProcessGit } from '../../../src/git/process-git.js';
import { someString } from '../../support/data.js';
import {
  commitAll,
  commitOnBranch,
  createTinyRepo,
  mergeIntoMain,
} from '../../support/tiny-repo.js';

function gitOut(dir: string, ...args: readonly string[]): string {
  return spawnSync('git', args, { cwd: dir, encoding: 'utf8' }).stdout.trim();
}

describe('ProcessGit', () => {
  const dirs: string[] = [];
  let subject: ProcessGit;

  function track(dir: string): string {
    dirs.push(dir);
    return dir;
  }

  beforeEach(() => {
    subject = new ProcessGit();
  });

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  describe('isTopLevel', () => {
    it('Can_say_yes_when_the_dir_is_a_repo_root', () => {
      const repo = track(createTinyRepo());

      // When
      const actual = subject.isTopLevel(repo);

      // Then
      expect(actual).toBe(true);
    });

    it('Can_say_no_when_the_dir_is_inside_a_repo', () => {
      const repo = track(createTinyRepo());

      // When
      const actual = subject.isTopLevel(join(repo, 'src'));

      // Then
      expect(actual).toBe(false);
    });

    it('Can_say_no_when_the_dir_is_not_in_a_repo', () => {
      const dir = track(mkdtempSync(join(tmpdir(), 'plain-')));

      // When
      const actual = subject.isTopLevel(dir);

      // Then
      expect(actual).toBe(false);
    });

    it('Can_say_no_when_the_dir_does_not_exist', () => {
      // When
      const actual = subject.isTopLevel(join(tmpdir(), `missing-${someString()}`));

      // Then
      expect(actual).toBe(false);
    });
  });

  describe('isClean', () => {
    it('Can_say_yes_when_nothing_has_changed', () => {
      const repo = track(createTinyRepo());

      // When
      const actual = subject.isClean(repo);

      // Then
      expect(actual).toBe(true);
    });

    it('Can_say_no_when_a_tracked_file_is_modified', () => {
      const repo = track(createTinyRepo());
      writeFileSync(join(repo, 'src', 'hello.txt'), someString());

      // When
      const actual = subject.isClean(repo);

      // Then
      expect(actual).toBe(false);
    });

    it('Can_say_no_when_an_untracked_file_exists', () => {
      const repo = track(createTinyRepo());
      writeFileSync(join(repo, `new-${someString()}`), someString());

      // When
      const actual = subject.isClean(repo);

      // Then
      expect(actual).toBe(false);
    });

    it('Can_throw_when_the_dir_is_not_a_repo', () => {
      const dir = track(mkdtempSync(join(tmpdir(), 'plain-')));

      // When
      const actual = () => subject.isClean(dir);

      // Then
      expect(actual).toThrow(GitError);
      expect(actual).toThrow(/^git status failed in .+: /);
    });
  });

  describe('unmergedBranches', () => {
    it('Can_list_the_branch_when_it_has_commits_not_in_the_base', () => {
      const repo = track(createTinyRepo());
      commitOnBranch(repo, 'factory/greet');

      // When
      const actual = subject.unmergedBranches(repo, 'main', 'factory/*');

      // Then
      expect(actual).toEqual(['factory/greet']);
    });

    it('Can_list_nothing_when_the_branch_is_merged_into_the_base', () => {
      const repo = track(createTinyRepo());
      commitOnBranch(repo, 'factory/greet');
      mergeIntoMain(repo, 'factory/greet');

      // When
      const actual = subject.unmergedBranches(repo, 'main', 'factory/*');

      // Then
      expect(actual).toEqual([]);
    });

    it('Can_list_only_matching_branches_in_name_order_when_several_are_unmerged', () => {
      const repo = track(createTinyRepo());
      commitOnBranch(repo, 'factory/b');
      commitOnBranch(repo, 'feature/x');
      commitOnBranch(repo, 'factory/a');

      // When
      const actual = subject.unmergedBranches(repo, 'main', 'factory/*');

      // Then
      expect(actual).toEqual(['factory/a', 'factory/b']);
    });

    it('Can_list_nothing_when_no_branch_matches', () => {
      const repo = track(createTinyRepo());

      // When
      const actual = subject.unmergedBranches(repo, 'main', 'factory/*');

      // Then
      expect(actual).toEqual([]);
    });

    it('Can_throw_when_the_base_does_not_exist', () => {
      const repo = track(createTinyRepo());
      const base = `missing-${someString()}`;

      // When
      const actual = () => subject.unmergedBranches(repo, base, 'factory/*');

      // Then
      expect(actual).toThrow(GitError);
      expect(actual).toThrow(/^git branch failed in .+: /);
    });
  });

  describe('revParse', () => {
    it('Can_return_the_commit_sha_when_the_ref_exists', () => {
      const repo = track(createTinyRepo());

      // When
      const actual = subject.revParse(repo, 'main');

      // Then
      expect(actual).toBe(gitOut(repo, 'rev-parse', 'HEAD'));
      expect(actual).toMatch(/^[0-9a-f]{40}$/);
    });

    it('Can_throw_when_the_ref_does_not_exist', () => {
      const repo = track(createTinyRepo());

      // When
      const actual = () => subject.revParse(repo, `missing-${someString()}`);

      // Then
      expect(actual).toThrow(GitError);
      expect(actual).toThrow(/^git rev-parse failed in .+: /);
    });
  });

  describe('addWorktree', () => {
    function worktreePath(): string {
      return join(track(mkdtempSync(join(tmpdir(), 'work-'))), 'worktrees', someString());
    }

    it('Can_check_out_the_start_point_on_a_new_branch_without_touching_the_repo', () => {
      const repo = track(createTinyRepo());
      const base = gitOut(repo, 'rev-parse', 'HEAD');
      const path = worktreePath();

      // When
      subject.addWorktree(repo, path, 'factory/greet', base);

      // Then
      expect(gitOut(path, 'branch', '--show-current')).toBe('factory/greet');
      expect(gitOut(path, 'rev-parse', 'HEAD')).toBe(base);
      expect(existsSync(join(path, 'src', 'hello.txt'))).toBe(true);
      expect(gitOut(repo, 'branch', '--show-current')).toBe('main');
      expect(gitOut(repo, 'status', '--porcelain')).toBe('');
    });

    it('Can_reuse_the_path_when_an_earlier_worktree_there_was_deleted_by_hand', () => {
      const repo = track(createTinyRepo());
      const path = worktreePath();
      subject.addWorktree(repo, path, 'factory/first', 'main');
      rmSync(path, { recursive: true, force: true });

      // When
      subject.addWorktree(repo, path, 'factory/second', 'main');

      // Then
      expect(gitOut(path, 'branch', '--show-current')).toBe('factory/second');
    });

    it('Can_reset_an_existing_branch_to_the_start_point_when_it_is_not_checked_out', () => {
      const repo = track(createTinyRepo());
      commitOnBranch(repo, 'factory/greet');
      const path = worktreePath();

      // When
      subject.addWorktree(repo, path, 'factory/greet', 'main');

      // Then
      expect(gitOut(path, 'rev-parse', 'HEAD')).toBe(gitOut(repo, 'rev-parse', 'main'));
    });

    it('Can_throw_when_the_branch_is_checked_out_elsewhere', () => {
      const repo = track(createTinyRepo());

      // When
      const actual = () => {
        subject.addWorktree(repo, worktreePath(), 'main', 'main');
      };

      // Then
      expect(actual).toThrow(GitError);
      expect(actual).toThrow(/^git worktree add failed in .+: /);
    });

    it('Can_throw_when_the_repo_is_not_a_repo', () => {
      const dir = track(mkdtempSync(join(tmpdir(), 'plain-')));

      // When
      const actual = () => {
        subject.addWorktree(dir, worktreePath(), 'factory/greet', 'main');
      };

      // Then
      expect(actual).toThrow(/^git worktree prune failed in .+: /);
    });
  });

  describe('branchExists', () => {
    it('Can_say_yes_when_the_branch_exists', () => {
      const repo = track(createTinyRepo());
      commitOnBranch(repo, 'factory/greet');

      // When
      const actual = subject.branchExists(repo, 'factory/greet');

      // Then
      expect(actual).toBe(true);
    });

    it('Can_say_no_when_the_branch_does_not_exist', () => {
      const repo = track(createTinyRepo());

      // When
      const actual = subject.branchExists(repo, 'factory/greet');

      // Then
      expect(actual).toBe(false);
    });

    it('Can_throw_when_the_dir_is_not_a_repo', () => {
      const dir = track(mkdtempSync(join(tmpdir(), 'plain-')));

      // When
      const actual = () => subject.branchExists(dir, 'main');

      // Then
      expect(actual).toThrow(/^git show-ref failed in .+: /);
    });
  });

  describe('removeWorktree and deleteBranch', () => {
    it('Can_remove_a_dirty_worktree_and_its_unmerged_branch', () => {
      const repo = track(createTinyRepo());
      const path = join(track(mkdtempSync(join(tmpdir(), 'work-'))), 'wt');
      subject.addWorktree(repo, path, 'factory/greet', 'main');
      writeFileSync(join(path, 'src', 'hello.txt'), someString());
      writeFileSync(join(path, `new-${someString()}`), someString());
      commitAll(path, 'unmerged work');
      writeFileSync(join(path, 'src', 'hello.txt'), someString());

      // When
      subject.removeWorktree(repo, path);
      subject.deleteBranch(repo, 'factory/greet');

      // Then
      expect(existsSync(path)).toBe(false);
      expect(gitOut(repo, 'worktree', 'list', '--porcelain')).not.toContain(path);
      expect(gitOut(repo, 'branch', '--list', 'factory/*')).toBe('');
    });

    it('Can_throw_when_the_worktree_is_unknown', () => {
      const repo = track(createTinyRepo());

      // When
      const actual = () => {
        subject.removeWorktree(repo, join(tmpdir(), `missing-${someString()}`));
      };

      // Then
      expect(actual).toThrow(/^git worktree remove failed in .+: /);
    });

    it('Can_throw_when_the_branch_is_unknown', () => {
      const repo = track(createTinyRepo());

      // When
      const actual = () => {
        subject.deleteBranch(repo, `factory/${someString()}`);
      };

      // Then
      expect(actual).toThrow(/^git branch failed in .+: /);
    });
  });

  describe('changes', () => {
    it('Can_list_nothing_when_the_tree_matches_the_base', () => {
      const repo = track(createTinyRepo());

      // When
      const actual = subject.changes(repo, 'main');

      // Then
      expect(actual).toEqual([]);
    });

    it('Can_list_every_kind_of_change_against_the_base_in_path_order', () => {
      const repo = track(createTinyRepo());
      const base = gitOut(repo, 'rev-parse', 'HEAD');
      writeFileSync(join(repo, 'src', 'hello.txt'), someString());
      rmSync(join(repo, 'unit', 'hello.sh'));
      mkdirSync(join(repo, 'new dir'));
      writeFileSync(join(repo, 'new dir', 'a file.txt'), someString());
      writeFileSync(join(repo, 'staged.txt'), someString());
      spawnSync('git', ['add', 'staged.txt'], { cwd: repo });
      writeFileSync(join(repo, 'acceptance', 'committed.sh'), someString());
      commitAll(repo, 'later commit');

      // When
      const actual = subject.changes(repo, base);

      // Then
      expect(actual).toEqual([
        { kind: 'added', path: 'acceptance/committed.sh' },
        { kind: 'added', path: 'new dir/a file.txt' },
        { kind: 'modified', path: 'src/hello.txt' },
        { kind: 'added', path: 'staged.txt' },
        { kind: 'deleted', path: 'unit/hello.sh' },
      ]);
    });

    it('Can_leave_out_ignored_files_when_the_repo_ignores_them', () => {
      const repo = track(createTinyRepo());
      writeFileSync(join(repo, '.gitignore'), 'build/\n');
      commitAll(repo, 'ignore build');
      mkdirSync(join(repo, 'build'));
      writeFileSync(join(repo, 'build', 'out.txt'), someString());

      // When
      const actual = subject.changes(repo, 'main');

      // Then
      expect(actual).toEqual([]);
    });

    it('Can_throw_when_the_base_does_not_exist', () => {
      const repo = track(createTinyRepo());

      // When
      const actual = () => subject.changes(repo, `missing-${someString()}`);

      // Then
      expect(actual).toThrow(/^git diff failed in .+: /);
    });

    it('Can_throw_when_the_dir_is_not_a_repo', () => {
      const dir = track(mkdtempSync(join(tmpdir(), 'plain-')));

      // When
      const actual = () => subject.changes(dir, 'main');

      // Then
      expect(actual).toThrow(/^git (diff|ls-files) failed in .+: /);
    });
  });

  describe('cleanIgnored', () => {
    it('Can_remove_ignored_files_and_dirs_and_keep_tracked_and_untracked_files', () => {
      const repo = track(createTinyRepo());
      writeFileSync(join(repo, '.gitignore'), 'build/\n*.log\n');
      commitAll(repo, 'ignore build and logs');
      mkdirSync(join(repo, 'build', 'classes'), { recursive: true });
      writeFileSync(join(repo, 'build', 'classes', 'Planted.class'), someString());
      writeFileSync(join(repo, 'src', 'run.log'), someString());
      const untracked = someString();
      writeFileSync(join(repo, 'src', 'new.txt'), untracked);

      // When
      subject.cleanIgnored(repo);

      // Then
      expect(existsSync(join(repo, 'build'))).toBe(false);
      expect(existsSync(join(repo, 'src', 'run.log'))).toBe(false);
      expect(readFileSync(join(repo, 'src', 'new.txt'), 'utf8')).toBe(untracked);
      expect(existsSync(join(repo, 'src', 'hello.txt'))).toBe(true);
      expect(existsSync(join(repo, '.gitignore'))).toBe(true);
    });

    it('Can_throw_when_the_dir_is_not_a_repo', () => {
      const dir = track(mkdtempSync(join(tmpdir(), 'plain-')));

      // When
      const actual = () => {
        subject.cleanIgnored(dir);
      };

      // Then
      expect(actual).toThrow(/^git clean failed in .+: /);
    });
  });

  describe('commitAll', () => {
    const identity = { name: 'software-factory', email: 'factory@localhost' };

    it('Can_commit_every_change_as_the_identity_and_return_the_sha', () => {
      const repo = track(createTinyRepo());
      const message = `Ticket ${someString()}: ${someString()}`;
      writeFileSync(join(repo, 'src', 'hello.txt'), someString());
      rmSync(join(repo, 'unit', 'hello.sh'));
      writeFileSync(join(repo, `new-${someString()}`), someString());

      // When
      const actual = subject.commitAll(repo, identity, message);

      // Then
      expect(actual).toBe(gitOut(repo, 'rev-parse', 'HEAD'));
      expect(gitOut(repo, 'log', '-1', '--format=%an <%ae>|%cn <%ce>|%B')).toBe(
        `software-factory <factory@localhost>|software-factory <factory@localhost>|${message}`,
      );
      expect(gitOut(repo, 'status', '--porcelain')).toBe('');
    });

    it('Can_commit_when_the_repo_has_a_failing_pre_commit_hook', () => {
      const repo = track(createTinyRepo());
      const hook = join(repo, '.git', 'hooks', 'pre-commit');
      writeFileSync(hook, '#!/bin/sh\nexit 1\n');
      chmodSync(hook, 0o755);
      writeFileSync(join(repo, 'src', 'hello.txt'), someString());

      // When
      const actual = subject.commitAll(repo, identity, someString());

      // Then
      expect(actual).toBe(gitOut(repo, 'rev-parse', 'HEAD'));
    });

    it('Can_throw_when_there_is_nothing_to_commit', () => {
      const repo = track(createTinyRepo());

      // When
      const actual = () => subject.commitAll(repo, identity, someString());

      // Then
      expect(actual).toThrow(/^git commit failed in .+: /);
    });

    it('Can_throw_when_the_dir_is_not_a_repo', () => {
      const dir = track(mkdtempSync(join(tmpdir(), 'plain-')));

      // When
      const actual = () => subject.commitAll(dir, identity, someString());

      // Then
      expect(actual).toThrow(/^git add failed in .+: /);
    });
  });

  describe('listTree', () => {
    it('Can_list_every_base_file_with_its_type_and_object_id', () => {
      const repo = track(createTinyRepo());

      // When
      const actual = subject.listTree(repo, 'main');

      // Then
      expect(actual.get('src/hello.txt')).toEqual({
        type: 'file',
        oid: gitOut(repo, 'rev-parse', 'main:src/hello.txt'),
      });
      expect(actual.get('docs/tickets/pending/01-greet/acceptance/greet.sh')?.type).toBe('file');
      expect([...actual.keys()]).toContain('Makefile');
    });

    it('Can_list_the_base_and_ignore_later_changes_when_given_the_base_sha', () => {
      const repo = track(createTinyRepo());
      const base = gitOut(repo, 'rev-parse', 'HEAD');
      writeFileSync(join(repo, 'later.txt'), someString());
      commitAll(repo, 'later');

      // When
      const actual = subject.listTree(repo, base);

      // Then
      expect(actual.has('later.txt')).toBe(false);
    });

    it('Can_throw_when_the_base_does_not_exist', () => {
      const repo = track(createTinyRepo());

      // When
      const actual = () => subject.listTree(repo, `missing-${someString()}`);

      // Then
      expect(actual).toThrow(/^git ls-tree failed in .+: /);
    });
  });

  describe('hashFiles and hashText', () => {
    it('Can_hash_files_in_order_like_git_stores_them', () => {
      const repo = track(createTinyRepo());
      writeFileSync(join(repo, 'a b.txt'), someString());

      // When
      const actual = subject.hashFiles(repo, ['src/hello.txt', 'a b.txt']);

      // Then
      expect(actual).toEqual([
        gitOut(repo, 'rev-parse', 'main:src/hello.txt'),
        gitOut(repo, 'hash-object', '--no-filters', 'a b.txt'),
      ]);
    });

    it('Can_ignore_line_ending_filters_when_the_repo_has_them', () => {
      const repo = track(createTinyRepo());
      writeFileSync(join(repo, '.gitattributes'), '* text=auto eol=lf\n');
      writeFileSync(join(repo, 'crlf.txt'), 'a\r\n');
      writeFileSync(join(repo, 'lf.txt'), 'a\n');

      // When
      const [crlf, lf] = subject.hashFiles(repo, ['crlf.txt', 'lf.txt']);

      // Then
      expect(crlf).not.toBe(lf);
    });

    it('Can_hash_nothing_without_calling_git_when_given_no_paths', () => {
      const dir = track(mkdtempSync(join(tmpdir(), 'plain-')));

      // When
      const actual = subject.hashFiles(dir, []);

      // Then
      expect(actual).toEqual([]);
    });

    it('Can_throw_when_a_file_is_missing', () => {
      const repo = track(createTinyRepo());

      // When
      const actual = () => subject.hashFiles(repo, [`missing-${someString()}`]);

      // Then
      expect(actual).toThrow(/^git hash-object failed in .+: /);
    });

    it('Can_hash_a_symlink_target_like_git_stores_the_link', () => {
      const repo = track(createTinyRepo());
      symlinkSync('src/hello.txt', join(repo, 'link'));
      commitAll(repo, 'link');

      // When
      const actual = subject.hashText(repo, 'src/hello.txt');

      // Then
      expect(actual).toBe(gitOut(repo, 'rev-parse', 'HEAD:link'));
    });
  });

  describe('ignoredPaths', () => {
    it('Can_return_only_the_paths_the_ignore_rules_match', () => {
      const repo = track(createTinyRepo());
      writeFileSync(join(repo, '.gitignore'), 'build/\n*.log\n');

      // When
      const actual = subject.ignoredPaths(repo, [
        'build/out.txt',
        'a.log',
        'src/hello.txt',
        'b c.log',
      ]);

      // Then
      expect(actual).toEqual(new Set(['build/out.txt', 'a.log', 'b c.log']));
    });

    it('Can_report_a_tracked_file_as_ignored_when_a_rule_matches_it', () => {
      const repo = track(createTinyRepo());
      writeFileSync(join(repo, '.gitignore'), 'src/\n');

      // When
      const actual = subject.ignoredPaths(repo, ['src/hello.txt']);

      // Then
      expect(actual).toEqual(new Set(['src/hello.txt']));
    });

    it('Can_return_nothing_when_no_rule_matches', () => {
      const repo = track(createTinyRepo());

      // When
      const actual = subject.ignoredPaths(repo, ['src/hello.txt']);

      // Then
      expect(actual).toEqual(new Set());
    });

    it('Can_return_nothing_without_calling_git_when_given_no_paths', () => {
      const dir = track(mkdtempSync(join(tmpdir(), 'plain-')));

      // When
      const actual = subject.ignoredPaths(dir, []);

      // Then
      expect(actual).toEqual(new Set());
    });

    it('Can_throw_when_the_dir_is_not_a_repo', () => {
      const dir = track(mkdtempSync(join(tmpdir(), 'plain-')));

      // When
      const actual = () => subject.ignoredPaths(dir, ['x']);

      // Then
      expect(actual).toThrow(/^git check-ignore failed in .+: /);
    });
  });

  describe('gitDirs', () => {
    it('Can_give_the_worktree_git_dir_and_the_shared_common_dir', () => {
      const repo = track(createTinyRepo());
      const path = join(track(mkdtempSync(join(tmpdir(), 'work-'))), 'wt');
      subject.addWorktree(repo, path, 'factory/greet', 'main');

      // When
      const actual = subject.gitDirs(path);

      // Then
      const common = realpathSync(join(repo, '.git'));
      expect(actual).toEqual({ gitDir: join(common, 'worktrees', 'wt'), commonDir: common });
    });

    it('Can_give_the_same_dir_twice_when_asked_about_the_main_checkout', () => {
      const repo = track(createTinyRepo());

      // When
      const actual = subject.gitDirs(repo);

      // Then
      const common = realpathSync(join(repo, '.git'));
      expect(actual).toEqual({ gitDir: common, commonDir: common });
    });

    it('Can_throw_when_the_dir_is_not_a_repo', () => {
      const dir = track(mkdtempSync(join(tmpdir(), 'plain-')));

      // When
      const actual = () => subject.gitDirs(dir);

      // Then
      expect(actual).toThrow(/^git rev-parse failed in .+: /);
    });
  });
});
