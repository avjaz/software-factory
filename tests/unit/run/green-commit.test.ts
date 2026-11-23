import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ProcessGit } from '../../../src/git/process-git.js';
import { GreenCommit } from '../../../src/run/green-commit.js';
import type { Workspace } from '../../../src/run/outcome.js';
import type { Ticket } from '../../../src/tickets/ticket.js';
import { createTinyRepo } from '../../support/tiny-repo.js';

function git(dir: string, ...args: readonly string[]): string {
  return spawnSync('git', args, { cwd: dir, encoding: 'utf8' }).stdout.trim();
}

describe('GreenCommit', () => {
  const realGit = new ProcessGit();
  const subject = new GreenCommit(realGit);
  let repo: string;
  let workRoot: string;
  let workspace: Workspace;
  const ticket: Ticket = {
    folder: '01-greet',
    number: '01',
    id: 'greet',
    title: 'Add the greeting file',
    body: '',
    design: [],
  };

  beforeEach(() => {
    repo = createTinyRepo();
    workRoot = mkdtempSync(join(tmpdir(), 'green-'));
    const worktree = join(workRoot, 'wt');
    const base = realGit.revParse(repo, 'main');
    realGit.addWorktree(repo, worktree, 'factory/greet', base);
    writeFileSync(join(worktree, 'src', 'greet.txt'), 'greetings\n');
    workspace = { base, branch: 'factory/greet', worktree };
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
    rmSync(workRoot, { recursive: true, force: true });
  });

  it('Can_commit_the_work_with_the_ticket_moved_to_done_as_the_factory', () => {
    // When
    const actual = subject.commit(repo, workspace, ticket);

    // Then
    expect(actual).toBe(git(repo, 'rev-parse', 'factory/greet'));
    expect(git(repo, 'rev-list', '--count', `${workspace.base}..factory/greet`)).toBe('1');
    expect(git(repo, 'log', '-1', '--format=%an <%ae>|%s', 'factory/greet')).toBe(
      'software-factory <factory@localhost>|Ticket greet: Add the greeting file',
    );
    expect(
      git(repo, 'show', '--name-status', '--no-renames', '--format=', 'factory/greet').split('\n'),
    ).toEqual([
      'A\tdocs/tickets/done/01-greet.md',
      'D\tdocs/tickets/pending/01-greet/acceptance/greet.sh',
      'D\tdocs/tickets/pending/01-greet/ticket.md',
      'A\tsrc/greet.txt',
    ]);
    expect(git(repo, 'show', 'factory/greet:docs/tickets/done/01-greet.md')).toBe(
      git(repo, 'show', 'main:docs/tickets/pending/01-greet/ticket.md'),
    );
  });

  it('Can_remove_the_worktree_and_keep_the_branch_and_main_when_committed', () => {
    // When
    subject.commit(repo, workspace, ticket);

    // Then
    expect(existsSync(workspace.worktree)).toBe(false);
    expect(git(repo, 'branch', '--list', 'factory/greet')).toBe('factory/greet');
    expect(git(repo, 'rev-parse', 'main')).toBe(workspace.base);
    expect(git(repo, 'status', '--porcelain')).toBe('');
  });
});
