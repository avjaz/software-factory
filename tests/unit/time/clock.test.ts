import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import { type Clock, since, systemClock } from '../../../src/time/clock.js';
import { somePositiveInteger } from '../../support/data.js';

describe('clock', () => {
  it('Can_tell_the_current_time_when_using_the_system_clock', () => {
    const before = Date.now();

    // When
    const actual = systemClock.now().getTime();

    // Then
    expect(actual).toBeGreaterThanOrEqual(before);
    expect(actual).toBeLessThanOrEqual(Date.now());
  });

  it('Can_measure_the_milliseconds_since_a_start_time', () => {
    const start = new Date();
    const elapsed = somePositiveInteger();
    const clock = mock<Clock>();

    // Given
    clock.now.mockReturnValue(new Date(start.getTime() + elapsed));

    // When
    const actual = since(clock, start);

    // Then
    expect(actual).toBe(elapsed);
  });
});
