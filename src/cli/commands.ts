import type { PreflightResult } from '../run/outcome.js';
import type { NextResult } from '../run/run-result.js';

export const commandNames: readonly string[] = ['init', 'next', 'check', 'validate-ticket'];

export const usage = `usage: factory <command> --repo <dir> [--pack <name> [--skeleton --param <name>=<value>]] [--ticket <NN-id>]\ncommands: ${commandNames.join(', ')}`;

export type ReportedNext = NextResult & { readonly reportDir: string };

export interface Commands {
  readonly init: (
    repo: string,
    pack: string,
    skeleton: ReadonlyMap<string, string> | undefined,
  ) => void;
  readonly next: (repo: string) => Promise<ReportedNext>;
  readonly check: (repo: string, ticket: string) => Promise<PreflightResult>;
  readonly validateTicket: (repo: string, ticket: string) => void;
}

export interface CliSettings {
  readonly tailLines: number;
}
