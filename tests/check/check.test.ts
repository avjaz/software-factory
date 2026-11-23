import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import type { Output } from '../../src/cli/output.js';
import { newWorkRoot, testCli } from '../support/cli.js';
import { createTinyRepo, type TinyRepoOptions } from '../support/tiny-repo.js';

describe('factory check', () => {
  const dirs: string[] = [];
  let output: MockProxy<Output>;
  let workRoot: string;

  function tinyRepo(options?: TinyRepoOptions): string {
    const repo = createTinyRepo(options);
    dirs.push(repo);
    return repo;
  }

  function check(repo: string, ticket: string): Promise<number> {
    return testCli(workRoot)(['check', '--repo', repo, '--ticket', ticket], output);
  }

  function git(dir: string, ...args: readonly string[]): string {
    return spawnSync('git', args, { cwd: dir, encoding: 'utf8' }).stdout;
  }

  function worktreeOf(repo: string, id: string): string {
    return join(workRoot, 'worktrees', `${basename(repo)}-${id}`);
  }

  function printed(): readonly unknown[] {
    return output.out.mock.calls.map(([line]) => line);
  }

  function expectOk(ticket: string, failure: string): void {
    const [first, ...rest] = printed();
    expect(first).toBe(`ok: main is green, ${ticket} is red`);
    expect(rest.join('\n')).toContain(failure);
  }

  function expectCleanedUp(repo: string): void {
    expect(existsSync(worktreeOf(repo, 'greet'))).toBe(false);
    expect(git(repo, 'branch', '--list', 'factory/*')).toBe('');
    expect(git(repo, 'worktree', 'list', '--porcelain').match(/^worktree /gm)).toHaveLength(1);
  }

  beforeEach(() => {
    output = mock<Output>();
    workRoot = newWorkRoot();
    dirs.push(workRoot);
  });

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('Can_say_ok_and_leave_no_worktree_or_branch_when_the_tiny_repo_is_fresh', async () => {
    const repo = tinyRepo();

    // When
    const actual = await check(repo, '01-greet');

    // Then
    expect(actual).toBe(0);
    expectOk('01-greet', 'src/greet.txt does not contain greetings');
    expect(output.err).not.toHaveBeenCalled();
    expectCleanedUp(repo);
    expect(git(repo, 'status', '--porcelain', '--untracked-files=all')).toBe('');
  });

  it('Can_report_baseline_red_with_exit_1_and_clean_up_when_main_is_broken', async () => {
    const repo = tinyRepo({ broken: true });

    // When
    const actual = await check(repo, '01-greet');

    // Then
    expect(actual).toBe(1);
    expect(printed()).toEqual([
      'baseline_red: make verify exited 2',
      expect.stringContaining('BROKEN is present'),
    ]);
    expectCleanedUp(repo);
  });

  it('Can_report_ticket_already_green_with_exit_1_and_clean_up_when_the_code_exists', async () => {
    const repo = tinyRepo({ alreadyGreen: true });

    // When
    const actual = await check(repo, '01-greet');

    // Then
    expect(actual).toBe(1);
    expect(printed()[0]).toBe('ticket_already_green: make acceptance exited 0');
    expectCleanedUp(repo);
  });

  it('Can_refuse_with_exit_2_when_the_ticket_is_not_pending', async () => {
    const repo = tinyRepo();

    // When
    const actual = await check(repo, '09-nope');

    // Then
    expect(actual).toBe(2);
    expect(output.err).toHaveBeenCalledExactlyOnceWith('no such pending ticket: 09-nope');
    expect(output.out).not.toHaveBeenCalled();
  });

  it('Can_check_a_ticket_that_is_not_next_when_it_is_named', async () => {
    const repo = tinyRepo();

    // When
    const actual = await check(repo, '02-farewell');

    // Then
    expect(actual).toBe(0);
    expectOk('02-farewell', 'src/farewell.txt does not contain farewell');
  });

  it('Can_use_uncommitted_test_files_when_the_author_has_just_written_them', async () => {
    const repo = tinyRepo({ alreadyGreen: true });
    const extra = join(repo, 'docs/tickets/pending/01-greet/acceptance/extra.sh');
    writeFileSync(extra, 'grep -q welcome src/greet.txt\n');

    // When
    const actual = await check(repo, '01-greet');

    // Then
    expect(actual).toBe(0);
    expectOk('01-greet', 'make: *** [acceptance] Error 1');
    expect(git(repo, 'status', '--porcelain')).toBe(
      '?? docs/tickets/pending/01-greet/acceptance/extra.sh\n',
    );
  });

  it('Can_refuse_and_leave_the_worktree_alone_when_one_already_exists', async () => {
    const repo = tinyRepo();
    const worktree = worktreeOf(repo, 'greet');
    mkdirSync(worktree, { recursive: true });
    writeFileSync(join(worktree, 'kept.txt'), 'kept\n');

    // When
    const actual = await check(repo, '01-greet');

    // Then
    expect(actual).toBe(2);
    expect(output.err).toHaveBeenCalledExactlyOnceWith(`worktree already exists: ${worktree}`);
    expect(existsSync(join(worktree, 'kept.txt'))).toBe(true);
  });
});
