import { join } from 'node:path';

import type { Options } from '@anthropic-ai/claude-agent-sdk';

import { finishJsonSchema } from './finish-schema.js';

export interface WorkerOptionsInput {
  readonly worktree: string;
  readonly model: string;
  readonly sealed: readonly string[];
  readonly network: readonly string[];
  readonly env: Readonly<Record<string, string>>;
  readonly resume?: string;
}

const fileTools: readonly string[] = ['Read', 'Glob', 'Grep', 'Edit', 'Write'];

export const workerTools: readonly string[] = [...fileTools, 'Bash'];

export const allowedBash: readonly string[] = [
  'Bash(make unit)',
  ...['ls', 'cat', 'head', 'tail', 'wc', 'find', 'grep'].map((command) => `Bash(${command} *)`),
];

const findActions: readonly string[] = ['-exec', '-ok', '-delete', '-fprint', '-fls'];

export const deniedFind: readonly string[] = findActions.map((action) => `Bash(find *${action}*)`);

export function editDenials(worktree: string, sealed: readonly string[]): readonly string[] {
  return [...sealed, '.git/**'].map((glob) => `Edit(/${join(worktree, glob)})`);
}

export function buildWorkerOptions(input: WorkerOptionsInput): Options {
  return {
    cwd: input.worktree,
    model: input.model,
    tools: [...workerTools],
    allowedTools: [...fileTools, ...allowedBash],
    permissionMode: 'dontAsk',
    settingSources: ['project'],
    env: { ...input.env },
    outputFormat: { type: 'json_schema', schema: { ...finishJsonSchema } },
    settings: {
      permissions: {
        deny: [...editDenials(input.worktree, input.sealed), ...deniedFind],
        disableBypassPermissionsMode: 'disable',
        blockWritesOutsideWorkingDirectories: true,
      },
    },
    sandbox: {
      enabled: true,
      failIfUnavailable: true,
      allowUnsandboxedCommands: false,
      autoAllowBashIfSandboxed: false,
      // Local binding lets unit tests start a server on a free port; outbound stays on the allowlist.
      network: {
        allowedDomains: [...input.network],
        strictAllowlist: true,
        allowLocalBinding: true,
      },
    },
    ...(input.resume === undefined ? {} : { resume: input.resume }),
  };
}
