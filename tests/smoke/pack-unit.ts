import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';

import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

import { loadConfig } from '../../src/config/factory-config.js';
import { agentQuery } from '../../src/entrypoints/agent-query.js';
import { sealedGlobs } from '../../src/integrity/sealed-globs.js';
import { loadPack } from '../../src/packs/pack-loader.js';
import { readFactoryYaml } from '../../src/target/factory-yaml.js';
import { workerEnv } from '../../src/worker/worker-env.js';
import { buildWorkerOptions } from '../../src/worker/worker-options.js';
import { commitAll } from '../support/tiny-repo.js';

// Real Claude Agent SDK run proving a pack's `make unit` passes inside the worker's native sandbox,
// with the pack's network allowlist. Each --empty-dir-env NAME sets NAME to a fresh empty directory
// in the worker's environment, so a pack can point its build cache there and start cold.
// Copies the repo's working tree (tracked and untracked, minus ignored files) into a fresh repo.
// Judges from the `make unit` tool result, not from the model's account.

const { values } = parseArgs({
  options: {
    repo: { type: 'string' },
    pack: { type: 'string' },
    'empty-dir-env': { type: 'string', multiple: true },
  },
  strict: true,
});
if (values.repo === undefined || values.pack === undefined) {
  process.stderr.write(
    'usage: pack-unit.ts --repo <dir> --pack <name> [--empty-dir-env <NAME>]...\n',
  );
  process.exit(2);
}

const factoryRoot = join(import.meta.dirname, '..', '..');
const config = loadConfig(join(factoryRoot, 'factory.config.yaml'));
const pack = loadPack(join(factoryRoot, 'packs'), values.pack);
const repo = copyWorkingTree(values.repo);
const emptyDirs = Object.fromEntries(
  (values['empty-dir-env'] ?? []).map(
    (name) => [name, mkdtempSync(join(tmpdir(), 'factory-pack-unit-empty-'))] as const,
  ),
);

function copyWorkingTree(source: string): string {
  const target = mkdtempSync(join(tmpdir(), 'factory-pack-unit-repo-'));
  const listed = execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    { cwd: source, encoding: 'utf8' },
  );
  const files = listed.split('\0').filter((file) => file !== '' && existsSync(join(source, file)));
  for (const file of files) {
    mkdirSync(dirname(join(target, file)), { recursive: true });
    cpSync(join(source, file), join(target, file), { verbatimSymlinks: true });
  }
  execFileSync('git', ['init', '--quiet', '--initial-branch=main'], { cwd: target });
  commitAll(target, 'Working tree copy');
  return target;
}

const prompt = [
  'This is a build check. Make exactly one tool call:',
  'Bash with the command `make unit` and the timeout parameter set to 600000.',
  'Do not chain commands, do not retry, and do not try any workaround if it fails.',
  'Then finish with status done if it passed or blocked if it failed, and as evidence',
  'the last lines of its output.',
].join('\n');

const options = buildWorkerOptions({
  worktree: repo,
  model: config.model,
  sealed: sealedGlobs(pack, readFactoryYaml(repo) ?? {}),
  network: pack.network,
  env: { ...workerEnv(process.env), ...emptyDirs },
});

const started = Date.now();
const messages: SDKMessage[] = [];
const runError = await collect();
const seconds = Math.round((Date.now() - started) / 1000);

const toolUse = z.object({
  type: z.literal('tool_use'),
  id: z.string(),
  name: z.string(),
  input: z.object({ command: z.string().optional(), timeout: z.number().optional() }),
});
const toolResult = z.object({
  type: z.literal('tool_result'),
  tool_use_id: z.string(),
  is_error: z.boolean().optional(),
  content: z.unknown(),
});

const blocks = messages.flatMap((m): readonly unknown[] =>
  (m.type === 'assistant' || m.type === 'user') && Array.isArray(m.message.content)
    ? m.message.content
    : [],
);
const uses = blocks.flatMap((b) => {
  const parsed = toolUse.safeParse(b);
  return parsed.success ? [parsed.data] : [];
});
const results = new Map(
  blocks.flatMap((b) => {
    const parsed = toolResult.safeParse(b);
    return parsed.success ? [[parsed.data.tool_use_id, parsed.data] as const] : [];
  }),
);
const result = messages.find((m) => m.type === 'result');
const denied = new Set(result?.permission_denials.map((d) => d.tool_use_id) ?? []);

const makeUnit = uses.find((u) => u.name === 'Bash' && u.input.command?.trim() === 'make unit');
const makeResult = makeUnit === undefined ? undefined : results.get(makeUnit.id);
const output = JSON.stringify(makeResult?.content ?? '');

async function collect(): Promise<string | undefined> {
  try {
    for await (const message of agentQuery.run(prompt, options)) {
      messages.push(message);
    }
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function judge(): string | undefined {
  if (runError !== undefined) {
    return `the SDK run failed: ${runError}`;
  }
  if (makeUnit === undefined) {
    return 'make unit was not attempted';
  }
  if (denied.has(makeUnit.id)) {
    return 'make unit was refused';
  }
  return makeResult?.is_error === true ? 'make unit failed' : undefined;
}

const failure = judge();
process.stdout.write(`pack: ${pack.name}, network: ${pack.network.join(', ')}\n`);
process.stdout.write(`repo: ${repo}\n`);
for (const [name, dir] of Object.entries(emptyDirs)) {
  process.stdout.write(
    `${name}: ${dir} (now holds: ${readdirSync(dir).join(', ') || 'nothing'})\n`,
  );
}
process.stdout.write(
  `command: make unit (timeout ${String(makeUnit?.input.timeout ?? 'default')})\n`,
);
process.stdout.write(`output tail: ${output.slice(-1500)}\n`);
process.stdout.write(
  `other tool calls: ${
    uses
      .filter((u) => u !== makeUnit)
      .map((u) => `${u.name} ${u.input.command ?? ''}`)
      .join(' | ') || 'none'
  }\n`,
);
process.stdout.write(
  `time: ${String(seconds)}s, cost: $${(result?.total_cost_usd ?? 0).toFixed(4)}\n`,
);
process.stdout.write(failure === undefined ? 'pack unit: ok\n' : `pack unit: FAILED: ${failure}\n`);
process.exitCode = failure === undefined ? 0 : 1;
