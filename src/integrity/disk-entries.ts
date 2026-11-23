import { readlinkSync } from 'node:fs';
import { join } from 'node:path';

import type { Git } from '../git/git.js';
import type { FileType, TreeEntry } from '../git/tree.js';
import { zip } from '../util/zip.js';

interface DiskFile {
  readonly path: string;
  readonly type: FileType;
}

export function hashDiskEntries(
  git: Git,
  worktree: string,
  disk: ReadonlyMap<string, FileType>,
  paths: readonly string[],
): ReadonlyMap<string, TreeEntry> {
  const present = paths.flatMap((path): DiskFile[] => {
    const type = disk.get(path);
    return type === undefined ? [] : [{ path, type }];
  });
  const files = present.filter((file) => file.type !== 'symlink');
  const links = present.filter((file) => file.type === 'symlink');
  const oids = git.hashFiles(
    worktree,
    files.map((file) => file.path),
  );
  const entries = new Map<string, TreeEntry>();
  for (const [file, oid] of zip(files, oids)) {
    entries.set(file.path, { type: file.type, oid });
  }
  for (const link of links) {
    const target = readlinkSync(join(worktree, link.path));
    entries.set(link.path, { type: 'symlink', oid: git.hashText(worktree, target) });
  }
  return entries;
}
