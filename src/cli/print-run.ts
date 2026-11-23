import { exitCodeOf, type RunResult } from '../run/run-result.js';
import type { Output } from './output.js';

export function printRun(result: RunResult, output: Output): void {
  const count = result.attempts.length;
  const attempts = `${String(count)} attempt${count === 1 ? '' : 's'}`;
  output.out(`${result.outcome} (exit ${String(exitCodeOf(result.outcome))}) after ${attempts}`);
  switch (result.outcome) {
    case 'green':
      output.out(`committed ${result.commit} on ${result.workspace.branch}`);
      return;
    case 'escalated':
      if (result.lastTail !== '') {
        output.out(result.lastTail);
      }
      break;
    case 'spec_defect':
      output.out(`summary: ${result.summary}`);
      output.out(`evidence: ${result.evidence}`);
      break;
    case 'integrity_violation':
      for (const violation of result.violations) {
        output.out(`${violation.kind} ${violation.path}`);
      }
      break;
    case 'worker_error':
      output.out(`error: ${result.error}`);
      break;
  }
  output.out(`worktree kept: ${result.workspace.worktree}`);
}
