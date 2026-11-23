import type { PendingTicket } from '../tickets/ticket.js';

export interface CopiedTest {
  readonly target: string;
  readonly pendingPath: string;
}

export function copiedTestsOf(pending: PendingTicket): readonly CopiedTest[] {
  const folder = `docs/tickets/pending/${pending.ticket.folder}`;
  return pending.testFiles.map(({ target }) => ({ target, pendingPath: `${folder}/${target}` }));
}
