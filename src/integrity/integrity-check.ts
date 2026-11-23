import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Git } from '../git/git.js';
import type { Pack } from '../packs/pack-loader.js';
import type { FactoryYaml } from '../target/factory-yaml.js';
import type { CopiedTest } from './copied-tests.js';
import { hashDiskEntries } from './disk-entries.js';
import type { GitDirSnapshot, GitDirWatch } from './git-dir-watch.js';
import { sealedChanges, testMismatches } from './sealed-changes.js';
import { sealedGlobs, sealedMatcher } from './sealed-globs.js';
import type { IntegrityResult, Violation } from './violation.js';
import { listWorktreeFiles } from './worktree-files.js';

export interface IntegrityInput {
  readonly worktree: string;
  readonly base: string;
  readonly pack: Pack;
  readonly factoryYaml: FactoryYaml;
  readonly copiedTests: readonly CopiedTest[];
  readonly gitDir: GitDirSnapshot;
}

const makefile = 'Makefile';

export interface Integrity {
  readonly check: (input: IntegrityInput) => IntegrityResult;
}

export class IntegrityCheck implements Integrity {
  constructor(
    private readonly git: Git,
    private readonly watch: Pick<GitDirWatch, 'compare'>,
  ) {}

  check(input: IntegrityInput): IntegrityResult {
    const { worktree, base } = input;
    const isSealed = sealedMatcher(sealedGlobs(input.pack, input.factoryYaml));
    const copied = new Set(input.copiedTests.map((test) => test.target));
    const watched = (path: string): boolean => isSealed(path) && !copied.has(path);
    const baseTree = this.git.listTree(worktree, base);
    const disk = listWorktreeFiles(worktree);
    const baseSealed = new Map([...baseTree].filter(([path]) => watched(path)));
    const diskSealed = [...disk.keys()].filter(watched);
    const hashed = hashDiskEntries(this.git, worktree, disk, [...baseSealed.keys(), ...copied]);
    const violations = [
      ...sealedChanges({
        baseSealed,
        diskSealed,
        hashed,
        ignored: (paths) => this.git.ignoredPaths(worktree, paths),
      }),
      ...testMismatches(input.copiedTests, baseTree, hashed),
      ...makefileMismatch(worktree, input.pack),
      ...this.watch.compare(worktree, input.gitDir, base),
    ];
    return violations.length === 0 ? { ok: true } : { ok: false, violations: sorted(violations) };
  }
}

function makefileMismatch(worktree: string, pack: Pack): readonly Violation[] {
  const path = join(worktree, makefile);
  const expected = readFileSync(join(pack.dir, makefile));
  const matches = existsSync(path) && readFileSync(path).equals(expected);
  return matches ? [] : [{ path: makefile, kind: 'makefile_mismatch' }];
}

function sorted(violations: readonly Violation[]): readonly Violation[] {
  const key = (v: Violation): string => `${v.path}\0${v.kind}`;
  return [...violations].sort((a, b) => Number(key(a) > key(b)) - Number(key(a) < key(b)));
}
