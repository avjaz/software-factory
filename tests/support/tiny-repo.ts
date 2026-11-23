import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

const fixturesDir = join(import.meta.dirname, '..', 'fixtures');
const templateDir = join(fixturesDir, 'tiny-repo');

export const fixturePacksRoot = join(fixturesDir, 'packs');
export const fakePackDir = join(fixturePacksRoot, 'fake');

export interface TinyRepoOptions {
  readonly broken?: boolean;
  readonly alreadyGreen?: boolean;
  readonly uninitialised?: boolean;
}

const initFiles: ReadonlySet<string> = new Set(['CLAUDE.md', '.factory.yaml']);

export function createTinyRepo(options: TinyRepoOptions = {}): string {
  const repo = mkdtempSync(join(tmpdir(), 'tiny-repo-'));
  const uninitialised = options.uninitialised === true;
  cpSync(templateDir, repo, {
    recursive: true,
    filter: (source) => !(uninitialised && initFiles.has(relative(templateDir, source))),
  });
  if (!uninitialised) {
    cpSync(join(fakePackDir, 'Makefile'), join(repo, 'Makefile'));
    cpSync(join(fakePackDir, 'CLAUDE.factory.md'), join(repo, 'CLAUDE.factory.md'));
    cpSync(join(fakePackDir, 'skills'), join(repo, '.claude', 'skills'), { recursive: true });
  }
  if (options.broken === true) {
    writeFileSync(join(repo, 'BROKEN'), '');
  }
  if (options.alreadyGreen === true) {
    writeFileSync(join(repo, 'src', 'greet.txt'), 'greetings\n');
  }
  git(repo, 'init', '--quiet', '--initial-branch=main');
  commitAll(repo, 'Tiny repo');
  return repo;
}

const identity = ['-c', 'user.name=fixture', '-c', 'user.email=fixture@localhost'] as const;

export function commitAll(repo: string, message: string): void {
  git(repo, 'add', '--all');
  git(repo, ...identity, 'commit', '--quiet', '-m', message);
}

export function commitOnBranch(repo: string, branch: string): void {
  git(repo, 'checkout', '--quiet', '-b', branch);
  writeFileSync(join(repo, `${branch.replaceAll('/', '-')}.txt`), `${branch}\n`);
  commitAll(repo, `Work on ${branch}`);
  git(repo, 'checkout', '--quiet', 'main');
}

export function mergeIntoMain(repo: string, branch: string): void {
  git(repo, ...identity, 'merge', '--quiet', '--no-edit', branch);
}

function git(cwd: string, ...args: readonly string[]): void {
  execFileSync('git', args, { cwd, stdio: 'ignore' });
}
