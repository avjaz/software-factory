import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import {
  type AgentQuery,
  SdkWorker,
  type SdkWorkerSettings,
} from '../../../src/worker/sdk-worker.js';
import { WorkerError } from '../../../src/worker/worker-error.js';
import { buildWorkerOptions } from '../../../src/worker/worker-options.js';
import { someHostname, someString } from '../../support/data.js';
import { sdkError, sdkNote, sdkSuccess } from '../../support/sdk-messages.js';

async function* stream(
  messages: readonly SDKMessage[],
  failure?: unknown,
): AsyncGenerator<SDKMessage, void> {
  for (const message of messages) {
    await Promise.resolve();
    yield message;
  }
  if (failure !== undefined) {
    await rejection(failure);
  }
}

function rejection(reason: unknown): Promise<never> {
  const failing = mock<{ readonly fail: () => Promise<never> }>();
  failing.fail.mockRejectedValue(reason);
  return failing.fail();
}

describe('SdkWorker', () => {
  let agent: MockProxy<AgentQuery>;
  let settings: SdkWorkerSettings;
  let subject: SdkWorker;
  let worktree: string;
  let prompt: string;
  let sessionId: string;

  beforeEach(() => {
    agent = mock<AgentQuery>();
    settings = {
      model: someString(),
      sealed: ['acceptance/**'],
      network: [someHostname()],
      env: { PATH: someString() },
    };
    subject = new SdkWorker(agent, settings);
    worktree = `/work/${someString()}`;
    prompt = someString();
    sessionId = someString();
  });

  function givenTurns(...turns: readonly (readonly SDKMessage[])[]): void {
    for (const messages of turns) {
      agent.run.mockReturnValueOnce(stream(messages));
    }
  }

  it('Can_start_a_session_with_the_built_options_and_return_the_finish_result_and_every_message', async () => {
    const result = sdkSuccess(sessionId);
    const messages = [sdkNote(sessionId), sdkNote(sessionId), result];
    givenTurns(messages);

    // When
    const actual = await subject.start({ worktree, prompt });

    // Then
    expect(agent.run).toHaveBeenCalledExactlyOnceWith(
      prompt,
      buildWorkerOptions({ ...settings, worktree }),
    );
    expect(actual.result).toEqual(result.structured_output);
    expect(actual.messages).toEqual(messages);
  });

  it('Can_count_cache_tokens_as_input_and_take_the_cost_from_the_result', async () => {
    const result = sdkSuccess(sessionId);
    givenTurns([result]);

    // When
    const actual = await subject.start({ worktree, prompt });

    // Then
    const { usage } = result;
    expect(actual.usage).toEqual({
      inputTokens:
        usage.input_tokens + usage.cache_creation_input_tokens + usage.cache_read_input_tokens,
      outputTokens: usage.output_tokens,
      costUsd: result.total_cost_usd,
    });
  });

  it('Can_resume_the_first_session_with_the_feedback_and_return_only_that_turns_messages', async () => {
    const feedback = someString();
    const second = [sdkNote(someString()), sdkSuccess(someString())];
    givenTurns([sdkNote(sessionId), sdkSuccess(sessionId)], second, [sdkSuccess(someString())]);
    await subject.start({ worktree, prompt });

    // When
    const actual = await subject.resume(feedback);
    await subject.resume(feedback);

    // Then
    expect(actual.messages).toEqual(second);
    const expected = buildWorkerOptions({ ...settings, worktree, resume: sessionId });
    expect(agent.run).toHaveBeenNthCalledWith(2, feedback, expected);
    expect(agent.run).toHaveBeenNthCalledWith(3, feedback, expected);
  });

  it('Can_refuse_to_resume_before_start', async () => {
    // When
    const actual = subject.resume(someString());

    // Then
    await expect(actual).rejects.toThrow(/^resume called before a session started$/);
    expect(agent.run).not.toHaveBeenCalled();
  });

  it('Can_refuse_to_resume_when_the_first_turn_yielded_no_session', async () => {
    agent.run.mockReturnValueOnce(stream([], new Error('spawn failed')));
    await expect(subject.start({ worktree, prompt })).rejects.toThrow(WorkerError);

    // When
    const actual = subject.resume(someString());

    // Then
    await expect(actual).rejects.toThrow(/^resume called before a session started$/);
  });

  it.each([
    ['an Error', new Error('boom'), 'boom'],
    ['a string', 'boom', 'boom'],
  ])(
    'Can_fail_with_a_worker_error_when_the_sdk_throws_%s_before_a_result',
    async (_, failure, reason) => {
      // Given
      agent.run.mockReturnValueOnce(stream([sdkNote(sessionId)], failure));

      // When
      const actual = subject.start({ worktree, prompt });

      // Then
      await expect(actual).rejects.toThrow(new WorkerError(`agent sdk failed: ${reason}`));
      await expect(actual).rejects.toHaveProperty('cause', failure);
    },
  );

  it('Can_fail_when_the_stream_ends_without_a_result', async () => {
    // Given
    givenTurns([sdkNote(sessionId)]);

    // When
    const actual = subject.start({ worktree, prompt });

    // Then
    await expect(actual).rejects.toThrow(/^agent sdk ended without a result$/);
  });

  it('Can_fail_with_the_sdk_errors_when_the_result_is_an_error_such_as_no_sandbox', async () => {
    // Given
    const errors = ['sandbox required but unavailable', someString()];
    givenTurns([sdkError(sessionId, { errors })]);

    // When
    const actual = subject.start({ worktree, prompt });

    // Then
    await expect(actual).rejects.toThrow(
      new WorkerError(`agent sdk ended with error_during_execution: ${errors.join('; ')}`),
    );
  });

  it('Can_report_the_error_result_and_not_the_throw_when_the_sdk_throws_after_it', async () => {
    // Given
    const errors = [someString()];
    agent.run.mockReturnValueOnce(
      stream(
        [sdkError(sessionId, { subtype: 'error_max_structured_output_retries', errors })],
        new Error('query ended with an error'),
      ),
    );

    // When
    const actual = subject.start({ worktree, prompt });

    // Then
    await expect(actual).rejects.toThrow(
      new WorkerError(
        `agent sdk ended with error_max_structured_output_retries: ${errors[0] ?? ''}`,
      ),
    );
  });

  it('Can_keep_a_successful_result_when_the_sdk_throws_after_it', async () => {
    // Given
    const result = sdkSuccess(sessionId);
    agent.run.mockReturnValueOnce(stream([result], new Error('late')));

    // When
    const actual = await subject.start({ worktree, prompt });

    // Then
    expect(actual.result).toEqual(result.structured_output);
  });

  it('Can_fail_when_a_success_result_is_flagged_as_an_error', async () => {
    // Given
    const text = someString();
    givenTurns([sdkSuccess(sessionId, { is_error: true, result: text })]);

    // When
    const actual = subject.start({ worktree, prompt });

    // Then
    await expect(actual).rejects.toThrow(new WorkerError(`agent sdk ended with an error: ${text}`));
  });

  it.each([
    ['missing', undefined],
    ['malformed', { status: 'finished', summary: 'x', evidence: '' }],
  ])('Can_fail_when_the_finish_result_is_%s', async (_, structured) => {
    // Given
    givenTurns([sdkSuccess(sessionId, { structured_output: structured })]);

    // When
    const actual = subject.start({ worktree, prompt });

    // Then
    await expect(actual).rejects.toThrow(/^agent sdk returned no valid finish result$/);
  });
});
