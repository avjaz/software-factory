import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Commands } from '../../src/cli/commands.js';
import { type Cli, type CliOptions, createCli, createCommands } from '../../src/cli/create-cli.js';
import { type FactoryConfig, loadConfig } from '../../src/config/factory-config.js';
import type { Clock } from '../../src/time/clock.js';
import { tickingClock } from './clock.js';
import { ScriptedWorker, type ScriptedStep } from './scripted-worker.js';
import { fixturePacksRoot } from './tiny-repo.js';

const factoryConfig = join(import.meta.dirname, '..', '..', 'factory.config.yaml');

export const specDefectStep: ScriptedStep = {
  result: { status: 'spec_defect', summary: 'stop here', evidence: 'test harness stop' },
};

export interface TestCliOptions {
  readonly packsRoot?: string;
  readonly steps?: readonly ScriptedStep[];
  readonly config?: Partial<FactoryConfig>;
  readonly onWorker?: (worker: ScriptedWorker) => void;
  readonly clock?: Clock;
}

const sharedClock = tickingClock();

export function newWorkRoot(): string {
  return mkdtempSync(join(tmpdir(), 'factory-work-'));
}

function cliOptions(workRoot: string, options: TestCliOptions): CliOptions {
  return {
    packsRoot: options.packsRoot ?? fixturePacksRoot,
    workRoot,
    config: { ...loadConfig(factoryConfig), ...options.config },
    env: process.env,
    clock: options.clock ?? sharedClock,
    workerFactory: () => {
      const worker = new ScriptedWorker(options.steps ?? [specDefectStep]);
      options.onWorker?.(worker);
      return worker;
    },
  };
}

export function testCli(workRoot: string, options: TestCliOptions = {}): Cli {
  return createCli(cliOptions(workRoot, options));
}

export function testCommands(workRoot: string, options: TestCliOptions = {}): Commands {
  return createCommands(cliOptions(workRoot, options));
}
