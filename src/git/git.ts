import type { Change } from './change.js';
import type { TreeEntry } from './tree.js';

export interface GitIdentity {
  readonly name: string;
  readonly email: string;
}

export interface GitDirs {
  readonly gitDir: string;
  readonly commonDir: string;
}

export interface Git {
  readonly isTopLevel: (dir: string) => boolean;
  readonly isClean: (dir: string) => boolean;
  readonly unmergedBranches: (dir: string, base: string, pattern: string) => readonly string[];
  readonly revParse: (dir: string, ref: string) => string;
  readonly branchExists: (repo: string, branch: string) => boolean;
  readonly addWorktree: (repo: string, path: string, branch: string, startPoint: string) => void;
  readonly removeWorktree: (repo: string, path: string) => void;
  readonly deleteBranch: (repo: string, branch: string) => void;
  readonly changes: (dir: string, base: string) => readonly Change[];
  readonly commitAll: (dir: string, identity: GitIdentity, message: string) => string;
  readonly cleanIgnored: (dir: string) => void;
  readonly listTree: (dir: string, base: string) => ReadonlyMap<string, TreeEntry>;
  readonly hashFiles: (dir: string, paths: readonly string[]) => readonly string[];
  readonly hashText: (dir: string, text: string) => string;
  readonly ignoredPaths: (dir: string, paths: readonly string[]) => ReadonlySet<string>;
  readonly gitDirs: (dir: string) => GitDirs;
}
