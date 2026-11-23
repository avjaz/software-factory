import { describe, expect, it } from 'vitest';

import { transcriptOf } from '../../../src/report/transcript.js';
import { someMessages } from '../../support/data.js';
import { attemptFactory } from '../../support/factories.js';

describe('transcriptOf', () => {
  it('Can_write_one_json_line_per_message_in_order_across_attempts', () => {
    const attempts = [
      attemptFactory.build({ messages: someMessages() }),
      attemptFactory.build({ messages: [] }),
      attemptFactory.build({ messages: someMessages() }),
    ];

    // When
    const actual = transcriptOf(attempts);

    // Then
    expect(actual.endsWith('\n')).toBe(true);
    const parsed = actual
      .trimEnd()
      .split('\n')
      .map((line): unknown => JSON.parse(line));
    expect(parsed).toEqual(attempts.flatMap((attempt) => attempt.messages));
  });

  it('Can_write_nothing_when_there_are_no_messages', () => {
    // When
    const actual = transcriptOf([attemptFactory.build()]);

    // Then
    expect(actual).toBe('');
  });
});
