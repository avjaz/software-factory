import { describe, expect, it } from 'vitest';

import { verifyFeedback } from '../../../src/run/feedback.js';

describe('verifyFeedback', () => {
  it('Can_name_the_exit_code_and_give_the_last_lines_when_verify_fails', () => {
    // When
    const actual = verifyFeedback({ exitCode: 2, output: 'a\nb\nc\nd\n' }, 2);

    // Then
    expect(actual).toBe('make verify failed with exit 2. Last 2 lines:\nc\nd');
  });

  it('Can_say_there_was_no_output_when_verify_printed_nothing', () => {
    // When
    const actual = verifyFeedback({ exitCode: 1, output: '' }, 150);

    // Then
    expect(actual).toBe('make verify failed with exit 1. Last 150 lines:\n(no output)');
  });
});
