import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, relative, sep } from 'node:path';

import type { Git } from '../git/git.js';
import type { Violation } from './violation.js';

export interface GitDirSnapshot {
  readonly files: ReadonlyMap<string, string>;
}

const commonEntries = ['config', 'hooks', 'info'] as const;
const unwatchedWorktreeEntries: ReadonlySet<string> = new Set(['index', 'index.lock', 'logs']);
const configNames: ReadonlySet<string> = new Set(['config', 'config.worktree']);

export class GitDirWatch {
  constructor(private readonly git: Git) {}

  snapshot(worktree: string): GitDirSnapshot {
    const { gitDir, commonDir } = this.git.gitDirs(worktree);
    const files = new Map<string, string>([['.git', digest(join(worktree, '.git'))]]);
    const watched = [
      ...commonEntries.map((entry) => join(commonDir, entry)),
      ...readdirSync(gitDir)
        .filter((entry) => !unwatchedWorktreeEntries.has(entry))
        .map((entry) => join(gitDir, entry)),
    ];
    for (const path of watched.flatMap(filesUnder)) {
      files.set(`.git/${relative(commonDir, path).split(sep).join('/')}`, digest(path));
    }
    return { files };
  }

  compare(worktree: string, before: GitDirSnapshot, base: string): readonly Violation[] {
    const after = this.snapshot(worktree).files;
    const keys = new Set([...before.files.keys(), ...after.keys()]);
    const changed = [...keys].filter((key) => before.files.get(key) !== after.get(key));
    const labels = new Set(changed.map(label));
    if (this.git.revParse(worktree, 'HEAD') !== base) {
      labels.add('.git/HEAD');
    }
    return [...labels].map((path) => ({ path, kind: 'modified' }));
  }
}

function filesUnder(path: string): readonly string[] {
  const stat = statSync(path, { throwIfNoEntry: false });
  if (stat === undefined) {
    return [];
  }
  if (stat.isFile()) {
    return [path];
  }
  return readdirSync(path, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
}

function digest(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function label(key: string): string {
  return configNames.has(basename(key)) ? '.git/config' : key;
}
