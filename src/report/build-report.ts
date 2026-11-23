import type { AttemptRecord, NextResult } from '../run/run-result.js';
import { tail } from '../text/tail.js';
import type { ReportAttempt, RunReport } from './run-report.js';

export interface ReportSettings {
  readonly model: string;
  readonly tailLines: number;
}

export function buildReport(next: NextResult, settings: ReportSettings): RunReport {
  const { result } = next;
  const attempts = 'attempts' in result ? result.attempts.map(attemptOf) : [];
  const head = {
    ticketId: next.ticketId,
    folder: next.folder,
    base: result.workspace.base,
    branch: result.workspace.branch,
    model: settings.model,
    startedAt: next.startedAt.toISOString(),
    timings: { preflightMs: next.preflightMs },
    totalCostUsd: attempts.reduce((total, attempt) => total + attempt.costUsd, 0),
    attempts,
  };
  if (result.outcome === 'green') {
    return { ...head, outcome: 'green', commit: result.commit };
  }
  const kept = { ...head, worktree: result.workspace.worktree };
  const tailOf = (output: string): string => tail(output, settings.tailLines);
  switch (result.outcome) {
    case 'baseline_red':
      return { ...kept, outcome: result.outcome, verifyTail: tailOf(result.result.output) };
    case 'ticket_already_green':
      return { ...kept, outcome: result.outcome, acceptanceTail: tailOf(result.result.output) };
    case 'escalated':
      return { ...kept, outcome: result.outcome };
    case 'spec_defect':
      return {
        ...kept,
        outcome: result.outcome,
        summary: result.summary,
        evidence: result.evidence,
      };
    case 'integrity_violation':
      return { ...kept, outcome: result.outcome, violations: [...result.violations] };
    case 'worker_error':
      return { ...kept, outcome: result.outcome, error: result.error };
  }
}

function attemptOf(record: AttemptRecord): ReportAttempt {
  const usage = record.usage ?? { inputTokens: 0, outputTokens: 0, costUsd: 0 };
  return {
    number: record.number,
    ...(record.result === undefined
      ? {}
      : { status: record.result.status, summary: record.result.summary }),
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    costUsd: usage.costUsd,
    workerMs: record.workerMs,
    ...(record.integrity === undefined
      ? {}
      : { integrity: record.integrity.ok ? 'ok' : 'violation' }),
    ...(record.verify === undefined
      ? {}
      : {
          verifyExit: record.verify.exitCode,
          verifyTail: record.verify.tail,
          verifyMs: record.verify.ms,
        }),
  };
}
