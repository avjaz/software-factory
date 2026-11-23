import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { FinishResult, Usage } from '../../src/worker/worker.js';
import { someMessages, someString } from '../support/data.js';
import { ScriptedWorker } from '../support/scripted-worker.js';

function someResult(): FinishResult {
  return { status: 'done', summary: someString(), evidence: someString() };
}

describe('ScriptedWorker', () => {
  let worktree: string;

  beforeEach(() => {
    worktree = mkdtempSync(join(tmpdir(), 'scripted-worker-'));
  });

  afterEach(() => {
    rmSync(worktree, { recursive: true, force: true });
  });

  it('Can_return_each_step_result_and_record_inputs_when_started_then_resumed', async () => {
    const first = someResult();
    const second = someResult();
    const usage: Usage = { inputTokens: 10, outputTokens: 20, costUsd: 0.5 };
    const prompt = someString();
    const message = someString();
    const messages = someMessages();
    const subject = new ScriptedWorker([{ result: first, usage, messages }, { result: second }]);

    // When
    const started = await subject.start({ worktree, prompt });
    const resumed = await subject.resume(message);

    // Then
    expect(started).toEqual({ result: first, usage, messages });
    expect(resumed).toEqual({
      result: second,
      usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
      messages: [],
    });
    expect(subject.inputs).toEqual([prompt, message]);
  });

  it('Can_fail_when_called_after_the_last_step', async () => {
    const subject = new ScriptedWorker([{ result: someResult() }, { result: someResult() }]);
    await subject.start({ worktree, prompt: someString() });
    await subject.resume(someString());

    // When
    const actual = subject.resume(someString());

    // Then
    await expect(actual).rejects.toThrow(/^no more scripted steps$/);
  });

  it('Can_write_and_delete_files_in_the_worktree_when_a_step_runs', async () => {
    writeFileSync(join(worktree, 'old.txt'), someString());
    const content = someString();
    const subject = new ScriptedWorker([
      { write: { 'src/new.txt': content }, delete: ['old.txt'], result: someResult() },
    ]);

    // When
    await subject.start({ worktree, prompt: someString() });

    // Then
    expect(readFileSync(join(worktree, 'src/new.txt'), 'utf8')).toBe(content);
    expect(existsSync(join(worktree, 'old.txt'))).toBe(false);
  });

  it('Can_fail_when_resumed_before_start', async () => {
    const subject = new ScriptedWorker([{ result: someResult() }]);

    // When
    const actual = subject.resume(someString());

    // Then
    await expect(actual).rejects.toThrow(/^resume called before start$/);
  });
});
