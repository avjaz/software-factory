import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import type { Output } from '../../src/cli/output.js';
import { newWorkRoot, testCli } from '../support/cli.js';
import { nextTicket } from '../../src/tickets/ticket-queue.js';
import {
  commitAll,
  commitOnBranch,
  createTinyRepo,
  mergeIntoMain,
  type TinyRepoOptions,
} from '../support/tiny-repo.js';

const greetDir = 'docs/tickets/pending/01-greet';
const greetTicket = `${greetDir}/ticket.md`;

describe('factory next', () => {
  const dirs: string[] = [];
  let output: MockProxy<Output>;
  let workRoot: string;

  function tinyRepo(options?: TinyRepoOptions): string {
    const repo = createTinyRepo(options);
    dirs.push(repo);
    return repo;
  }

  function next(repo: string): Promise<number> {
    return testCli(workRoot)(['next', '--repo', repo], output);
  }

  function worktreeOf(repo: string, id: string): string {
    return join(workRoot, 'worktrees', `${basename(repo)}-${id}`);
  }

  function git(dir: string, ...args: readonly string[]): string {
    return spawnSync('git', args, { cwd: dir, encoding: 'utf8' }).stdout;
  }

  function editGreet(repo: string, edit: (text: string) => string): void {
    const path = join(repo, greetTicket);
    writeFileSync(path, edit(readFileSync(path, 'utf8')));
    commitAll(repo, 'Edit greet');
  }

  function expectPicked(actual: number, folder: string): void {
    expect(actual).toBe(1);
    expect(output.out.mock.calls.slice(0, 2).map(([text]) => text)).toEqual([
      `ticket: ${folder}`,
      'spec_defect (exit 1) after 1 attempt',
    ]);
  }

  function expectRefusal(actual: number, message: string): void {
    expect(actual).toBe(2);
    expect(output.err).toHaveBeenCalledExactlyOnceWith(message);
    expect(output.out).not.toHaveBeenCalled();
  }

  beforeEach(() => {
    output = mock<Output>();
    workRoot = newWorkRoot();
    dirs.push(workRoot);
  });

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('Can_pick_01_greet_when_the_tiny_repo_is_fresh', async () => {
    const repo = tinyRepo();

    // When
    const actual = await next(repo);

    // Then
    expectPicked(actual, '01-greet');
    expect(output.err).not.toHaveBeenCalled();
  });

  it('Can_leave_a_worktree_on_factory_greet_with_the_test_and_the_repo_unchanged', async () => {
    const repo = tinyRepo();
    const head = git(repo, 'rev-parse', 'HEAD');

    // When
    await next(repo);

    // Then
    const worktree = worktreeOf(repo, 'greet');
    expect(git(worktree, 'branch', '--show-current')).toBe('factory/greet\n');
    expect(git(worktree, 'rev-parse', 'HEAD')).toBe(head);
    expect(readFileSync(join(worktree, 'acceptance/greet.sh'), 'utf8')).toBe(
      readFileSync(join(repo, greetDir, 'acceptance/greet.sh'), 'utf8'),
    );
    expect(git(repo, 'status', '--porcelain', '--untracked-files=all')).toBe('');
    expect(git(repo, 'branch', '--show-current')).toBe('main\n');
    expect(git(repo, 'rev-parse', 'HEAD')).toBe(head);
    expect(existsSync(join(repo, 'acceptance/greet.sh'))).toBe(false);
  });

  it('Can_refuse_with_exit_2_when_the_worktree_already_exists', async () => {
    const repo = tinyRepo();
    const worktree = worktreeOf(repo, 'greet');
    mkdirSync(worktree, { recursive: true });

    // When
    const actual = await next(repo);

    // Then
    expectRefusal(actual, `worktree already exists: ${worktree}`);
  });

  it('Can_refuse_a_second_run_with_exit_2_when_the_first_kept_its_worktree', async () => {
    const repo = tinyRepo();
    await next(repo);
    output = mock<Output>();

    // When
    const actual = await next(repo);

    // Then
    expectRefusal(actual, `worktree already exists: ${worktreeOf(repo, 'greet')}`);
  });

  it('Can_reuse_the_merged_branch_when_a_kept_worktree_was_deleted_by_hand', async () => {
    const repo = tinyRepo();
    await next(repo);
    rmSync(worktreeOf(repo, 'greet'), { recursive: true, force: true });
    output = mock<Output>();

    // When
    const actual = await next(repo);

    // Then
    expectPicked(actual, '01-greet');
  });

  it.each([
    [
      'baseline_red',
      { broken: true },
      ['baseline_red: make verify exited 2', expect.stringContaining('BROKEN is present')],
    ],
    [
      'ticket_already_green',
      { alreadyGreen: true },
      ['ticket_already_green: make acceptance exited 0'],
    ],
  ])('Can_report_%s_and_keep_the_worktree_with_exit_1', async (_, options, lines) => {
    const repo = tinyRepo(options);

    // When
    const actual = await next(repo);

    // Then
    const worktree = worktreeOf(repo, 'greet');
    expect(actual).toBe(1);
    expect(output.out.mock.calls.map(([text]) => text)).toEqual([
      'ticket: 01-greet',
      ...lines,
      `worktree kept: ${worktree}`,
      expect.stringMatching(/\/runs\/greet-\d{8}T\d{6}Z$/),
    ]);
    expect(existsSync(worktree)).toBe(true);
  });

  it('Can_pick_02_farewell_when_01_greet_is_done', async () => {
    const repo = tinyRepo();
    mkdirSync(join(repo, 'docs/tickets/done'));
    renameSync(join(repo, greetTicket), join(repo, 'docs/tickets/done/01-greet.md'));
    rmSync(join(repo, greetDir), { recursive: true });
    commitAll(repo, 'Greet done');

    // When
    const actual = await next(repo);

    // Then
    expectPicked(actual, '02-farewell');
    expect(existsSync(join(worktreeOf(repo, 'farewell'), 'acceptance/farewell.sh'))).toBe(true);
  });

  it('Can_refuse_with_exit_2_when_no_ticket_is_pending', async () => {
    const repo = tinyRepo();
    rmSync(join(repo, 'docs/tickets/pending'), { recursive: true });
    commitAll(repo, 'Empty queue');

    // When
    const actual = await next(repo);

    // Then
    expectRefusal(actual, 'no pending ticket');
  });

  it('Can_refuse_an_unmerged_factory_branch_until_it_is_merged', async () => {
    const repo = tinyRepo();
    commitOnBranch(repo, 'factory/greet');

    // When
    const refused = await next(repo);

    // Then
    expectRefusal(refused, 'unmerged factory branch: factory/greet');

    // When
    mergeIntoMain(repo, 'factory/greet');
    output = mock<Output>();
    const actual = await next(repo);

    // Then
    expectPicked(actual, '01-greet');
  });

  it.each([
    ['id is missing', (t: string) => t.replace('id: greet\n', ''), 'id: required'],
    [
      'id does not match the folder',
      (t: string) => t.replace('id: greet', 'id: hello'),
      'id: "hello" does not match folder 01-greet',
    ],
    [
      'a header key is unknown',
      (t: string) => t.replace('id: greet\n', 'id: greet\nowner: me\n'),
      'unknown key: owner',
    ],
    [
      'the body is empty',
      (t: string) => t.slice(0, t.indexOf('---', 3) + 4),
      'body: must not be empty',
    ],
    [
      'there is no acceptance criteria section',
      (t: string) => t.slice(0, t.indexOf('## Acceptance criteria')),
      'acceptance criteria: missing ## Acceptance criteria',
    ],
    [
      'the acceptance criteria section is empty',
      (t: string) => t.replace('- `src/greet.txt` contains `greetings`\n', ''),
      'acceptance criteria: must list at least one item',
    ],
    [
      'design names a section the doc lacks',
      (t: string) => t.replace("design: ['1']", "design: ['9']"),
      'design: section 9 not found in docs/design.md',
    ],
  ])('Can_refuse_with_exit_2_naming_the_field_when_%s', async (_, edit, problem) => {
    const repo = tinyRepo();
    editGreet(repo, edit);

    // When
    const actual = await next(repo);

    // Then
    expectRefusal(actual, `invalid ticket 01-greet: ${problem}`);
  });

  it('Can_refuse_with_exit_2_when_the_header_is_not_valid_yaml', async () => {
    const repo = tinyRepo();
    editGreet(repo, (t) => t.replace("design: ['1']", "design: ['1'"));

    // When
    const actual = await next(repo);

    // Then
    expect(actual).toBe(2);
    expect(output.err).toHaveBeenCalledExactlyOnceWith(
      expect.stringMatching(/^invalid ticket 01-greet: not valid YAML: /),
    );
  });

  it('Can_refuse_with_exit_2_when_a_design_section_has_a_heading_but_no_text', async () => {
    const repo = tinyRepo();
    writeFileSync(
      join(repo, 'docs/design.md'),
      '# Tiny repo\n\n## 1. Greetings\n\n## 2. Farewells\n\nBye.\n',
    );
    commitAll(repo, 'Empty section 1');

    // When
    const actual = await next(repo);

    // Then
    expectRefusal(actual, 'invalid ticket 01-greet: design: section 1 has no text');
  });

  it('Can_refuse_with_exit_2_when_a_pending_folder_has_no_prefix', async () => {
    const repo = tinyRepo();
    renameSync(join(repo, greetDir), join(repo, 'docs/tickets/pending/greet'));
    commitAll(repo, 'Unnumbered folder');

    // When
    const actual = await next(repo);

    // Then
    expectRefusal(actual, 'ticket folder must be NN-<id>: greet');
  });

  it('Can_return_exactly_the_greet_test_when_reading_01_greet', () => {
    const repo = tinyRepo();

    // When
    const actual = nextTicket(repo);

    // Then
    expect(actual?.testFiles.map((file) => file.target)).toEqual(['acceptance/greet.sh']);
  });

  describe('refusals before the queue', () => {
    it('Can_refuse_with_exit_2_when_the_dir_is_not_a_git_repo', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'plain-'));
      dirs.push(dir);

      // When
      const actual = await next(dir);

      // Then
      expectRefusal(actual, 'not a git repo');
    });

    it('Can_refuse_with_exit_2_when_the_repo_has_no_factory_yaml', async () => {
      const repo = tinyRepo();
      rmSync(join(repo, '.factory.yaml'));
      commitAll(repo, 'No factory yaml');

      // When
      const actual = await next(repo);

      // Then
      expectRefusal(actual, 'no .factory.yaml');
    });

    it('Can_refuse_with_exit_2_when_factory_yaml_names_an_unknown_pack', async () => {
      const repo = tinyRepo();
      writeFileSync(join(repo, '.factory.yaml'), 'pack: nope\n');
      commitAll(repo, 'Unknown pack');

      // When
      const actual = await next(repo);

      // Then
      expectRefusal(actual, 'unknown pack: nope');
    });

    it('Can_refuse_with_exit_2_when_the_working_tree_is_dirty', async () => {
      const repo = tinyRepo();
      writeFileSync(join(repo, 'src/hello.txt'), 'changed\n');

      // When
      const actual = await next(repo);

      // Then
      expectRefusal(actual, 'working tree is dirty');
      expect(
        spawnSync('git', ['status', '--porcelain'], { cwd: repo, encoding: 'utf8' }).stdout,
      ).toBe(' M src/hello.txt\n');
    });
  });
});
