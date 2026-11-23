export interface DesignSection {
  readonly number: string;
  readonly text: string;
}

export interface TestFile {
  readonly source: string;
  readonly target: string;
}

export interface Ticket {
  readonly folder: string;
  readonly number: string;
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly design: readonly DesignSection[];
}

export interface PendingTicket {
  readonly dir: string;
  readonly ticket: Ticket;
  readonly testFiles: readonly TestFile[];
}
