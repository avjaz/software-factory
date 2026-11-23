import { spawnSync, type SpawnSyncReturns } from 'node:child_process';

import { GitError } from './git-error.js';

export interface GitCall {
  readonly label: string;
  readonly args: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
  readonly input?: string;
}

export function git(cwd: string, call: GitCall): SpawnSyncReturns<string> {
  return spawnSync('git', call.args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...call.env },
    input: call.input,
  });
}

export function gitOk(cwd: string, call: GitCall): string {
  const result = git(cwd, call);
  if (result.status !== 0) {
    throw gitFailure(cwd, call, result);
  }
  return result.stdout;
}

export function gitFailure(cwd: string, call: GitCall, result: SpawnSyncReturns<string>): GitError {
  const detail = (result.stderr || result.stdout).trim();
  return new GitError(`git ${call.label} failed in ${cwd}: ${detail}`);
}
