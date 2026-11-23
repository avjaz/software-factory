import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { FactoryCheck } from '../../../src/check/factory-check.js';
import type { Git } from '../../../src/git/git.js';
import { MakeError } from '../../../src/make/make-error.js';
import { RefusalError } from '../../../src/refusal.js';
import type { PreflightResult, Workspace } from '../../../src/run/outcome.js';
import type { PreflightSteps } from '../../../src/run/preflight.js';
import type { TargetCheck } from '../../../src/run/target-guard.js';
import { someString, someTicketId } from '../../support/data.js';
import { ticketSpecFactory, ticketText } from '../../support/factories.js';

describe('FactoryCheck', () => {
  let guard: MockProxy<TargetCheck>;
  let git: MockProxy<Git>;
  let preflight: MockProxy<PreflightSteps>;
  let subject: FactoryCheck;
  let repo: string;
  let id: string;
  let folder: string;
  let workspace: Workspace;

  beforeEach(() => {
    guard = mock<TargetCheck>();
    git = mock<Git>();
    preflight = mock<PreflightSteps>();
    subject = new FactoryCheck(guard, git, preflight);
    repo = mkdtempSync(join(tmpdir(), 'check-'));
    id = someTicketId();
    folder = `02-${id}`;
    workspace = { base: someString(), branch: `factory/${id}`, worktree: someString() };
    const dir = join(repo, 'docs', 'tickets', 'pending', folder);
    const spec = ticketSpecFactory.build();
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'ticket.md'), ticketText({ ...spec, header: { ...spec.header, id } }));
    preflight.open.mockReturnValue(workspace);
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  function expectCleanedUp(): void {
    expect(git.removeWorktree).toHaveBeenCalledExactlyOnceWith(repo, workspace.worktree);
    expect(git.deleteBranch).toHaveBeenCalledExactlyOnceWith(repo, workspace.branch);
  }

  it.each<[string, () => PreflightResult]>([
    ['ok', () => ({ outcome: 'ok', workspace, acceptance: { exitCode: 1, output: someString() } })],
    [
      'baseline_red',
      () => ({
        outcome: 'baseline_red',
        workspace,
        target: 'verify',
        result: { exitCode: 2, output: someString() },
      }),
    ],
    [
      'ticket_already_green',
      () => ({
        outcome: 'ticket_already_green',
        workspace,
        target: 'acceptance',
        result: { exitCode: 0, output: someString() },
      }),
    ],
  ])('Can_return_the_result_and_clean_up_when_preflight_ends_%s', async (_, makeResult) => {
    // Given
    const expected = makeResult();
    preflight.check.mockResolvedValue(expected);

    // When
    const actual = await subject.run(repo, folder);

    // Then
    expect(actual).toBe(expected);
    expect(guard.check).toHaveBeenCalledExactlyOnceWith(repo);
    expect(preflight.open).toHaveBeenCalledExactlyOnceWith(repo, id);
    expect(preflight.check).toHaveBeenCalledExactlyOnceWith(workspace, []);
    expectCleanedUp();
  });

  it('Can_clean_up_and_rethrow_when_make_fails_to_start', async () => {
    // Given
    const error = new MakeError(someString());
    preflight.check.mockRejectedValue(error);

    // When
    const actual = subject.run(repo, folder);

    // Then
    await expect(actual).rejects.toThrow(error);
    expectCleanedUp();
  });

  it('Can_leave_an_existing_worktree_alone_when_preflight_refuses_to_open', async () => {
    // Given
    const error = new RefusalError(`worktree already exists: ${workspace.worktree}`);
    preflight.open.mockImplementation(() => {
      throw error;
    });

    // When
    const actual = subject.run(repo, folder);

    // Then
    await expect(actual).rejects.toThrow(error);
    expect(git.removeWorktree).not.toHaveBeenCalled();
    expect(git.deleteBranch).not.toHaveBeenCalled();
  });

  it('Can_refuse_without_opening_when_the_ticket_is_not_pending', async () => {
    // When
    const actual = subject.run(repo, '09-nope');

    // Then
    await expect(actual).rejects.toThrow(/^no such pending ticket: 09-nope$/);
    expect(preflight.open).not.toHaveBeenCalled();
  });

  it('Can_pass_the_guard_refusal_through_before_reading_the_ticket', async () => {
    // Given
    const error = new RefusalError(someString());
    guard.check.mockImplementation(() => {
      throw error;
    });

    // When
    const actual = subject.run(repo, '09-nope');

    // Then
    await expect(actual).rejects.toThrow(error);
  });

  it('Can_run_on_a_dirty_tree_with_unmerged_branches_when_checking', async () => {
    // Given
    git.isClean.mockReturnValue(false);
    git.unmergedBranches.mockReturnValue(['factory/other']);
    preflight.check.mockResolvedValue({
      outcome: 'ok',
      workspace,
      acceptance: { exitCode: 1, output: someString() },
    });

    // When
    const actual = await subject.run(repo, folder);

    // Then
    expect(actual.outcome).toBe('ok');
    expect(git.isClean).not.toHaveBeenCalled();
    expect(git.unmergedBranches).not.toHaveBeenCalled();
  });
});
