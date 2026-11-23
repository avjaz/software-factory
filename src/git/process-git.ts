import { realpathSync } from 'node:fs';

import { type Change, parseChanges } from './change.js';
import type { Git, GitDirs, GitIdentity } from './git.js';
import { parseTree, type TreeEntry } from './tree.js';
import { git, gitFailure, gitOk } from './run-git.js';

export class ProcessGit implements Git {
  isTopLevel(dir: string): boolean {
    const result = git(dir, { label: 'rev-parse', args: ['rev-parse', '--show-toplevel'] });
    if (result.status !== 0) {
      return false;
    }
    return realpathSync(result.stdout.trim()) === realpathSync(dir);
  }

  isClean(dir: string): boolean {
    return gitOk(dir, { label: 'status', args: ['status', '--porcelain'] }) === '';
  }

  unmergedBranches(dir: string, base: string, pattern: string): readonly string[] {
    const format = '--format=%(refname:short)';
    const args = ['branch', '--no-merged', base, '--list', pattern, format];
    return [...lines(gitOk(dir, { label: 'branch', args }))].sort();
  }

  revParse(dir: string, ref: string): string {
    const args = ['rev-parse', '--verify', `${ref}^{commit}`];
    return gitOk(dir, { label: 'rev-parse', args }).trim();
  }

  branchExists(repo: string, branch: string): boolean {
    const call = {
      label: 'show-ref',
      args: ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`],
    };
    const result = git(repo, call);
    if (result.status !== 0 && result.status !== 1) {
      throw gitFailure(repo, call, result);
    }
    return result.status === 0;
  }

  addWorktree(repo: string, path: string, branch: string, startPoint: string): void {
    gitOk(repo, { label: 'worktree prune', args: ['worktree', 'prune'] });
    const args = ['worktree', 'add', '--quiet', '-B', branch, path, startPoint];
    gitOk(repo, { label: 'worktree add', args });
  }

  removeWorktree(repo: string, path: string): void {
    gitOk(repo, { label: 'worktree remove', args: ['worktree', 'remove', '--force', path] });
  }

  deleteBranch(repo: string, branch: string): void {
    gitOk(repo, { label: 'branch', args: ['branch', '-D', branch] });
  }

  changes(dir: string, base: string): readonly Change[] {
    const args = ['diff', '--name-status', '--no-renames', '-z', base, '--'];
    const tracked = gitOk(dir, { label: 'diff', args });
    const untrackedArgs = ['ls-files', '--others', '--exclude-standard', '-z'];
    const untracked = gitOk(dir, { label: 'ls-files', args: untrackedArgs });
    return parseChanges(tracked, untracked);
  }

  commitAll(dir: string, identity: GitIdentity, message: string): string {
    gitOk(dir, { label: 'add', args: ['add', '--all'] });
    const env = {
      GIT_AUTHOR_NAME: identity.name,
      GIT_AUTHOR_EMAIL: identity.email,
      GIT_COMMITTER_NAME: identity.name,
      GIT_COMMITTER_EMAIL: identity.email,
    };
    const args = ['-c', 'commit.gpgsign=false', 'commit', '--quiet', '--no-verify', '-m', message];
    gitOk(dir, { label: 'commit', args, env });
    return this.revParse(dir, 'HEAD');
  }

  cleanIgnored(dir: string): void {
    gitOk(dir, { label: 'clean', args: ['clean', '-fdX', '--quiet'] });
  }

  listTree(dir: string, base: string): ReadonlyMap<string, TreeEntry> {
    const args = ['ls-tree', '-r', '-z', '--full-tree', base];
    return parseTree(gitOk(dir, { label: 'ls-tree', args }));
  }

  hashFiles(dir: string, paths: readonly string[]): readonly string[] {
    if (paths.length === 0) {
      return [];
    }
    const args = ['hash-object', '--no-filters', '--stdin-paths'];
    return lines(gitOk(dir, { label: 'hash-object', args, input: `${paths.join('\n')}\n` }));
  }

  hashText(dir: string, text: string): string {
    const args = ['hash-object', '--stdin'];
    return gitOk(dir, { label: 'hash-object', args, input: text }).trim();
  }

  gitDirs(dir: string): GitDirs {
    const args = ['rev-parse', '--path-format=absolute', '--git-dir', '--git-common-dir'];
    const [gitDir = '', commonDir = ''] = lines(gitOk(dir, { label: 'rev-parse', args }));
    return { gitDir, commonDir };
  }

  ignoredPaths(dir: string, paths: readonly string[]): ReadonlySet<string> {
    if (paths.length === 0) {
      return new Set();
    }
    const call = {
      label: 'check-ignore',
      args: ['check-ignore', '-z', '--stdin', '--no-index'],
      input: paths.join('\0'),
    };
    const result = git(dir, call);
    if (result.status !== 0 && result.status !== 1) {
      throw gitFailure(dir, call, result);
    }
    return new Set(result.stdout.split('\0').filter((path) => path !== ''));
  }
}

function lines(text: string): readonly string[] {
  return text.split('\n').filter((line) => line !== '');
}
