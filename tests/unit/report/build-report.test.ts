import { beforeEach, describe, expect, it } from 'vitest';

import { buildReport, type ReportSettings } from '../../../src/report/build-report.js';
import { runReportSchema } from '../../../src/report/run-report.js';
import type { Violation } from '../../../src/integrity/violation.js';
import type { Workspace } from '../../../src/run/outcome.js';
import type { AttemptRecord, NextResult } from '../../../src/run/run-result.js';
import {
  someCostUsd,
  someMessages,
  somePositiveInteger,
  someString,
  someTicketId,
  someUsage,
} from '../../support/data.js';
import { attempt } from '../../support/factories.js';

function finishedAttempt(number: number): AttemptRecord {
  return {
    number,
    workerMs: somePositiveInteger(),
    messages: someMessages(),
    result: { status: 'done', summary: someString(), evidence: '' },
    usage: someUsage(),
  };
}

function fullAttempt(number: number): AttemptRecord {
  return {
    ...finishedAttempt(number),
    integrity: { ok: true },
    verify: { exitCode: somePositiveInteger(), tail: someString(), ms: somePositiveInteger() },
  };
}

describe('buildReport', () => {
  let settings: ReportSettings;
  let workspace: Workspace;
  let ticketId: string;
  let startedAt: Date;
  let preflightMs: number;

  beforeEach(() => {
    settings = { model: someString(), tailLines: 2 };
    ticketId = someTicketId();
    workspace = { base: someString(), branch: `factory/${ticketId}`, worktree: someString() };
    startedAt = new Date();
    preflightMs = somePositiveInteger();
  });

  function next(result: NextResult['result']): NextResult {
    return { folder: `01-${ticketId}`, ticketId, startedAt, preflightMs, result };
  }

  it('Can_report_a_green_run_with_its_commit_settings_timings_and_every_attempt_field', () => {
    const one = fullAttempt(1);
    const commit = someString();

    // When
    const actual = buildReport(
      next({ outcome: 'green', attempts: [one], workspace, commit }),
      settings,
    );

    // Then
    expect(actual).toEqual({
      outcome: 'green',
      ticketId,
      folder: `01-${ticketId}`,
      base: workspace.base,
      branch: workspace.branch,
      commit,
      model: settings.model,
      startedAt: startedAt.toISOString(),
      timings: { preflightMs },
      totalCostUsd: one.usage?.costUsd,
      attempts: [
        {
          number: 1,
          status: 'done',
          summary: one.result?.summary,
          inputTokens: one.usage?.inputTokens,
          outputTokens: one.usage?.outputTokens,
          costUsd: one.usage?.costUsd,
          workerMs: one.workerMs,
          integrity: 'ok',
          verifyExit: one.verify?.exitCode,
          verifyTail: one.verify?.tail,
          verifyMs: one.verify?.ms,
        },
      ],
    });
    expect(runReportSchema.safeParse(actual).success).toBe(true);
  });

  it('Can_sum_the_attempt_costs_into_the_total', () => {
    const costs = [someCostUsd(), someCostUsd(), someCostUsd()];
    const attempts = costs.map((costUsd, index) => ({
      ...fullAttempt(index + 1),
      usage: { inputTokens: 1, outputTokens: 1, costUsd },
    }));

    // When
    const actual = buildReport(
      next({ outcome: 'escalated', attempts, workspace, lastTail: '' }),
      settings,
    );

    // Then
    expect(actual.totalCostUsd).toBeCloseTo(
      costs.reduce((total, cost) => total + cost, 0),
      10,
    );
  });

  it('Can_report_zero_usage_and_leave_out_what_never_ran_when_the_worker_failed', () => {
    const failed = attempt(1);

    // When
    const actual = buildReport(
      next({ outcome: 'worker_error', attempts: [failed], workspace, error: someString() }),
      settings,
    );

    // Then
    expect(actual.attempts).toEqual([
      { number: 1, inputTokens: 0, outputTokens: 0, costUsd: 0, workerMs: failed.workerMs },
    ]);
    expect(actual.totalCostUsd).toBe(0);
  });

  it('Can_mark_the_attempt_integrity_as_violation_when_the_check_failed', () => {
    const violations: readonly Violation[] = [{ path: someString(), kind: 'added' }];
    const one: AttemptRecord = { ...finishedAttempt(1), integrity: { ok: false, violations } };

    // When
    const actual = buildReport(
      next({ outcome: 'integrity_violation', attempts: [one], workspace, violations }),
      settings,
    );

    // Then
    expect(actual).toMatchObject({
      outcome: 'integrity_violation',
      worktree: workspace.worktree,
      violations,
      attempts: [{ integrity: 'violation' }],
    });
    expect(actual.attempts[0]).not.toHaveProperty('verifyExit');
    expect(runReportSchema.safeParse(actual).success).toBe(true);
  });

  it.each<
    [string, (attempts: readonly AttemptRecord[], ws: Workspace) => NextResult['result'], object]
  >([
    [
      'escalated',
      (attempts, ws) => ({ outcome: 'escalated', attempts, workspace: ws, lastTail: 'x' }),
      {},
    ],
    [
      'spec_defect',
      (attempts, ws) => ({
        outcome: 'spec_defect',
        attempts,
        workspace: ws,
        summary: 'wrong test',
        evidence: 'greet.sh',
      }),
      { summary: 'wrong test', evidence: 'greet.sh' },
    ],
    [
      'worker_error',
      (attempts, ws) => ({ outcome: 'worker_error', attempts, workspace: ws, error: 'boom' }),
      { error: 'boom' },
    ],
  ])('Can_report_%s_with_the_worktree_and_no_commit', (outcome, result, extra) => {
    // When
    const actual = buildReport(next(result([fullAttempt(1)], workspace)), settings);

    // Then
    expect(actual).toMatchObject({ outcome, worktree: workspace.worktree, ...extra });
    expect(actual).not.toHaveProperty('commit');
    expect(runReportSchema.safeParse(actual).success).toBe(true);
  });

  it.each([
    ['baseline_red', 'verify', 'verifyTail'],
    ['ticket_already_green', 'acceptance', 'acceptanceTail'],
  ] as const)(
    'Can_report_%s_with_no_attempts_and_the_last_lines_of_make_%s',
    (outcome, target, field) => {
      // When
      const actual = buildReport(
        next({
          outcome,
          workspace,
          target,
          result: { exitCode: 2, output: 'one\ntwo\nthree\n' },
        }),
        settings,
      );

      // Then
      expect(actual).toMatchObject({
        outcome,
        worktree: workspace.worktree,
        attempts: [],
        totalCostUsd: 0,
        [field]: 'two\nthree',
      });
      expect(runReportSchema.safeParse(actual).success).toBe(true);
    },
  );
});
