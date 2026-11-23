import { copiedTestsOf } from '../integrity/copied-tests.js';
import type { GitDirSnapshot } from '../integrity/git-dir-watch.js';
import type { IntegrityInput } from '../integrity/integrity-check.js';
import type { PendingTicket, Ticket } from '../tickets/ticket.js';
import type { Worker } from '../worker/worker.js';
import type { WorkerFactory } from '../worker/worker-factory.js';
import type { Workspace } from './outcome.js';
import { buildFirstPrompt } from './prompt.js';
import type { LoopResult, RunResult } from './run-result.js';
import type { Target } from './target-guard.js';

export interface Snapshotter {
  readonly snapshot: (worktree: string) => GitDirSnapshot;
}

export interface Loop {
  readonly run: (worker: Worker, prompt: string, input: IntegrityInput) => Promise<LoopResult>;
}

export interface Committer {
  readonly commit: (repo: string, workspace: Workspace, ticket: Ticket) => string;
}

export interface TicketRunner {
  readonly run: (
    repo: string,
    target: Target,
    pending: PendingTicket,
    workspace: Workspace,
  ) => Promise<RunResult>;
}

export class TicketRun implements TicketRunner {
  constructor(
    private readonly watch: Snapshotter,
    private readonly loop: Loop,
    private readonly green: Committer,
    private readonly newWorker: WorkerFactory,
  ) {}

  async run(
    repo: string,
    target: Target,
    pending: PendingTicket,
    workspace: Workspace,
  ): Promise<RunResult> {
    const gitDir = this.watch.snapshot(workspace.worktree);
    const prompt = buildFirstPrompt(
      pending.ticket,
      pending.testFiles.map((file) => file.target),
    );
    const worker = this.newWorker({ pack: target.pack, factoryYaml: target.settings });
    const result = await this.loop.run(worker, prompt, {
      worktree: workspace.worktree,
      base: workspace.base,
      pack: target.pack,
      factoryYaml: target.settings,
      copiedTests: copiedTestsOf(pending),
      gitDir,
    });
    if (result.outcome !== 'green') {
      return { ...result, workspace };
    }
    return { ...result, workspace, commit: this.green.commit(repo, workspace, pending.ticket) };
  }
}
