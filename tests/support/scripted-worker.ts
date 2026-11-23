import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type {
  FinishResult,
  TranscriptMessage,
  Usage,
  Worker,
  WorkerStart,
  WorkerTurn,
} from '../../src/worker/worker.js';

export interface ScriptedStep {
  readonly write?: Readonly<Record<string, string>>;
  readonly delete?: readonly string[];
  readonly result: FinishResult;
  readonly usage?: Usage;
  readonly messages?: readonly TranscriptMessage[];
}

const noUsage: Usage = { inputTokens: 0, outputTokens: 0, costUsd: 0 };

export class ScriptedWorker implements Worker {
  private readonly received: string[] = [];
  private worktree: string | undefined;
  private next = 0;

  constructor(private readonly steps: readonly ScriptedStep[]) {}

  get inputs(): readonly string[] {
    return this.received;
  }

  start(input: WorkerStart): Promise<WorkerTurn> {
    this.worktree = input.worktree;
    return this.take(input.worktree, input.prompt);
  }

  resume(message: string): Promise<WorkerTurn> {
    if (this.worktree === undefined) {
      return Promise.reject(new Error('resume called before start'));
    }
    return this.take(this.worktree, message);
  }

  private take(worktree: string, input: string): Promise<WorkerTurn> {
    this.received.push(input);
    const step = this.steps[this.next];
    if (step === undefined) {
      return Promise.reject(new Error('no more scripted steps'));
    }
    this.next += 1;
    for (const [path, content] of Object.entries(step.write ?? {})) {
      mkdirSync(dirname(join(worktree, path)), { recursive: true });
      writeFileSync(join(worktree, path), content);
    }
    for (const path of step.delete ?? []) {
      rmSync(join(worktree, path), { force: true });
    }
    return Promise.resolve({
      result: step.result,
      usage: step.usage ?? noUsage,
      messages: step.messages ?? [],
    });
  }
}
