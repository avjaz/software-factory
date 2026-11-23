import { describe, expect, it } from 'vitest';

import { exitCodeOf } from '../../../src/run/run-result.js';

describe('exitCodeOf', () => {
  it.each([
    ['green', 0],
    ['escalated', 1],
    ['spec_defect', 1],
    ['integrity_violation', 1],
    ['baseline_red', 1],
    ['ticket_already_green', 1],
    ['worker_error', 1],
  ] as const)('Can_give_the_design_exit_code_when_the_outcome_is_%s', (outcome, expected) => {
    // When
    const actual = exitCodeOf(outcome);

    // Then
    expect(actual).toBe(expected);
  });
});
