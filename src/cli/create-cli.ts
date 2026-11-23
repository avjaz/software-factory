import { join } from 'node:path';

import { FactoryCheck } from '../check/factory-check.js';
import type { FactoryConfig } from '../config/factory-config.js';
import { ProcessGit } from '../git/process-git.js';
import { FactoryInit } from '../init/factory-init.js';
import { GitDirWatch } from '../integrity/git-dir-watch.js';
import { IntegrityCheck } from '../integrity/integrity-check.js';
import { ProcessMake } from '../make/process-make.js';
import { FactoryNext } from '../next/factory-next.js';
import { loadPack } from '../packs/pack-loader.js';
import { writeReport } from '../report/report-writer.js';
import { GreenCommit } from '../run/green-commit.js';
import { Preflight } from '../run/preflight.js';
import { RunLoop } from '../run/run-loop.js';
import { TargetGuard } from '../run/target-guard.js';
import { TicketRun } from '../run/ticket-run.js';
import { pendingTicket } from '../tickets/ticket-queue.js';
import type { Clock } from '../time/clock.js';
import type { WorkerFactory } from '../worker/worker-factory.js';
import type { Commands } from './commands.js';
import type { Output } from './output.js';
import { runCli } from './run-cli.js';

export type Cli = (argv: readonly string[], output: Output) => Promise<number>;

export interface CliOptions {
  readonly packsRoot: string;
  readonly workRoot: string;
  readonly config: FactoryConfig;
  readonly env: NodeJS.ProcessEnv;
  readonly workerFactory: WorkerFactory;
  readonly clock: Clock;
}

export function createCommands(options: CliOptions): Commands {
  const git = new ProcessGit();
  const make = new ProcessMake(options.env);
  const packs = { load: (name: string) => loadPack(options.packsRoot, name) };
  const guard = new TargetGuard(git, packs);
  const preflight = new Preflight(git, make, options.workRoot);
  const watch = new GitDirWatch(git);
  const loop = new RunLoop(
    make,
    new IntegrityCheck(git, watch),
    git,
    options.config,
    options.clock,
  );
  const runner = new TicketRun(watch, loop, new GreenCommit(git), options.workerFactory);
  const init = new FactoryInit(git, packs);
  const next = new FactoryNext(guard, git, preflight, runner, options.clock);
  const check = new FactoryCheck(guard, git, preflight);
  return {
    init: (repo, pack, skeleton) => {
      init.run(repo, pack, skeleton);
    },
    next: async (repo) => {
      const result = await next.run(repo);
      const reportDir = writeReport(join(options.workRoot, 'runs'), result, {
        model: options.config.model,
        tailLines: options.config.tailLines,
      });
      return { ...result, reportDir };
    },
    check: (repo, ticket) => check.run(repo, ticket),
    validateTicket: (repo, ticket) => {
      pendingTicket(repo, ticket);
    },
  };
}

export function createCli(options: CliOptions): Cli {
  const commands = createCommands(options);
  const settings = { tailLines: options.config.tailLines };
  return (argv, output) => runCli(argv, output, commands, settings);
}
