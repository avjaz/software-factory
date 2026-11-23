import { spawnSync } from 'node:child_process';
import {
  appendFileSync,
  chmodSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import type { Output } from '../../src/cli/output.js';
import { ProcessGit } from '../../src/git/process-git.js';
import { copiedTestsOf } from '../../src/integrity/copied-tests.js';
import { GitDirWatch, type GitDirSnapshot } from '../../src/integrity/git-dir-watch.js';
import { IntegrityCheck } from '../../src/integrity/integrity-check.js';
import type { IntegrityResult } from '../../src/integrity/violation.js';
import { loadPack } from '../../src/packs/pack-loader.js';
import { readFactoryYaml } from '../../src/target/factory-yaml.js';
import type { PendingTicket } from '../../src/tickets/ticket.js';
import { nextTicket } from '../../src/tickets/ticket-queue.js';
import { newWorkRoot, specDefectStep, testCli } from '../support/cli.js';
import {
  commitAll,
  createTinyRepo,
  fixturePacksRoot,
  type TinyRepoOptions,
} from '../support/tiny-repo.js';

function git(dir: string, ...args: readonly string[]): string {
  return spawnSync('git', args, { cwd: dir, encoding: 'utf8' }).stdout.trim();
}

describe('integrity check on a tiny-repo worktree after pre-flight for 01-greet', () => {
  const dirs: string[] = [];
  const realGit = new ProcessGit();
  const watch = new GitDirWatch(realGit);
  const subject = new IntegrityCheck(realGit, watch);
  let repo: string;
  let worktree: string;
  let pending: PendingTicket;
  let base: string;
  let before: GitDirSnapshot;

  async function preflight(
    options?: TinyRepoOptions,
    prepare?: (dir: string) => void,
  ): Promise<void> {
    repo = createTinyRepo(options);
    dirs.push(repo);
    if (prepare !== undefined) {
      prepare(repo);
      commitAll(repo, 'Prepare');
    }
    const workRoot = newWorkRoot();
    dirs.push(workRoot);
    const output = mock<Output>();
    await testCli(workRoot, { steps: [specDefectStep] })(['next', '--repo', repo], output);
    expect(output.out.mock.calls[1]).toEqual(['spec_defect (exit 1) after 1 attempt']);
    worktree = join(workRoot, 'worktrees', `${basename(repo)}-greet`);
    const found = nextTicket(repo);
    if (found === undefined) {
      throw new Error('tiny repo has no pending ticket');
    }
    pending = found;
    base = git(repo, 'rev-parse', 'main');
    before = watch.snapshot(worktree);
  }

  function check(): IntegrityResult {
    const settings = readFactoryYaml(repo);
    if (settings === undefined) {
      throw new Error('tiny repo has no .factory.yaml');
    }
    return subject.check({
      worktree,
      base,
      pack: loadPack(fixturePacksRoot, 'fake'),
      factoryYaml: settings,
      copiedTests: copiedTestsOf(pending),
      gitDir: before,
    });
  }

  function write(path: string, content = 'changed\n'): void {
    mkdirSync(join(worktree, path, '..'), { recursive: true });
    writeFileSync(join(worktree, path), content);
  }

  beforeEach(async () => {
    await preflight();
  });

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  describe('acceptance criteria', () => {
    it('Can_say_ok_when_nothing_else_changed', () => {
      // When
      const actual = check();

      // Then
      expect(actual).toEqual({ ok: true });
    });

    it('Can_say_ok_when_the_worker_adds_an_unsealed_file', () => {
      write('src/greet.txt', 'greetings\n');

      // When
      const actual = check();

      // Then
      expect(actual).toEqual({ ok: true });
    });

    it.each([
      [
        'editing',
        () => {
          write('acceptance/hello.sh', 'exit 0\n');
        },
        'acceptance/hello.sh',
        'modified',
      ],
      [
        'deleting',
        () => {
          unlinkSync(join(worktree, 'acceptance/hello.sh'));
        },
        'acceptance/hello.sh',
        'deleted',
      ],
      [
        'adding',
        () => {
          write('acceptance/extra.sh');
        },
        'acceptance/extra.sh',
        'added',
      ],
      [
        'editing the copied-in test',
        () => {
          write('acceptance/greet.sh', 'exit 0\n');
        },
        'acceptance/greet.sh',
        'test_mismatch',
      ],
      [
        'editing the pending ticket',
        () => {
          appendFileSync(join(worktree, 'docs/tickets/pending/01-greet/ticket.md'), '- more\n');
        },
        'docs/tickets/pending/01-greet/ticket.md',
        'modified',
      ],
    ])('Can_report_one_violation_when_%s', (_, change, path, kind) => {
      change();

      // When
      const actual = check();

      // Then
      expect(actual).toEqual({ ok: false, violations: [{ path, kind }] });
    });

    it('Can_report_modified_and_makefile_mismatch_when_the_makefile_is_edited', () => {
      appendFileSync(join(worktree, 'Makefile'), '\nextra:\n\t@true\n');

      // When
      const actual = check();

      // Then
      expect(actual).toEqual({
        ok: false,
        violations: [
          { path: 'Makefile', kind: 'makefile_mismatch' },
          { path: 'Makefile', kind: 'modified' },
        ],
      });
    });

    describe('with src/hello.txt sealed by the repo', () => {
      beforeEach(async () => {
        await preflight(undefined, (dir) => {
          writeFileSync(join(dir, '.factory.yaml'), 'pack: fake\nsealed:\n  - src/hello.txt\n');
        });
      });

      it('Can_report_modified_when_a_path_sealed_only_by_factory_yaml_is_edited', () => {
        write('src/hello.txt', 'goodbye\n');

        // When
        const actual = check();

        // Then
        expect(actual).toEqual({
          ok: false,
          violations: [{ path: 'src/hello.txt', kind: 'modified' }],
        });
      });

      it('Can_report_both_when_factory_yaml_drops_the_entry_and_the_path_is_edited', () => {
        write('.factory.yaml', 'pack: fake\n');
        write('src/hello.txt', 'goodbye\n');

        // When
        const actual = check();

        // Then
        expect(actual).toEqual({
          ok: false,
          violations: [
            { path: '.factory.yaml', kind: 'modified' },
            { path: 'src/hello.txt', kind: 'modified' },
          ],
        });
      });
    });

    it('Can_report_git_config_when_the_main_repo_config_changes', () => {
      appendFileSync(join(repo, '.git', 'config'), '[core]\n\thooksPath = /tmp/evil\n');

      // When
      const actual = check();

      // Then
      expect(actual).toEqual({
        ok: false,
        violations: [{ path: '.git/config', kind: 'modified' }],
      });
    });

    it('Can_report_git_config_when_the_worktree_git_dir_gains_a_config', () => {
      const gitDir = git(worktree, 'rev-parse', '--path-format=absolute', '--git-dir');
      writeFileSync(join(gitDir, 'config.worktree'), '[core]\n\thooksPath = /tmp/evil\n');

      // When
      const actual = check();

      // Then
      expect(actual).toEqual({
        ok: false,
        violations: [{ path: '.git/config', kind: 'modified' }],
      });
    });

    it('Can_report_every_violation_sorted_by_path_when_there_are_several', () => {
      write('acceptance/greet.sh', 'exit 0\n');
      write('acceptance/extra.sh');
      unlinkSync(join(worktree, 'acceptance/hello.sh'));
      write('src/greet.txt', 'greetings\n');
      appendFileSync(join(worktree, 'Makefile'), '\n');

      // When
      const actual = check();

      // Then
      expect(actual).toEqual({
        ok: false,
        violations: [
          { path: 'Makefile', kind: 'makefile_mismatch' },
          { path: 'Makefile', kind: 'modified' },
          { path: 'acceptance/extra.sh', kind: 'added' },
          { path: 'acceptance/greet.sh', kind: 'test_mismatch' },
          { path: 'acceptance/hello.sh', kind: 'deleted' },
        ],
      });
    });
  });

  describe('edges', () => {
    it('Can_report_a_change_staged_through_git_when_the_index_matches_the_edit', () => {
      write('acceptance/hello.sh', 'exit 0\n');
      spawnSync('git', ['add', '--all'], { cwd: worktree });
      spawnSync('git', ['update-index', '--assume-unchanged', 'acceptance/hello.sh'], {
        cwd: worktree,
      });

      // When
      const actual = check();

      // Then
      expect(actual).toEqual({
        ok: false,
        violations: [{ path: 'acceptance/hello.sh', kind: 'modified' }],
      });
    });

    it('Can_report_modified_when_only_the_executable_bit_changes', () => {
      chmodSync(join(worktree, 'acceptance/hello.sh'), 0o755);

      // When
      const actual = check();

      // Then
      expect(actual).toEqual({
        ok: false,
        violations: [{ path: 'acceptance/hello.sh', kind: 'modified' }],
      });
    });

    it('Can_report_modified_when_a_sealed_file_becomes_a_symlink', () => {
      unlinkSync(join(worktree, 'acceptance/hello.sh'));
      symlinkSync('../src/hello.txt', join(worktree, 'acceptance/hello.sh'));

      // When
      const actual = check();

      // Then
      expect(actual).toEqual({
        ok: false,
        violations: [{ path: 'acceptance/hello.sh', kind: 'modified' }],
      });
    });

    it('Can_report_test_mismatch_when_the_copied_test_is_deleted', () => {
      unlinkSync(join(worktree, 'acceptance/greet.sh'));

      // When
      const actual = check();

      // Then
      expect(actual).toEqual({
        ok: false,
        violations: [{ path: 'acceptance/greet.sh', kind: 'test_mismatch' }],
      });
    });

    it('Can_report_both_when_the_makefile_is_deleted', () => {
      unlinkSync(join(worktree, 'Makefile'));

      // When
      const actual = check();

      // Then
      expect(actual).toEqual({
        ok: false,
        violations: [
          { path: 'Makefile', kind: 'deleted' },
          { path: 'Makefile', kind: 'makefile_mismatch' },
        ],
      });
    });

    it('Can_ignore_build_output_under_a_sealed_path_when_the_base_ignores_it', async () => {
      await preflight(undefined, (dir) => {
        writeFileSync(join(dir, '.gitignore'), 'acceptance/build/\n');
      });
      write('acceptance/build/report.txt');

      // When
      const actual = check();

      // Then
      expect(actual).toEqual({ ok: true });
    });

    it('Can_report_a_new_gitignore_and_the_file_it_hides_when_the_worker_adds_both', () => {
      write('acceptance/.gitignore', 'extra.sh\n.gitignore\n');
      write('acceptance/extra.sh');

      // When
      const actual = check();

      // Then
      expect(actual).toEqual({
        ok: false,
        violations: [
          { path: 'acceptance/.gitignore', kind: 'added' },
          { path: 'acceptance/extra.sh', kind: 'added' },
        ],
      });
    });

    it('Can_stop_honouring_ignore_rules_when_the_worker_edits_a_gitignore', async () => {
      await preflight(undefined, (dir) => {
        writeFileSync(join(dir, '.gitignore'), 'acceptance/build/\n');
      });
      write('.gitignore', 'acceptance/\n');
      write('acceptance/build/report.txt');

      // When
      const actual = check();

      // Then
      expect(actual).toEqual({
        ok: false,
        violations: [
          { path: '.gitignore', kind: 'modified' },
          { path: 'acceptance/build/report.txt', kind: 'added' },
        ],
      });
    });

    it('Can_report_a_new_unsealed_gitignore_when_the_worker_adds_one_anywhere', () => {
      write('src/deep/.gitignore', '*\n');

      // When
      const actual = check();

      // Then
      expect(actual).toEqual({
        ok: false,
        violations: [{ path: 'src/deep/.gitignore', kind: 'added' }],
      });
    });

    it('Can_report_git_head_when_the_worker_commits', () => {
      write('src/greet.txt', 'greetings\n');
      commitAll(worktree, 'worker commit');

      // When
      const actual = check();

      // Then
      expect(actual.ok).toBe(false);
      expect(actual.ok ? [] : actual.violations).toContainEqual({
        path: '.git/HEAD',
        kind: 'modified',
      });
    });

    it('Can_report_the_pointer_when_the_worktree_git_file_is_rewritten', () => {
      appendFileSync(join(worktree, '.git'), '\n');

      // When
      const actual = check();

      // Then
      expect(actual).toEqual({ ok: false, violations: [{ path: '.git', kind: 'modified' }] });
    });

    it('Can_report_a_new_hook_when_one_is_added_to_the_main_repo', () => {
      writeFileSync(join(repo, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\n');

      // When
      const actual = check();

      // Then
      expect(actual).toEqual({
        ok: false,
        violations: [{ path: '.git/hooks/pre-commit', kind: 'modified' }],
      });
    });

    it('Can_report_the_info_files_when_the_worker_deletes_git_info', () => {
      rmSync(join(repo, '.git', 'info'), { recursive: true, force: true });

      // When
      const actual = check();

      // Then
      expect(actual).toEqual({
        ok: false,
        violations: [{ path: '.git/info/exclude', kind: 'modified' }],
      });
    });

    it('Can_say_ok_when_git_rewrites_the_worktree_index', () => {
      spawnSync('git', ['status'], { cwd: worktree });
      spawnSync('git', ['update-index', '--refresh'], { cwd: worktree });

      // When
      const actual = check();

      // Then
      expect(actual).toEqual({ ok: true });
    });
  });
});
