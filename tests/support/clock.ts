import { faker } from '@faker-js/faker';

import type { Clock } from '../../src/time/clock.js';

const second = 1000;

export function tickingClock(start: Date = faker.date.recent(), stepMs: number = second): Clock {
  let current = start.getTime();
  return {
    now: () => {
      const now = new Date(current);
      current += stepMs;
      return now;
    },
  };
}
