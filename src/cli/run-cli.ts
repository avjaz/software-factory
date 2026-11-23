import { parseArgs } from 'node:util';

import { type CliSettings, type Commands, usage } from './commands.js';
import type { Output } from './output.js';
import { isPreflightFailure } from '../run/outcome.js';
import { exitCodeOf } from '../run/run-result.js';
import { printFailure } from './print-failure.js';
import { printRun } from './print-run.js';
import { isRefusal } from './refusals.js';
import { tail } from '../text/tail.js';
import { parseParams } from './params.js';

const usageExit = 2;
const failedExit = 1;

interface Context {
  readonly repo: string;
  readonly values: Readonly<Record<string, string | boolean | (string | boolean)[] | undefined>>;
  readonly output: Output;
  readonly commands: Commands;
  readonly settings: CliSettings;
}

interface CommandSpec {
  readonly options: ReadonlySet<string>;
  readonly run: (context: Context) => Promise<number>;
}

const specs: ReadonlyMap<string, CommandSpec> = new Map<string, CommandSpec>([
  ['init', { options: new Set(['repo', 'pack', 'skeleton', 'param']), run: runInit }],
  ['next', { options: new Set(['repo']), run: runNext }],
  ['check', { options: new Set(['repo', 'ticket']), run: runCheck }],
  ['validate-ticket', { options: new Set(['repo', 'ticket']), run: runValidateTicket }],
]);

export async function runCli(
  argv: readonly string[],
  output: Output,
  commands: Commands,
  settings: CliSettings,
): Promise<number> {
  const [command, ...rest] = argv;
  const spec = command === undefined ? undefined : specs.get(command);
  if (spec === undefined) {
    output.err(command === undefined ? usage : `unknown command: ${command}`);
    return usageExit;
  }
  const { values, tokens } = parseArgs({
    args: [...rest],
    options: {
      repo: { type: 'string' },
      pack: { type: 'string' },
      ticket: { type: 'string' },
      skeleton: { type: 'boolean' },
      param: { type: 'string', multiple: true },
    },
    strict: false,
    tokens: true,
  });
  const unknown = tokens.find((token) => token.kind === 'option' && !spec.options.has(token.name));
  if (unknown?.kind === 'option') {
    output.err(`unknown option: ${unknown.rawName}\n${usage}`);
    return usageExit;
  }
  const { repo } = values;
  if (typeof repo !== 'string') {
    output.err('--repo is required');
    return usageExit;
  }
  try {
    return await spec.run({ repo, values, output, commands, settings });
  } catch (e) {
    if (!isRefusal(e)) {
      throw e;
    }
    output.err(e.message);
    return usageExit;
  }
}

function runInit({ repo, values, output, commands }: Context): Promise<number> {
  const { pack, skeleton, param } = values;
  if (typeof pack !== 'string') {
    output.err('--pack is required');
    return Promise.resolve(usageExit);
  }
  const params = parseParams(Array.isArray(param) ? param : undefined);
  if (skeleton !== true && params.size > 0) {
    output.err('--param needs --skeleton');
    return Promise.resolve(usageExit);
  }
  commands.init(repo, pack, skeleton === true ? params : undefined);
  output.out(`initialised with pack ${pack}; review the changes and commit them`);
  return Promise.resolve(0);
}

async function runNext({ repo, output, commands, settings }: Context): Promise<number> {
  const { folder, result, reportDir } = await commands.next(repo);
  output.out(`ticket: ${folder}`);
  if (isPreflightFailure(result)) {
    printFailure(result, output, settings.tailLines);
    output.out(`worktree kept: ${result.workspace.worktree}`);
  } else {
    printRun(result, output);
  }
  output.out(reportDir);
  return isPreflightFailure(result) ? failedExit : exitCodeOf(result.outcome);
}

async function runCheck({ repo, values, output, commands, settings }: Context): Promise<number> {
  const { ticket } = values;
  if (typeof ticket !== 'string') {
    output.err('--ticket is required');
    return usageExit;
  }
  const result = await commands.check(repo, ticket);
  if (result.outcome === 'ok') {
    output.out(`ok: main is green, ${ticket} is red`);
    const lines = tail(result.acceptance.output, settings.tailLines);
    if (lines !== '') {
      output.out(lines);
    }
    return 0;
  }
  printFailure(result, output, settings.tailLines);
  return failedExit;
}

function runValidateTicket({ repo, values, output, commands }: Context): Promise<number> {
  const { ticket } = values;
  if (typeof ticket !== 'string') {
    output.err('--ticket is required');
    return Promise.resolve(usageExit);
  }
  commands.validateTicket(repo, ticket);
  output.out(`ok: ${ticket} is valid`);
  return Promise.resolve(0);
}
