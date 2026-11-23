import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

import type { Git } from '../git/git.js';
import type { Make } from '../make/make.js';
import { RefusalError } from '../refusal.js';
import type { TestFile } from '../tickets/ticket.js';
import type { PreflightResult, Workspace } from './outcome.js';

const base = 'main';

export interface PreflightSteps {
  readonly open: (repo: string, id: string) => Workspace;
  readonly check: (
    workspace: Workspace,
    testFiles: readonly TestFile[],
  ) => Promise<PreflightResult>;
}

export class Preflight implements PreflightSteps {
  constructor(
    private readonly git: Git,
    private readonly make: Make,
    private readonly workRoot: string,
  ) {}

  open(repo: string, id: string): Workspace {
    const branch = `factory/${id}`;
    const worktree = join(this.workRoot, 'worktrees', `${basename(resolve(repo))}-${id}`);
    if (existsSync(worktree)) {
      throw new RefusalError(`worktree already exists: ${worktree}`);
    }
    if (this.git.branchExists(repo, branch) && this.isUnmerged(repo, branch)) {
      throw new RefusalError(`branch already exists: ${branch}`);
    }
    const sha = this.git.revParse(repo, base);
    this.git.addWorktree(repo, worktree, branch, sha);
    return { base: sha, branch, worktree };
  }

  async check(workspace: Workspace, testFiles: readonly TestFile[]): Promise<PreflightResult> {
    const verify = await this.make.run(workspace.worktree, 'verify');
    if (verify.exitCode !== 0) {
      return { outcome: 'baseline_red', workspace, target: 'verify', result: verify };
    }
    copyTestFiles(testFiles, workspace.worktree);
    const acceptance = await this.make.run(workspace.worktree, 'acceptance');
    if (acceptance.exitCode === 0) {
      return {
        outcome: 'ticket_already_green',
        workspace,
        target: 'acceptance',
        result: acceptance,
      };
    }
    return { outcome: 'ok', workspace, acceptance };
  }

  private isUnmerged(repo: string, branch: string): boolean {
    return this.git.unmergedBranches(repo, base, branch).length > 0;
  }
}

function copyTestFiles(files: readonly TestFile[], worktree: string): void {
  for (const file of files) {
    const target = join(worktree, file.target);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(file.source, target);
  }
}
