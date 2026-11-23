import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import type { Output } from '../../src/cli/output.js';
import { isPreflightFailure } from '../../src/run/outcome.js';
import type { NextResult, RunResult } from '../../src/run/run-result.js';
import {
  newWorkRoot,
  specDefectStep,
  testCli,
  testCommands,
  type TestCliOptions,
} from '../support/cli.js';
import type { ScriptedStep, ScriptedWorker } from '../support/scripted-worker.js';
import { commitAll, createTinyRepo, mergeIntoMain } from '../support/tiny-repo.js';

const greetTicket = 'docs/tickets/pending/01-greet/ticket.md';

const fixGreet: ScriptedStep = {
  write: { 'src/greet.txt': 'greetings\n' },
  result: { status: 'done', summary: 'added src/greet.txt', evidence: '' },
};

const doNothing: ScriptedStep = {
  result: { status: 'done', summary: 'did nothing', evidence: '' },
};

function runOf(next: NextResult): RunResult {
  if (isPreflightFailure(next.result)) {
    throw new Error(`pre-flight failed: ${next.result.outcome}`);
  }
  return next.result;
}

function git(dir: string, ...args: readonly string[]): string {
  return spawnSync('git', args, { cwd: dir, encoding: 'utf8' }).stdout.trim();
}

describe('factory next run loop on tiny repo 01-greet', () => {
  const dirs: string[] = [];
  let output: MockProxy<Output>;
  let workRoot: string;
  let repo: string;
  let base: string;
  let worker: ScriptedWorker | undefined;

  function options(steps: readonly ScriptedStep[], extra: TestCliOptions = {}): TestCliOptions {
    return {
      steps,
      onWorker: (made) => {
        worker = made;
      },
      ...extra,
    };
  }

  function next(steps: readonly ScriptedStep[], extra?: TestCliOptions): Promise<number> {
    return testCli(workRoot, options(steps, extra))(['next', '--repo', repo], output);
  }

  function nextResult(steps: readonly ScriptedStep[]): Promise<NextResult> {
    return testCommands(workRoot, options(steps)).next(repo);
  }

  function inputs(): readonly string[] {
    return worker?.inputs ?? [];
  }

  function printed(): readonly unknown[] {
    return output.out.mock.calls.map(([line]) => line);
  }

  function worktree(id = 'greet'): string {
    return join(workRoot, 'worktrees', `${basename(repo)}-${id}`);
  }

  function commitsOnBranch(): string {
    return git(repo, 'rev-list', '--count', `${base}..factory/greet`);
  }

  beforeEach(() => {
    output = mock<Output>();
    workRoot = newWorkRoot();
    repo = createTinyRepo();
    dirs.push(workRoot, repo);
    base = git(repo, 'rev-parse', 'main');
    worker = undefined;
  });

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('Can_end_green_with_one_factory_commit_and_no_worktree_when_step_1_fixes_it', async () => {
    // When
    const actual = await next([fixGreet]);

    // Then
    expect(actual).toBe(0);
    const commit = git(repo, 'rev-parse', 'factory/greet');
    expect(printed()).toEqual([
      'ticket: 01-greet',
      'green (exit 0) after 1 attempt',
      `committed ${commit} on factory/greet`,
      expect.stringMatching(/\/runs\/greet-\d{8}T\d{6}Z$/),
    ]);
    expect(commitsOnBranch()).toBe('1');
    expect(git(repo, 'log', '-1', '--format=%an|%s', 'factory/greet')).toBe(
      'software-factory|Ticket greet: Add the greeting file',
    );
    const changed = git(
      repo,
      'show',
      '--name-status',
      '--no-renames',
      '--format=',
      'factory/greet',
    );
    expect(changed.split('\n')).toEqual(
      expect.arrayContaining([
        'A\tsrc/greet.txt',
        'A\tacceptance/greet.sh',
        'A\tdocs/tickets/done/01-greet.md',
      ]),
    );
    expect(
      git(repo, 'ls-tree', '-r', '--name-only', 'factory/greet', 'docs/tickets/pending/01-greet'),
    ).toBe('');
    expect(existsSync(worktree())).toBe(false);
    expect(git(repo, 'rev-parse', 'main')).toBe(base);
    expect(git(repo, 'status', '--porcelain')).toBe('');
  });

  it('Can_remove_an_ignored_file_the_worker_left_before_verify_sees_it', async () => {
    // Given
    writeFileSync(join(repo, '.gitignore'), 'BROKEN\n');
    commitAll(repo, 'Ignore BROKEN');
    const fixAndLeaveIgnoredFile: ScriptedStep = {
      write: { 'src/greet.txt': 'greetings\n', BROKEN: '' },
      result: { status: 'done', summary: 'added src/greet.txt', evidence: '' },
    };

    // When
    const actual = await next([fixAndLeaveIgnoredFile]);

    // Then
    expect(actual).toBe(0);
    expect(printed()[1]).toBe('green (exit 0) after 1 attempt');
  });

  it('Can_end_green_after_2_attempts_with_the_verify_failure_in_the_resume_message', async () => {
    // When
    const actual = await next([doNothing, fixGreet]);

    // Then
    expect(actual).toBe(0);
    expect(printed()[1]).toBe('green (exit 0) after 2 attempts');
    const [, resume] = inputs();
    expect(resume).toContain('make verify failed with exit');
    expect(resume).toContain('src/greet.txt does not contain greetings');
  });

  it('Can_escalate_without_committing_and_never_ask_a_4th_time_when_nothing_fixes_it', async () => {
    // When
    const actual = await next([doNothing, doNothing, doNothing, fixGreet]);

    // Then
    expect(actual).toBe(1);
    expect(printed()[1]).toBe('escalated (exit 1) after 3 attempts');
    expect(printed().at(-2)).toBe(`worktree kept: ${worktree()}`);
    expect(inputs()).toHaveLength(3);
    expect(commitsOnBranch()).toBe('0');
    expect(existsSync(worktree())).toBe(true);
  });

  it('Can_stop_with_spec_defect_after_1_attempt_without_running_verify', async () => {
    // When
    const result = runOf(
      await nextResult([
        { write: { 'src/greet.txt': 'greetings\n' }, result: specDefectStep.result },
      ]),
    );

    // Then
    expect(result).toMatchObject({
      outcome: 'spec_defect',
      evidence: 'test harness stop',
      attempts: [{ number: 1 }],
    });
    expect(result.attempts.map((a) => a.verify)).toEqual([undefined]);
  });

  it('Can_stop_with_integrity_violation_after_1_attempt_without_verify_or_commit', async () => {
    // When
    const result = runOf(
      await nextResult([
        {
          write: { 'acceptance/hello.sh': 'exit 0\n', 'src/greet.txt': 'greetings\n' },
          result: { status: 'done', summary: 'cheated', evidence: '' },
        },
      ]),
    );

    // Then
    expect(result).toMatchObject({
      outcome: 'integrity_violation',
      violations: [{ path: 'acceptance/hello.sh', kind: 'modified' }],
    });
    expect(result.attempts).toHaveLength(1);
    expect(result.attempts.map((a) => a.verify)).toEqual([undefined]);
    expect(commitsOnBranch()).toBe('0');
  });

  it('Can_report_worker_error_and_keep_the_worktree_when_the_worker_throws', async () => {
    // When
    const actual = await next([]);

    // Then
    expect(actual).toBe(1);
    expect(printed()).toEqual([
      'ticket: 01-greet',
      'worker_error (exit 1) after 1 attempt',
      'error: no more scripted steps',
      `worktree kept: ${worktree()}`,
      expect.stringMatching(/\/runs\/greet-\d{8}T\d{6}Z$/),
    ]);
    expect(existsSync(worktree())).toBe(true);
  });

  it('Can_ask_only_twice_when_max_attempts_is_2', async () => {
    // When
    const actual = await next([doNothing, doNothing, doNothing], { config: { maxAttempts: 2 } });

    // Then
    expect(actual).toBe(1);
    expect(printed()[1]).toBe('escalated (exit 1) after 2 attempts');
    expect(inputs()).toHaveLength(2);
  });

  it('Can_build_the_first_prompt_from_the_body_the_design_sections_in_order_and_the_test', async () => {
    const path = join(repo, greetTicket);
    writeFileSync(path, readFileSync(path, 'utf8').replace("design: ['1']", "design: ['2', '1']"));
    commitAll(repo, 'Name both sections');

    // When
    await next([specDefectStep]);

    // Then
    const [prompt = ''] = inputs();
    expect(prompt).toContain('`src/greet.txt`, containing the word `greetings`.');
    expect(prompt).toContain('- `src/greet.txt` contains `greetings`');
    const farewells = prompt.indexOf('## 2. Farewells');
    const greetings = prompt.indexOf('## 1. Greetings');
    expect(farewells).toBeGreaterThan(-1);
    expect(greetings).toBeGreaterThan(farewells);
    expect(prompt).toContain('- `acceptance/greet.sh`');
  });

  it('Can_pick_02_farewell_after_a_green_run_is_merged', async () => {
    await next([fixGreet]);
    mergeIntoMain(repo, 'factory/greet');
    output = mock<Output>();

    // When
    const actual = await next([specDefectStep]);

    // Then
    expect(actual).toBe(1);
    expect(printed()[0]).toBe('ticket: 02-farewell');
    expect(existsSync(worktree('farewell'))).toBe(true);
  });
});
