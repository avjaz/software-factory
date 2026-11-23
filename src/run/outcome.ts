import type { MakeResult } from '../make/make.js';

export interface Workspace {
  readonly base: string;
  readonly branch: string;
  readonly worktree: string;
}

export interface PreflightPassed {
  readonly outcome: 'ok';
  readonly workspace: Workspace;
  readonly acceptance: MakeResult;
}

export interface PreflightFailed {
  readonly outcome: 'baseline_red' | 'ticket_already_green';
  readonly workspace: Workspace;
  readonly target: 'verify' | 'acceptance';
  readonly result: MakeResult;
}

export type PreflightResult = PreflightPassed | PreflightFailed;

export function isPreflightFailure(result: {
  readonly outcome: string;
}): result is PreflightFailed {
  return result.outcome === 'baseline_red' || result.outcome === 'ticket_already_green';
}
