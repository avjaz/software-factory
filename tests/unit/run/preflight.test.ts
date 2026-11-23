import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import type { Git } from '../../../src/git/git.js';
import type { Make, MakeResult } from '../../../src/make/make.js';
import { RefusalError } from '../../../src/refusal.js';
import type { PreflightResult } from '../../../src/run/outcome.js';
import { Preflight } from '../../../src/run/preflight.js';
import type { PendingTicket } from '../../../src/tickets/ticket.js';
import { somePositiveInteger, someString, someTicketId } from '../../support/data.js';

function passed(): MakeResult {
  return { exitCode: 0, output: someString() };
}

function failed(): MakeResult {
  return { exitCode: somePositiveInteger(), output: someString() };
}

describe('Preflight', () => {
  let git: MockProxy<Git>;
  let make: MockProxy<Make>;
  let subject: Preflight;
  let workRoot: string;
  let source: string;
  let repo: string;
  let pending: PendingTicket;
  let base: string;
  let worktree: string;

  beforeEach(() => {
    git = mock<Git>();
    make = mock<Make>();
    workRoot = mkdtempSync(join(tmpdir(), 'work-'));
    source = mkdtempSync(join(tmpdir(), 'pending-'));
    subject = new Preflight(git, make, workRoot);
    repo = join(tmpdir(), `repo-${someString()}`);
    const id = someTicketId();
    writeFileSync(join(source, 'a.sh'), someString());
    writeFileSync(join(source, 'helper.ts'), someString());
    pending = {
      dir: source,
      ticket: {
        folder: `01-${id}`,
        number: '01',
        id,
        title: someString(),
        body: someString(),
        design: [],
      },
      testFiles: [
        { source: join(source, 'a.sh'), target: 'acceptance/a.sh' },
        { source: join(source, 'helper.ts'), target: 'src/test/deep/helper.ts' },
      ],
    };
    base = someString();
    worktree = join(workRoot, 'worktrees', `${basename(repo)}-${id}`);
    git.branchExists.mockReturnValue(false);
    git.revParse.mockReturnValue(base);
    git.addWorktree.mockImplementation((_, path) => {
      mkdirSync(join(path, 'acceptance'), { recursive: true });
      writeFileSync(join(path, 'acceptance', 'a.sh'), someString());
    });
  });

  afterEach(() => {
    rmSync(workRoot, { recursive: true, force: true });
    rmSync(source, { recursive: true, force: true });
  });

  async function run(path: string): Promise<PreflightResult> {
    return subject.check(subject.open(path, pending.ticket.id), pending.testFiles);
  }

  it('Can_open_the_workspace_without_running_make', () => {
    // When
    const actual = subject.open(repo, pending.ticket.id);

    // Then
    expect(actual).toEqual(workspace());
    expect(make.run).not.toHaveBeenCalled();
  });

  function workspace(): object {
    return { base, branch: `factory/${pending.ticket.id}`, worktree };
  }

  it('Can_report_ok_with_the_acceptance_result_and_the_tests_copied_in_when_main_is_green_and_the_tests_are_red', async () => {
    // Given
    const acceptance = failed();
    make.run.mockResolvedValueOnce(passed()).mockResolvedValueOnce(acceptance);

    // When
    const actual = await run(repo);

    // Then
    expect(actual).toEqual({ outcome: 'ok', workspace: workspace(), acceptance });
    expect(git.revParse).toHaveBeenCalledExactlyOnceWith(repo, 'main');
    expect(git.addWorktree).toHaveBeenCalledExactlyOnceWith(
      repo,
      worktree,
      `factory/${pending.ticket.id}`,
      base,
    );
    expect(make.run.mock.calls).toEqual([
      [worktree, 'verify'],
      [worktree, 'acceptance'],
    ]);
    expect(readFileSync(join(worktree, 'acceptance/a.sh'), 'utf8')).toBe(
      readFileSync(join(source, 'a.sh'), 'utf8'),
    );
    expect(readFileSync(join(worktree, 'src/test/deep/helper.ts'), 'utf8')).toBe(
      readFileSync(join(source, 'helper.ts'), 'utf8'),
    );
  });

  it('Can_report_baseline_red_before_copying_tests_when_verify_fails', async () => {
    // Given
    const verify = failed();
    make.run.mockResolvedValueOnce(verify);

    // When
    const actual = await run(repo);

    // Then
    expect(actual).toEqual({
      outcome: 'baseline_red',
      workspace: workspace(),
      target: 'verify',
      result: verify,
    });
    expect(make.run).toHaveBeenCalledOnce();
    expect(() => readFileSync(join(worktree, 'src/test/deep/helper.ts'))).toThrow();
  });

  it('Can_report_ticket_already_green_when_acceptance_passes_with_the_tests_in', async () => {
    // Given
    const acceptance = passed();
    make.run.mockResolvedValueOnce(passed()).mockResolvedValueOnce(acceptance);

    // When
    const actual = await run(repo);

    // Then
    expect(actual).toEqual({
      outcome: 'ticket_already_green',
      workspace: workspace(),
      target: 'acceptance',
      result: acceptance,
    });
  });

  it('Can_refuse_without_touching_git_when_the_worktree_path_already_exists', async () => {
    // Given
    mkdirSync(worktree, { recursive: true });

    // When
    const actual = run(repo);

    // Then
    await expect(actual).rejects.toThrow(new RefusalError(`worktree already exists: ${worktree}`));
    expect(git.addWorktree).not.toHaveBeenCalled();
    expect(make.run).not.toHaveBeenCalled();
  });

  it('Can_reuse_the_branch_when_it_exists_and_is_merged_into_main', async () => {
    // Given
    git.branchExists.mockReturnValue(true);
    git.unmergedBranches.mockReturnValue([]);
    make.run.mockResolvedValueOnce(passed()).mockResolvedValueOnce(failed());

    // When
    const actual = await run(repo);

    // Then
    expect(actual.outcome).toBe('ok');
    expect(git.unmergedBranches).toHaveBeenCalledExactlyOnceWith(
      repo,
      'main',
      `factory/${pending.ticket.id}`,
    );
    expect(git.addWorktree).toHaveBeenCalledOnce();
  });

  it('Can_refuse_without_adding_a_worktree_when_the_branch_exists_unmerged', async () => {
    // Given
    git.branchExists.mockReturnValue(true);
    git.unmergedBranches.mockReturnValue([`factory/${pending.ticket.id}`]);

    // When
    const actual = run(repo);

    // Then
    await expect(actual).rejects.toThrow(
      new RefusalError(`branch already exists: factory/${pending.ticket.id}`),
    );
    expect(git.branchExists).toHaveBeenCalledWith(repo, `factory/${pending.ticket.id}`);
    expect(git.addWorktree).not.toHaveBeenCalled();
  });

  it('Can_name_the_worktree_after_the_repo_folder_when_the_repo_path_is_relative', async () => {
    // Given
    make.run.mockResolvedValueOnce(passed()).mockResolvedValueOnce(failed());

    // When
    const actual = await run('.');

    // Then
    expect(actual.workspace.worktree).toBe(
      join(workRoot, 'worktrees', `${basename(process.cwd())}-${pending.ticket.id}`),
    );
  });
});
