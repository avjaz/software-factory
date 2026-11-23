import type { IntegrityResult, Violation } from '../integrity/violation.js';
import type { FinishResult, TranscriptMessage, Usage } from '../worker/worker.js';
import type { PreflightFailed, Workspace } from './outcome.js';

export type LoopOutcome =
  'green' | 'escalated' | 'spec_defect' | 'integrity_violation' | 'worker_error';

export type Outcome = LoopOutcome | PreflightFailed['outcome'];

export interface VerifyRecord {
  readonly exitCode: number;
  readonly tail: string;
  readonly ms: number;
}

export interface AttemptRecord {
  readonly number: number;
  readonly workerMs: number;
  readonly messages: readonly TranscriptMessage[];
  readonly result?: FinishResult;
  readonly usage?: Usage;
  readonly integrity?: IntegrityResult;
  readonly verify?: VerifyRecord;
}

interface Attempts {
  readonly attempts: readonly AttemptRecord[];
}

export type LoopResult =
  | (Attempts & { readonly outcome: 'green' })
  | (Attempts & { readonly outcome: 'escalated'; readonly lastTail: string })
  | (Attempts & {
      readonly outcome: 'spec_defect';
      readonly summary: string;
      readonly evidence: string;
    })
  | (Attempts & {
      readonly outcome: 'integrity_violation';
      readonly violations: readonly Violation[];
    })
  | (Attempts & { readonly outcome: 'worker_error'; readonly error: string });

interface InWorkspace {
  readonly workspace: Workspace;
}

export type RunResult =
  | (Extract<LoopResult, { outcome: 'green' }> & InWorkspace & { readonly commit: string })
  | (Exclude<LoopResult, { outcome: 'green' }> & InWorkspace);

export interface NextResult {
  readonly folder: string;
  readonly ticketId: string;
  readonly startedAt: Date;
  readonly preflightMs: number;
  readonly result: PreflightFailed | RunResult;
}

export function exitCodeOf(outcome: Outcome): number {
  return outcome === 'green' ? 0 : 1;
}
