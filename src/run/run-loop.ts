import type { Git } from '../git/git.js';
import type { Integrity, IntegrityInput } from '../integrity/integrity-check.js';
import type { Make, MakeResult } from '../make/make.js';
import { tail } from '../text/tail.js';
import { type Clock, since } from '../time/clock.js';
import type { Worker, WorkerTurn } from '../worker/worker.js';
import { verifyFeedback } from './feedback.js';
import type { AttemptRecord, LoopResult, VerifyRecord } from './run-result.js';

export interface LoopSettings {
  readonly maxAttempts: number;
  readonly tailLines: number;
}

type Turn =
  | { readonly ok: true; readonly turn: WorkerTurn; readonly ms: number }
  | { readonly ok: false; readonly error: string; readonly ms: number };

interface Verified {
  readonly record: VerifyRecord;
  readonly result: MakeResult;
}

export class RunLoop {
  constructor(
    private readonly make: Make,
    private readonly integrity: Integrity,
    private readonly git: Git,
    private readonly settings: LoopSettings,
    private readonly clock: Clock,
  ) {}

  async run(worker: Worker, prompt: string, input: IntegrityInput): Promise<LoopResult> {
    const attempts: AttemptRecord[] = [];
    let feedback = '';
    let lastTail = '';
    for (let number = 1; number <= this.settings.maxAttempts; number += 1) {
      const outcome = await this.turn(() =>
        number === 1 ? worker.start({ worktree: input.worktree, prompt }) : worker.resume(feedback),
      );
      if (!outcome.ok) {
        attempts.push({ number, workerMs: outcome.ms, messages: [] });
        return { outcome: 'worker_error', attempts, error: outcome.error };
      }
      const { result, usage, messages } = outcome.turn;
      const done = { number, workerMs: outcome.ms, messages, result, usage };
      if (result.status === 'spec_defect') {
        attempts.push(done);
        return result.evidence.trim() === ''
          ? { outcome: 'worker_error', attempts, error: 'spec_defect without evidence' }
          : {
              outcome: 'spec_defect',
              attempts,
              summary: result.summary,
              evidence: result.evidence,
            };
      }
      const integrity = this.integrity.check(input);
      if (!integrity.ok) {
        attempts.push({ ...done, integrity });
        return { outcome: 'integrity_violation', attempts, violations: integrity.violations };
      }
      // Ignored files (build output) are invisible to the integrity check, so none of the worker's may reach verify.
      this.git.cleanIgnored(input.worktree);
      const { record, result: made } = await this.verify(input.worktree);
      attempts.push({ ...done, integrity, verify: record });
      if (made.exitCode === 0) {
        return { outcome: 'green', attempts };
      }
      feedback = verifyFeedback(made, this.settings.tailLines);
      lastTail = record.tail;
    }
    return { outcome: 'escalated', attempts, lastTail };
  }

  private async turn(call: () => Promise<WorkerTurn>): Promise<Turn> {
    const start = this.clock.now();
    try {
      const turn = await call();
      return { ok: true, turn, ms: since(this.clock, start) };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      return { ok: false, error, ms: since(this.clock, start) };
    }
  }

  private async verify(worktree: string): Promise<Verified> {
    const start = this.clock.now();
    const result = await this.make.run(worktree, 'verify');
    const ms = since(this.clock, start);
    const record = {
      exitCode: result.exitCode,
      tail: tail(result.output, this.settings.tailLines),
      ms,
    };
    return { record, result };
  }
}
