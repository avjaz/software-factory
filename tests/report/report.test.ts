import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { basename, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import type { Output } from '../../src/cli/output.js';
import { type RunReport, runReportSchema } from '../../src/report/run-report.js';
import { newWorkRoot, type TestCliOptions, testCli } from '../support/cli.js';
import { someMessages, someString, someUsage } from '../support/data.js';
import type { ScriptedStep } from '../support/scripted-worker.js';
import { createTinyRepo, type TinyRepoOptions } from '../support/tiny-repo.js';

function fixGreet(): ScriptedStep {
  return {
    write: { 'src/greet.txt': 'greetings\n' },
    result: { status: 'done', summary: someString(), evidence: '' },
    usage: someUsage(),
    messages: someMessages(),
  };
}

function doNothing(): ScriptedStep {
  return {
    result: { status: 'done', summary: someString(), evidence: '' },
    usage: someUsage(),
    messages: someMessages(),
  };
}

function git(dir: string, ...args: readonly string[]): string {
  return spawnSync('git', args, { cwd: dir, encoding: 'utf8' }).stdout.trim();
}

describe('run report on tiny repo 01-greet', () => {
  const dirs: string[] = [];
  let output: MockProxy<Output>;
  let workRoot: string;
  let repo: string;

  function useRepo(options: TinyRepoOptions = {}): void {
    repo = createTinyRepo(options);
    dirs.push(repo);
  }

  async function next(steps: readonly ScriptedStep[], extra: TestCliOptions = {}): Promise<string> {
    output = mock<Output>();
    await testCli(workRoot, { steps, ...extra })(['next', '--repo', repo], output);
    const last = output.out.mock.calls.at(-1)?.[0];
    if (last === undefined) {
      throw new Error('nothing printed');
    }
    return last;
  }

  function reportOf(dir: string): RunReport {
    return runReportSchema.parse(JSON.parse(readFileSync(join(dir, 'report.json'), 'utf8')));
  }

  function worktree(): string {
    return join(workRoot, 'worktrees', `${basename(repo)}-greet`);
  }

  beforeEach(() => {
    workRoot = newWorkRoot();
    dirs.push(workRoot);
    useRepo();
  });

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('Can_print_the_report_directory_under_runs_as_the_last_line', async () => {
    // When
    const actual = await next([fixGreet()]);

    // Then
    expect(actual.startsWith(join(workRoot, 'runs', 'greet-'))).toBe(true);
    expect(basename(actual)).toMatch(/^greet-\d{8}T\d{6}Z$/);
    expect(readdirSync(actual).sort()).toEqual(['report.json', 'report.md', 'transcript.jsonl']);
  });

  it('Can_report_a_green_run_with_commit_model_tokens_cost_integrity_verify_and_timings', async () => {
    const step = fixGreet();
    const model = someString();
    const base = git(repo, 'rev-parse', 'main');

    // When
    const report = reportOf(await next([step], { config: { model } }));

    // Then
    expect(report).toMatchObject({
      outcome: 'green',
      ticketId: 'greet',
      base,
      branch: 'factory/greet',
      commit: git(repo, 'rev-parse', 'factory/greet'),
      model,
      timings: { preflightMs: 1000 },
      attempts: [
        {
          number: 1,
          status: 'done',
          summary: step.result.summary,
          inputTokens: step.usage?.inputTokens,
          outputTokens: step.usage?.outputTokens,
          costUsd: step.usage?.costUsd,
          integrity: 'ok',
          verifyExit: 0,
          workerMs: 1000,
          verifyMs: 1000,
        },
      ],
    });
    expect(report).not.toHaveProperty('worktree');
  });

  it('Can_report_an_escalated_run_with_3_attempts_their_verify_results_and_the_worktree', async () => {
    // When
    const report = reportOf(await next([doNothing(), doNothing(), doNothing()]));

    // Then
    expect(report).toMatchObject({ outcome: 'escalated', worktree: worktree() });
    expect(report).not.toHaveProperty('commit');
    expect(report.attempts).toHaveLength(3);
    for (const attempt of report.attempts) {
      expect(attempt.verifyExit).toBe(2);
      expect(attempt.verifyTail).toContain('src/greet.txt does not contain greetings');
    }
  });

  it('Can_list_the_violations_when_the_outcome_is_integrity_violation', async () => {
    // When
    const report = reportOf(
      await next([{ ...fixGreet(), write: { 'acceptance/hello.sh': 'exit 0\n' } }]),
    );

    // Then
    expect(report).toMatchObject({
      outcome: 'integrity_violation',
      violations: [{ path: 'acceptance/hello.sh', kind: 'modified' }],
      attempts: [{ integrity: 'violation' }],
    });
  });

  it('Can_report_baseline_red_with_zero_attempts_and_the_verify_tail', async () => {
    useRepo({ broken: true });

    // When
    const report = reportOf(await next([fixGreet()]));

    // Then
    expect(report).toMatchObject({ outcome: 'baseline_red', attempts: [] });
    expect(report).toHaveProperty('verifyTail', expect.stringContaining('BROKEN is present'));
  });

  it('Can_write_one_transcript_line_per_scripted_message_in_order_across_attempts', async () => {
    const steps = [doNothing(), doNothing(), fixGreet()];

    // When
    const dir = await next(steps);

    // Then
    const lines = readFileSync(join(dir, 'transcript.jsonl'), 'utf8').trimEnd().split('\n');
    expect(lines.map((line): unknown => JSON.parse(line))).toEqual(
      steps.flatMap((step) => step.messages ?? []),
    );
  });

  it('Can_name_the_outcome_first_and_show_status_cost_and_verify_per_attempt_in_report_md', async () => {
    const steps = [doNothing(), fixGreet()];

    // When
    const dir = await next(steps);

    // Then
    const markdown = readFileSync(join(dir, 'report.md'), 'utf8');
    const [first = ''] = markdown.split('\n');
    expect(first).toContain('green');
    const [, one = '', two = ''] = markdown.split('## Attempt ');
    expect(one).toContain('status: done');
    expect(one).toContain(`cost: $${(steps[0]?.usage?.costUsd ?? 0).toFixed(4)}`);
    expect(one).toContain('verify: exit 2');
    expect(two).toContain('status: done');
    expect(two).toContain(`cost: $${(steps[1]?.usage?.costUsd ?? 0).toFixed(4)}`);
    expect(two).toContain('verify: exit 0');
  });

  it('Can_make_the_total_cost_equal_the_sum_of_the_attempt_costs', async () => {
    const steps = [doNothing(), doNothing(), doNothing()];

    // When
    const report = reportOf(await next(steps));

    // Then
    const sum = steps.reduce((total, step) => total + (step.usage?.costUsd ?? 0), 0);
    expect(report.totalCostUsd).toBeCloseTo(sum, 10);
    expect(report.totalCostUsd).toBeCloseTo(
      report.attempts.reduce((total, attempt) => total + attempt.costUsd, 0),
      10,
    );
  });

  it('Can_write_two_separate_directories_for_two_runs_of_the_same_ticket', async () => {
    const first = await next([doNothing(), doNothing(), doNothing()]);
    git(repo, 'worktree', 'remove', '--force', worktree());
    git(repo, 'branch', '-D', 'factory/greet');

    // When
    const second = await next([fixGreet()]);

    // Then
    expect(second).not.toBe(first);
    expect(reportOf(first).outcome).toBe('escalated');
    expect(reportOf(second).outcome).toBe('green');
    expect(existsSync(join(first, 'report.json'))).toBe(true);
  });
});
