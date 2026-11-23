import { faker } from '@faker-js/faker';

import type { TranscriptMessage, Usage } from '../../src/worker/worker.js';

export function someString(): string {
  return faker.string.alphanumeric({ length: { min: 1, max: 12 } });
}

export function someRepoPath(): string {
  return `${someString()}/${someString()}`;
}

export function somePositiveInteger(): number {
  return faker.number.int({ min: 1, max: 1000 });
}

export function somePackName(): string {
  return faker.string.alpha({ length: { min: 1, max: 12 }, casing: 'lower' });
}

export function someHostname(): string {
  return faker.internet.domainName();
}

export function someTicketId(): string {
  const word = (): string => faker.string.alpha({ length: { min: 1, max: 8 }, casing: 'lower' });
  return `${word()}-${word()}`;
}

export function someTicketNumber(): string {
  return faker.string.numeric(2);
}

export function someCostUsd(): number {
  return faker.number.float({ min: 0.0001, max: 5, fractionDigits: 4 });
}

export function someUsage(): Usage {
  return {
    inputTokens: somePositiveInteger(),
    outputTokens: somePositiveInteger(),
    costUsd: someCostUsd(),
  };
}

export function someMessages(): readonly TranscriptMessage[] {
  return faker.helpers.multiple(() => ({ type: someString(), text: someString() }), {
    count: { min: 1, max: 3 },
  });
}
