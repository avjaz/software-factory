import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import type { FileType } from '../git/tree.js';

const ownerExecute = 0o100;

export function listWorktreeFiles(root: string): ReadonlyMap<string, FileType> {
  const files: [string, FileType][] = [];
  walk(root, '', files);
  return new Map(files.sort(([a], [b]) => Number(a > b) - Number(a < b)));
}

function walk(root: string, dir: string, files: [string, FileType][]): void {
  for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
    const path = dir === '' ? entry.name : `${dir}/${entry.name}`;
    if (path === '.git') {
      continue;
    }
    if (entry.isSymbolicLink()) {
      files.push([path, 'symlink']);
    } else if (entry.isDirectory()) {
      walk(root, path, files);
    } else if (entry.isFile()) {
      const executable = (statSync(join(root, path)).mode & ownerExecute) !== 0;
      files.push([path, executable ? 'executable' : 'file']);
    }
  }
}
