import type { Git } from '../git/git.js';
import { RefusalError } from '../refusal.js';
import type { PreflightSteps } from '../run/preflight.js';
import type { NextResult } from '../run/run-result.js';
import type { TargetCheck } from '../run/target-guard.js';
import type { TicketRunner } from '../run/ticket-run.js';
import { type Clock, since } from '../time/clock.js';
import { nextTicket } from '../tickets/ticket-queue.js';

const base = 'main';
const branchPattern = 'factory/*';

export class FactoryNext {
  constructor(
    private readonly guard: TargetCheck,
    private readonly git: Git,
    private readonly preflight: PreflightSteps,
    private readonly runner: TicketRunner,
    private readonly clock: Clock,
  ) {}

  async run(repo: string): Promise<NextResult> {
    const startedAt = this.clock.now();
    const target = this.guard.check(repo);
    if (!this.git.isClean(repo)) {
      throw new RefusalError('working tree is dirty');
    }
    const pending = nextTicket(repo);
    if (pending === undefined) {
      throw new RefusalError('no pending ticket');
    }
    const unmerged = this.git.unmergedBranches(repo, base, branchPattern);
    if (unmerged.length > 0) {
      throw new RefusalError(`unmerged factory branch: ${unmerged.join(', ')}`);
    }
    const { folder, id: ticketId } = pending.ticket;
    const workspace = this.preflight.open(repo, ticketId);
    const preflight = await this.preflight.check(workspace, pending.testFiles);
    const head = { folder, ticketId, startedAt, preflightMs: since(this.clock, startedAt) };
    if (preflight.outcome !== 'ok') {
      return { ...head, result: preflight };
    }
    return { ...head, result: await this.runner.run(repo, target, pending, workspace) };
  }
}
