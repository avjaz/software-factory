import { beforeEach, describe, expect, it } from 'vitest';

import { reportMarkdown } from '../../../src/report/report-markdown.js';
import {
  type ReportAttempt,
  type RunReport,
  runReportSchema,
} from '../../../src/report/run-report.js';
import { someString, someTicketId } from '../../support/data.js';

const checked: ReportAttempt = {
  number: 1,
  status: 'done',
  summary: 'did the work',
  inputTokens: 120,
  outputTokens: 45,
  costUsd: 0.12345,
  workerMs: 2500,
  integrity: 'ok',
};

function attemptOf(overrides: Partial<ReportAttempt> = {}): ReportAttempt {
  return { ...checked, verifyExit: 0, verifyTail: 'all passed', verifyMs: 1250, ...overrides };
}

type Head = Omit<Extract<RunReport, { outcome: 'green' }>, 'outcome' | 'commit'>;

describe('reportMarkdown', () => {
  let ticketId: string;
  let common: Head;
  let head: Head & { readonly worktree: string };

  beforeEach(() => {
    ticketId = someTicketId();
    common = {
      ticketId,
      folder: `01-${ticketId}`,
      base: 'abc123',
      branch: `factory/${ticketId}`,
      model: 'claude-opus-5-5',
      startedAt: '2026-11-16T05:00:00.000Z',
      timings: { preflightMs: 3000 },
      totalCostUsd: 0.5,
      attempts: [],
    };
    head = { ...common, worktree: '/work/tree' };
  });

  function lines(report: RunReport): readonly string[] {
    return reportMarkdown(report).split('\n');
  }

  it('Can_name_the_outcome_and_ticket_on_the_first_line_and_list_the_run_facts', () => {
    const commit = someString();

    // When
    const actual = reportMarkdown({ ...common, outcome: 'green', commit });

    // Then
    expect(actual.split('\n').slice(0, 10)).toEqual([
      `# green: ${ticketId}`,
      '',
      `- ticket: 01-${ticketId}`,
      `- branch: factory/${ticketId} (base abc123)`,
      `- commit: ${commit}`,
      '- model: claude-opus-5-5',
      '- started: 2026-11-16T05:00:00.000Z',
      '- pre-flight: 3.0s',
      '- total cost: $0.5000',
      '',
    ]);
    expect(actual.endsWith('\n')).toBe(true);
  });

  it('Can_show_status_tokens_cost_timings_integrity_and_verify_for_a_passing_attempt', () => {
    // When
    const actual = lines({ ...head, outcome: 'escalated', attempts: [attemptOf()] });

    // Then
    expect(actual).toContain('- worktree: /work/tree');
    expect(actual.slice(10)).toEqual([
      '## Attempt 1',
      '',
      '- status: done',
      '- summary: did the work',
      '- tokens: 120 in, 45 out',
      '- cost: $0.1235',
      '- worker: 2.5s',
      '- integrity: ok',
      '- verify: exit 0 (1.3s)',
      '',
    ]);
  });

  it('Can_fence_the_verify_tail_when_verify_failed', () => {
    // When
    const actual = lines({
      ...head,
      outcome: 'escalated',
      attempts: [attemptOf({ verifyExit: 2, verifyTail: 'boom\nbang' })],
    });

    // Then
    expect(actual.slice(-7)).toEqual([
      '- verify: exit 2 (1.3s)',
      '',
      '~~~',
      'boom',
      'bang',
      '~~~',
      '',
    ]);
  });

  it('Can_show_a_failed_verify_without_a_fence_or_time_when_neither_was_recorded', () => {
    const attempt: ReportAttempt = { ...checked, verifyExit: 2 };

    // When
    const actual = lines({ ...head, outcome: 'escalated', attempts: [attempt] });

    // Then
    expect(actual.slice(-2)).toEqual(['- verify: exit 2 (0.0s)', '']);
  });

  it('Can_say_what_never_happened_when_the_worker_returned_nothing', () => {
    const attempt: ReportAttempt = {
      number: 1,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      workerMs: 0,
    };

    // When
    const actual = lines({
      ...head,
      outcome: 'worker_error',
      error: 'sdk down',
      attempts: [attempt],
    });

    // Then
    expect(actual).toContain('- status: no result');
    expect(actual).toContain('- integrity: not checked');
    expect(actual).toContain('- verify: not run');
    expect(actual.some((line) => line.startsWith('- summary:'))).toBe(false);
  });

  it.each<[string, RunReport['outcome'], object, readonly string[]]>([
    [
      'baseline_red',
      'baseline_red',
      { verifyTail: 'BROKEN' },
      ['## make verify on main', '', '~~~', 'BROKEN', '~~~'],
    ],
    [
      'ticket_already_green',
      'ticket_already_green',
      { acceptanceTail: 'passed' },
      ['## make acceptance before any change', '', '~~~', 'passed', '~~~'],
    ],
    [
      'spec_defect',
      'spec_defect',
      { summary: 'wrong test', evidence: 'greet.sh' },
      ['## Spec defect', '', 'wrong test', '', 'greet.sh'],
    ],
    [
      'integrity_violation',
      'integrity_violation',
      { violations: [{ path: 'Makefile', kind: 'makefile_mismatch' }] },
      ['## Violations', '', '- makefile_mismatch Makefile'],
    ],
    ['worker_error', 'worker_error', { error: 'sdk down' }, ['## Worker error', '', 'sdk down']],
  ])('Can_add_the_outcome_section_when_the_outcome_is_%s', (_, outcome, extra, section) => {
    const report = runReportSchema.parse({ ...head, outcome, ...extra });

    // When
    const actual = lines(report);

    // Then
    expect(actual.slice(10, 10 + section.length)).toEqual(section);
  });
});
