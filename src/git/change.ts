import { GitError } from './git-error.js';

export type ChangeKind = 'added' | 'modified' | 'deleted';

export interface Change {
  readonly kind: ChangeKind;
  readonly path: string;
}

const kinds: ReadonlyMap<string, ChangeKind> = new Map([
  ['A', 'added'],
  ['M', 'modified'],
  ['T', 'modified'],
  ['D', 'deleted'],
]);

export function parseChanges(nameStatus: string, untracked: string): readonly Change[] {
  const fields = nameStatus.split('\0').filter((field) => field !== '');
  const tracked: Change[] = [];
  for (let i = 0; i < fields.length; i += 2) {
    const [status = '', path = ''] = fields.slice(i, i + 2);
    const kind = kinds.get(status);
    if (kind === undefined || path === '') {
      throw new GitError(`unexpected git status ${status} for ${path}`);
    }
    tracked.push({ kind, path });
  }
  const added = untracked
    .split('\0')
    .filter((path) => path !== '')
    .map((path): Change => ({ kind: 'added', path }));
  return [...tracked, ...added].sort((a, b) => a.path.localeCompare(b.path));
}
