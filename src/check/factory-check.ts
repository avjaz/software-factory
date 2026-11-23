import type { Git } from '../git/git.js';
import type { PreflightResult } from '../run/outcome.js';
import type { PreflightSteps } from '../run/preflight.js';
import type { TargetCheck } from '../run/target-guard.js';
import { pendingTicket } from '../tickets/ticket-queue.js';

export class FactoryCheck {
  constructor(
    private readonly guard: TargetCheck,
    private readonly git: Git,
    private readonly preflight: PreflightSteps,
  ) {}

  async run(repo: string, folder: string): Promise<PreflightResult> {
    this.guard.check(repo);
    const pending = pendingTicket(repo, folder);
    const workspace = this.preflight.open(repo, pending.ticket.id);
    try {
      return await this.preflight.check(workspace, pending.testFiles);
    } finally {
      this.git.removeWorktree(repo, workspace.worktree);
      this.git.deleteBranch(repo, workspace.branch);
    }
  }
}
