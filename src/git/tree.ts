import { GitError } from './git-error.js';

export type FileType = 'file' | 'executable' | 'symlink';

export interface TreeEntry {
  readonly type: FileType;
  readonly oid: string;
}

const submoduleMode = '160000';
const types: ReadonlyMap<string, FileType> = new Map([
  ['100644', 'file'],
  ['100755', 'executable'],
  ['120000', 'symlink'],
]);
const entryPattern = /^(\d{6}) \w+ ([0-9a-f]+)\t(.+)$/s;

export function parseTree(text: string): ReadonlyMap<string, TreeEntry> {
  const entries = new Map<string, TreeEntry>();
  for (const record of text.split('\0').filter((r) => r !== '')) {
    const match = entryPattern.exec(record);
    const [, mode = '', oid = '', path = ''] = match ?? [];
    if (mode === submoduleMode) {
      continue;
    }
    const type = types.get(mode);
    if (type === undefined) {
      throw new GitError(`unexpected git ls-tree entry: ${record}`);
    }
    entries.set(path, { type, oid });
  }
  return entries;
}
