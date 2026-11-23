import { mkdirSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import type { Git, GitIdentity } from '../git/git.js';
import type { Ticket } from '../tickets/ticket.js';
import type { Workspace } from './outcome.js';

export const factoryIdentity: GitIdentity = {
  name: 'software-factory',
  email: 'factory@localhost',
};

const pendingDir = join('docs', 'tickets', 'pending');
const doneDir = join('docs', 'tickets', 'done');

export class GreenCommit {
  constructor(private readonly git: Git) {}

  commit(repo: string, workspace: Workspace, ticket: Ticket): string {
    const { worktree } = workspace;
    const pending = join(worktree, pendingDir, ticket.folder);
    mkdirSync(join(worktree, doneDir), { recursive: true });
    renameSync(join(pending, 'ticket.md'), join(worktree, doneDir, `${ticket.folder}.md`));
    rmSync(pending, { recursive: true, force: true });
    const sha = this.git.commitAll(
      worktree,
      factoryIdentity,
      `Ticket ${ticket.id}: ${ticket.title}`,
    );
    this.git.removeWorktree(repo, worktree);
    return sha;
  }
}
