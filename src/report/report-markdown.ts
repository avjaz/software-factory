import type { ReportAttempt, RunReport } from './run-report.js';

export function reportMarkdown(report: RunReport): string {
  const lines = [
    `# ${report.outcome}: ${report.ticketId}`,
    '',
    `- ticket: ${report.folder}`,
    `- branch: ${report.branch} (base ${report.base})`,
    report.outcome === 'green' ? `- commit: ${report.commit}` : `- worktree: ${report.worktree}`,
    `- model: ${report.model}`,
    `- started: ${report.startedAt}`,
    `- pre-flight: ${seconds(report.timings.preflightMs)}`,
    `- total cost: ${dollars(report.totalCostUsd)}`,
    ...outcomeLines(report),
    ...report.attempts.flatMap(attemptLines),
  ];
  return `${lines.join('\n')}\n`;
}

function outcomeLines(report: RunReport): readonly string[] {
  switch (report.outcome) {
    case 'baseline_red':
      return ['', '## make verify on main', ...fenced(report.verifyTail)];
    case 'ticket_already_green':
      return ['', '## make acceptance before any change', ...fenced(report.acceptanceTail)];
    case 'spec_defect':
      return ['', '## Spec defect', '', report.summary, '', report.evidence];
    case 'integrity_violation':
      return ['', '## Violations', '', ...report.violations.map((v) => `- ${v.kind} ${v.path}`)];
    case 'worker_error':
      return ['', '## Worker error', '', report.error];
    case 'green':
    case 'escalated':
      return [];
  }
}

function attemptLines(attempt: ReportAttempt): readonly string[] {
  const head = [
    '',
    `## Attempt ${String(attempt.number)}`,
    '',
    `- status: ${attempt.status ?? 'no result'}`,
    ...(attempt.summary === undefined ? [] : [`- summary: ${attempt.summary}`]),
    `- tokens: ${String(attempt.inputTokens)} in, ${String(attempt.outputTokens)} out`,
    `- cost: ${dollars(attempt.costUsd)}`,
    `- worker: ${seconds(attempt.workerMs)}`,
    `- integrity: ${attempt.integrity ?? 'not checked'}`,
  ];
  if (attempt.verifyExit === undefined) {
    return [...head, '- verify: not run'];
  }
  const verify = `- verify: exit ${String(attempt.verifyExit)} (${seconds(attempt.verifyMs ?? 0)})`;
  return attempt.verifyExit === 0 || attempt.verifyTail === undefined
    ? [...head, verify]
    : [...head, verify, ...fenced(attempt.verifyTail)];
}

function fenced(text: string): readonly string[] {
  return ['', '~~~', text, '~~~'];
}

function dollars(usd: number): string {
  return `$${usd.toFixed(4)}`;
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}
