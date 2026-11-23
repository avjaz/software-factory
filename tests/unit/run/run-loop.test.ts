import { beforeEach, describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import type { Git } from '../../../src/git/git.js';
import type { Integrity, IntegrityInput } from '../../../src/integrity/integrity-check.js';
import type { IntegrityResult } from '../../../src/integrity/violation.js';
import type { Make, MakeResult } from '../../../src/make/make.js';
import { RunLoop } from '../../../src/run/run-loop.js';
import type { FinishResult, Usage, Worker, WorkerTurn } from '../../../src/worker/worker.js';
import { tickingClock } from '../../support/clock.js';
import { someMessages, somePositiveInteger, someString } from '../../support/data.js';

function someUsage(): Usage {
  return { inputTokens: somePositiveInteger(), outputTokens: somePositiveInteger(), costUsd: 0.5 };
}

function turn(result: Partial<FinishResult> = {}): WorkerTurn {
  return {
    result: { status: 'done', summary: someString(), evidence: '', ...result },
    usage: someUsage(),
    messages: someMessages(),
  };
}

const ok: IntegrityResult = { ok: true };

describe('RunLoop', () => {
  let make: MockProxy<Make>;
  let integrity: MockProxy<Integrity>;
  let git: MockProxy<Git>;
  let worker: MockProxy<Worker>;
  let input: IntegrityInput;
  let prompt: string;
  const tailLines = 2;
  let step: number;

  beforeEach(() => {
    make = mock<Make>();
    integrity = mock<Integrity>();
    git = mock<Git>();
    worker = mock<Worker>();
    prompt = someString();
    input = mock<IntegrityInput>({ worktree: someString() });
    integrity.check.mockReturnValue(ok);
    step = somePositiveInteger();
  });

  function loop(maxAttempts = 3): RunLoop {
    return new RunLoop(
      make,
      integrity,
      git,
      { maxAttempts, tailLines },
      tickingClock(new Date(), step),
    );
  }

  function failing(): MakeResult {
    return { exitCode: 2, output: `x\n${someString()}\nlast\n` };
  }

  it('Can_end_green_after_one_attempt_when_verify_passes', async () => {
    // Given
    const first = turn();
    worker.start.mockResolvedValue(first);
    make.run.mockResolvedValue({ exitCode: 0, output: 'fine\n' });

    // When
    const actual = await loop().run(worker, prompt, input);

    // Then
    expect(actual).toEqual({
      outcome: 'green',
      attempts: [
        {
          number: 1,
          workerMs: step,
          messages: first.messages,
          result: first.result,
          usage: first.usage,
          integrity: ok,
          verify: { exitCode: 0, tail: 'fine', ms: step },
        },
      ],
    });
    expect(worker.start).toHaveBeenCalledExactlyOnceWith({ worktree: input.worktree, prompt });
    expect(integrity.check).toHaveBeenCalledExactlyOnceWith(input);
    expect(make.run).toHaveBeenCalledExactlyOnceWith(input.worktree, 'verify');
    expect(worker.resume).not.toHaveBeenCalled();
  });

  it('Can_resume_with_the_verify_feedback_and_end_green_when_the_second_attempt_passes', async () => {
    // Given
    const verify = failing();
    worker.start.mockResolvedValue(turn());
    worker.resume.mockResolvedValue(turn());
    make.run.mockResolvedValueOnce(verify).mockResolvedValueOnce({ exitCode: 0, output: '' });

    // When
    const actual = await loop().run(worker, prompt, input);

    // Then
    expect(actual.outcome).toBe('green');
    expect(actual.attempts.map((a) => a.verify?.exitCode)).toEqual([2, 0]);
    const lastTwo = verify.output.trim().split('\n').slice(-2).join('\n');
    expect(worker.resume).toHaveBeenCalledExactlyOnceWith(
      `make verify failed with exit 2. Last 2 lines:\n${lastTwo}`,
    );
  });

  it.each([3, 2])(
    'Can_escalate_after_%i_attempts_when_verify_never_passes',
    async (maxAttempts) => {
      // Given
      const verify = failing();
      worker.start.mockResolvedValue(turn());
      worker.resume.mockResolvedValue(turn());
      make.run.mockResolvedValue(verify);

      // When
      const actual = await loop(maxAttempts).run(worker, prompt, input);

      // Then
      expect(actual).toMatchObject({
        outcome: 'escalated',
        lastTail: verify.output.trim().split('\n').slice(-2).join('\n'),
      });
      expect(actual.attempts).toHaveLength(maxAttempts);
      expect(worker.start).toHaveBeenCalledOnce();
      expect(worker.resume).toHaveBeenCalledTimes(maxAttempts - 1);
      expect(make.run).toHaveBeenCalledTimes(maxAttempts);
    },
  );

  it('Can_stop_with_spec_defect_without_checking_or_verifying_when_the_worker_gives_evidence', async () => {
    // Given
    const defect = turn({ status: 'spec_defect', evidence: someString() });
    worker.start.mockResolvedValue(defect);

    // When
    const actual = await loop().run(worker, prompt, input);

    // Then
    expect(actual).toEqual({
      outcome: 'spec_defect',
      attempts: [
        {
          number: 1,
          workerMs: step,
          messages: defect.messages,
          result: defect.result,
          usage: defect.usage,
        },
      ],
      summary: defect.result.summary,
      evidence: defect.result.evidence,
    });
    expect(integrity.check).not.toHaveBeenCalled();
    expect(make.run).not.toHaveBeenCalled();
  });

  it.each(['', '  \n'])(
    'Can_call_it_a_worker_error_when_spec_defect_comes_with_evidence_%j',
    async (evidence) => {
      // Given
      worker.start.mockResolvedValue(turn({ status: 'spec_defect', evidence }));

      // When
      const actual = await loop().run(worker, prompt, input);

      // Then
      expect(actual).toMatchObject({
        outcome: 'worker_error',
        error: 'spec_defect without evidence',
      });
      expect(make.run).not.toHaveBeenCalled();
    },
  );

  it('Can_remove_ignored_files_after_the_integrity_check_and_before_each_verify', async () => {
    // Given
    worker.start.mockResolvedValue(turn());
    worker.resume.mockResolvedValue(turn());
    make.run.mockResolvedValueOnce(failing()).mockResolvedValueOnce({ exitCode: 0, output: '' });

    // When
    await loop().run(worker, prompt, input);

    // Then
    expect(git.cleanIgnored).toHaveBeenCalledTimes(2);
    expect(git.cleanIgnored).toHaveBeenCalledWith(input.worktree);
    const checks = integrity.check.mock.invocationCallOrder;
    const cleans = git.cleanIgnored.mock.invocationCallOrder;
    const verifies = make.run.mock.invocationCallOrder;
    for (const attempt of [0, 1]) {
      expect(checks[attempt]).toBeLessThan(cleans[attempt] ?? 0);
      expect(cleans[attempt]).toBeLessThan(verifies[attempt] ?? 0);
    }
  });

  it('Can_leave_ignored_files_alone_when_the_integrity_check_fails', async () => {
    // Given
    worker.start.mockResolvedValue(turn());
    integrity.check.mockReturnValue({
      ok: false,
      violations: [{ path: 'Makefile', kind: 'modified' }],
    });

    // When
    await loop().run(worker, prompt, input);

    // Then
    expect(git.cleanIgnored).not.toHaveBeenCalled();
  });

  it('Can_leave_ignored_files_alone_when_the_worker_reports_a_spec_defect', async () => {
    // Given
    worker.start.mockResolvedValue(turn({ status: 'spec_defect', evidence: someString() }));

    // When
    await loop().run(worker, prompt, input);

    // Then
    expect(git.cleanIgnored).not.toHaveBeenCalled();
  });

  it('Can_stop_with_integrity_violation_before_verify_when_a_sealed_path_changed', async () => {
    // Given
    const violated: IntegrityResult = {
      ok: false,
      violations: [{ path: 'acceptance/hello.sh', kind: 'modified' }],
    };
    worker.start.mockResolvedValue(turn());
    integrity.check.mockReturnValue(violated);

    // When
    const actual = await loop().run(worker, prompt, input);

    // Then
    expect(actual).toMatchObject({
      outcome: 'integrity_violation',
      violations: [{ path: 'acceptance/hello.sh', kind: 'modified' }],
    });
    expect(actual.attempts).toEqual([expect.objectContaining({ number: 1, integrity: violated })]);
    expect(make.run).not.toHaveBeenCalled();
  });

  it.each([
    ['an Error', new Error('sdk exploded'), 'sdk exploded'],
    ['a string', 'boom', 'boom'],
  ])('Can_call_it_a_worker_error_when_start_rejects_with_%s', async (_, reason, message) => {
    // Given
    worker.start.mockRejectedValue(reason);

    // When
    const actual = await loop().run(worker, prompt, input);

    // Then
    expect(actual).toEqual({
      outcome: 'worker_error',
      attempts: [{ number: 1, workerMs: step, messages: [] }],
      error: message,
    });
    expect(integrity.check).not.toHaveBeenCalled();
  });

  it('Can_keep_earlier_attempts_when_resume_rejects', async () => {
    // Given
    worker.start.mockResolvedValue(turn());
    worker.resume.mockRejectedValue(new Error('session lost'));
    make.run.mockResolvedValue(failing());

    // When
    const actual = await loop().run(worker, prompt, input);

    // Then
    expect(actual).toMatchObject({ outcome: 'worker_error', error: 'session lost' });
    expect(actual.attempts.map((a) => a.number)).toEqual([1, 2]);
    expect(actual.attempts[1]).toEqual({ number: 2, workerMs: step, messages: [] });
  });
});
