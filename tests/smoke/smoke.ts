import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createCli } from '../../src/cli/create-cli.js';
import { loadConfig } from '../../src/config/factory-config.js';
import { agentQuery } from '../../src/entrypoints/agent-query.js';
import { runReportSchema } from '../../src/report/run-report.js';
import { systemClock } from '../../src/time/clock.js';
import { sdkWorkerFactory } from '../../src/worker/sdk-worker-factory.js';
import { createTinyRepo, fixturePacksRoot } from '../support/tiny-repo.js';

const config = loadConfig(join(import.meta.dirname, '..', '..', 'factory.config.yaml'));
const workRoot = mkdtempSync(join(tmpdir(), 'factory-smoke-'));
const repo = createTinyRepo();
const lines: string[] = [];

const cli = createCli({
  packsRoot: fixturePacksRoot,
  workRoot,
  config,
  env: process.env,
  workerFactory: sdkWorkerFactory(agentQuery, config.model, process.env),
  clock: systemClock,
});

const exit = await cli(['next', '--repo', repo], {
  out: (line) => {
    lines.push(line);
    process.stdout.write(`${line}\n`);
  },
  err: (line) => process.stderr.write(`${line}\n`),
});

const reportDir = lines.at(-1) ?? '';
const report = runReportSchema.parse(
  JSON.parse(readFileSync(join(reportDir, 'report.json'), 'utf8')),
);
const tokens = report.attempts.reduce((sum, a) => sum + a.inputTokens + a.outputTokens, 0);
const failures = [
  ...(exit === 0 && report.outcome === 'green'
    ? []
    : [`outcome ${report.outcome}, exit ${String(exit)}`]),
  ...(report.attempts.length <= config.maxAttempts ? [] : ['more attempts than maxAttempts']),
  ...(tokens > 0 ? [] : ['no tokens recorded']),
  ...(report.totalCostUsd > 0 ? [] : ['no cost recorded']),
];
process.stdout.write(
  `repo: ${repo}\nwork root: ${workRoot}\ntokens: ${String(tokens)}, cost: $${report.totalCostUsd.toFixed(4)}\n`,
);
process.stdout.write(
  failures.length === 0 ? 'smoke: ok\n' : `smoke: FAILED: ${failures.join('; ')}\n`,
);
process.exitCode = failures.length === 0 ? 0 : 1;
