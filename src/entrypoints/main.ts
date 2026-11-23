import { join } from 'node:path';

import { createCli } from '../cli/create-cli.js';
import { loadConfig } from '../config/factory-config.js';
import { systemClock } from '../time/clock.js';
import { sdkWorkerFactory } from '../worker/sdk-worker-factory.js';
import { agentQuery } from './agent-query.js';

const factoryRoot = join(import.meta.dirname, '..', '..');

const config = loadConfig(join(factoryRoot, 'factory.config.yaml'));

const cli = createCli({
  packsRoot: join(factoryRoot, 'packs'),
  workRoot: join(factoryRoot, '.factory'),
  config,
  env: process.env,
  workerFactory: sdkWorkerFactory(agentQuery, config.model, process.env),
  clock: systemClock,
});

process.exitCode = await cli(process.argv.slice(2), {
  out: (line) => process.stdout.write(`${line}\n`),
  err: (line) => process.stderr.write(`${line}\n`),
});
