import { Factory } from 'fishery';
import { stringify } from 'yaml';

import type { AttemptRecord } from '../../src/run/run-result.js';
import { somePositiveInteger, someString, someTicketId } from './data.js';

export interface TicketSpec {
  readonly header: Readonly<Record<string, unknown>>;
  readonly body: string;
}

export const ticketSpecFactory = Factory.define<TicketSpec>(() => ({
  header: { id: someTicketId(), title: someString() },
  body: `## What to build\n\n${someString()}\n\n## Acceptance criteria\n\n- ${someString()}\n`,
}));

export function ticketText(spec: TicketSpec): string {
  return `---\n${stringify(spec.header)}---\n\n${spec.body}`;
}

export const attemptFactory = Factory.define<AttemptRecord>(({ sequence }) => ({
  number: sequence,
  workerMs: somePositiveInteger(),
  messages: [],
}));

export function attempt(number: number): AttemptRecord {
  return attemptFactory.build({ number });
}
