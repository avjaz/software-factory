import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import type { Git } from '../../../src/git/git.js';
import { FactoryNext } from '../../../src/next/factory-next.js';
import type { PreflightResult, Workspace } from '../../../src/run/outcome.js';
import type { RunResult } from '../../../src/run/run-result.js';
import type { Target } from '../../../src/run/target-guard.js';
import type { TicketRunner } from '../../../src/run/ticket-run.js';
import type { PreflightSteps } from '../../../src/run/preflight.js';
import { RefusalError } from '../../../src/refusal.js';
import type { TargetCheck } from '../../../src/run/target-guard.js';
import { TicketError } from '../../../src/tickets/ticket-error.js';
import { nextTicket } from '../../../src/tickets/ticket-queue.js';
import { tickingClock } from '../../support/clock.js';
import { somePositiveInteger, someString, someTicketId } from '../../support/data.js';
import { attempt, ticketSpecFactory, ticketText } from '../../support/factories.js';

describe('FactoryNext', () => {
  let guard: MockProxy<TargetCheck>;
  let git: MockProxy<Git>;
  let preflight: MockProxy<PreflightSteps>;
  let runner: MockProxy<TicketRunner>;
  let subject: FactoryNext;
  let target: Target;
  let repo: string;
  let id: string;
  let workspace: Workspace;
  let start: Date;
  let step: number;

  beforeEach(() => {
    guard = mock<TargetCheck>();
    git = mock<Git>();
    preflight = mock<PreflightSteps>();
    runner = mock<TicketRunner>();
    start = new Date();
    step = somePositiveInteger();
    subject = new FactoryNext(guard, git, preflight, runner, tickingClock(start, step));
    target = mock<Target>();
    guard.check.mockReturnValue(target);
    repo = mkdtempSync(join(tmpdir(), 'next-'));
    id = someTicketId();
    workspace = { base: someString(), branch: `factory/${id}`, worktree: someString() };
    addTicket(`01-${id}`, id);
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  function addTicket(folder: string, ticketId: string): void {
    const dir = join(repo, 'docs', 'tickets', 'pending', folder);
    const spec = ticketSpecFactory.build();
    mkdirSync(join(dir, 'acceptance'), { recursive: true });
    writeFileSync(join(dir, 'acceptance', 'x.sh'), someString());
    writeFileSync(
      join(dir, 'ticket.md'),
      ticketText({ ...spec, header: { ...spec.header, id: ticketId } }),
    );
  }

  function givenReady(): void {
    git.isClean.mockReturnValue(true);
    git.unmergedBranches.mockReturnValue([]);
    preflight.open.mockReturnValue(workspace);
  }

  it('Can_run_the_ticket_after_preflight_on_the_lowest_ticket_when_every_refusal_passes', async () => {
    // Given
    const run: RunResult = {
      outcome: 'green',
      attempts: [attempt(1)],
      workspace,
      commit: someString(),
    };
    givenReady();
    preflight.check.mockResolvedValue({
      outcome: 'ok',
      workspace,
      acceptance: { exitCode: 1, output: someString() },
    });
    runner.run.mockResolvedValue(run);

    // When
    const actual = await subject.run(repo);

    // Then
    expect(actual).toEqual({
      folder: `01-${id}`,
      ticketId: id,
      startedAt: start,
      preflightMs: step,
      result: run,
    });
    expect(runner.run).toHaveBeenCalledExactlyOnceWith(repo, target, nextTicket(repo), workspace);
    expect(guard.check).toHaveBeenCalledExactlyOnceWith(repo);
    expect(git.unmergedBranches).toHaveBeenCalledExactlyOnceWith(repo, 'main', 'factory/*');
    expect(preflight.open).toHaveBeenCalledExactlyOnceWith(repo, id);
    expect(preflight.check).toHaveBeenCalledExactlyOnceWith(workspace, [
      {
        source: join(repo, 'docs', 'tickets', 'pending', `01-${id}`, 'acceptance', 'x.sh'),
        target: 'acceptance/x.sh',
      },
    ]);
  });

  it('Can_return_the_preflight_failure_without_running_the_ticket_when_main_is_red', async () => {
    // Given
    const failed: PreflightResult = {
      outcome: 'baseline_red',
      workspace,
      target: 'verify',
      result: { exitCode: 2, output: someString() },
    };
    givenReady();
    preflight.check.mockResolvedValue(failed);

    // When
    const actual = await subject.run(repo);

    // Then
    expect(actual).toEqual({
      folder: `01-${id}`,
      ticketId: id,
      startedAt: start,
      preflightMs: step,
      result: failed,
    });
    expect(runner.run).not.toHaveBeenCalled();
  });

  it('Can_pass_the_guard_refusal_through_before_checking_the_tree', async () => {
    // Given
    const error = new RefusalError(someString());
    guard.check.mockImplementation(() => {
      throw error;
    });

    // When
    const actual = subject.run(repo);

    // Then
    await expect(actual).rejects.toThrow(error);
    expect(git.isClean).not.toHaveBeenCalled();
  });

  it('Can_refuse_before_reading_the_queue_when_the_tree_is_dirty', async () => {
    // Given
    givenReady();
    git.isClean.mockReturnValue(false);
    rmSync(join(repo, 'docs'), { recursive: true });

    // When
    const actual = subject.run(repo);

    // Then
    await expect(actual).rejects.toThrow(new RefusalError('working tree is dirty'));
    expect(git.isClean).toHaveBeenCalledWith(repo);
  });

  it('Can_refuse_when_no_ticket_is_pending', async () => {
    // Given
    givenReady();
    rmSync(join(repo, 'docs'), { recursive: true });

    // When
    const actual = subject.run(repo);

    // Then
    await expect(actual).rejects.toThrow(new RefusalError('no pending ticket'));
    expect(git.unmergedBranches).not.toHaveBeenCalled();
  });

  it('Can_pass_the_ticket_error_through_before_checking_branches_when_the_ticket_is_invalid', async () => {
    // Given
    givenReady();
    addTicket('00-other', `x${someTicketId()}`);

    // When
    const actual = subject.run(repo);

    // Then
    await expect(actual).rejects.toThrow(TicketError);
    expect(git.unmergedBranches).not.toHaveBeenCalled();
  });

  it('Can_refuse_naming_every_branch_before_preflight_when_factory_branches_are_unmerged', async () => {
    // Given
    givenReady();
    git.unmergedBranches.mockReturnValue(['factory/a', 'factory/b']);

    // When
    const actual = subject.run(repo);

    // Then
    await expect(actual).rejects.toThrow(
      new RefusalError('unmerged factory branch: factory/a, factory/b'),
    );
    expect(preflight.open).not.toHaveBeenCalled();
  });
});
