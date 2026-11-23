export type FinishStatus = 'done' | 'spec_defect';

export interface FinishResult {
  readonly status: FinishStatus;
  readonly summary: string;
  readonly evidence: string;
}

export interface Usage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly costUsd: number;
}

export type TranscriptMessage = Readonly<Record<string, unknown>>;

export interface WorkerTurn {
  readonly result: FinishResult;
  readonly usage: Usage;
  readonly messages: readonly TranscriptMessage[];
}

export interface WorkerStart {
  readonly worktree: string;
  readonly prompt: string;
}

export interface Worker {
  readonly start: (input: WorkerStart) => Promise<WorkerTurn>;
  readonly resume: (message: string) => Promise<WorkerTurn>;
}
