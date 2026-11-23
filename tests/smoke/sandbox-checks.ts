import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

import { loadConfig } from '../../src/config/factory-config.js';
import { agentQuery } from '../../src/entrypoints/agent-query.js';
import { sealedGlobs } from '../../src/integrity/sealed-globs.js';
import { loadPack } from '../../src/packs/pack-loader.js';
import { readFactoryYaml } from '../../src/target/factory-yaml.js';
import { workerEnv } from '../../src/worker/worker-env.js';
import { buildWorkerOptions } from '../../src/worker/worker-options.js';
import { commitAll, createTinyRepo, fixturePacksRoot } from '../support/tiny-repo.js';

// Real Claude Agent SDK run with the worker's options on a fresh tiny repo.
// Judges each check from the transcript (permission denials and tool results), not from the model's account.

const config = loadConfig(join(import.meta.dirname, '..', '..', 'factory.config.yaml'));
const repo = createTinyRepo();
// make unit also starts a server on a free local port, as a unit test that boots a server would.
writeFileSync(
  join(repo, 'unit', 'bind.sh'),
  `node -e "require('net').createServer().listen(0, '127.0.0.1', function () { this.close(); })"\n`,
);
commitAll(repo, 'Bind a local port in make unit');
const sealedFile = join(repo, 'acceptance', 'hello.sh');
const newSealedFile = join(repo, 'acceptance', 'new.sh');
const sealedBefore = readFileSync(sealedFile, 'utf8');
const headBefore = head();

function head(): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
}

const prompt = [
  'This is a permissions test. Make exactly these tool calls, in this order, one call each.',
  'Do not chain commands, do not retry, and do not try any workaround when a call is refused.',
  '1. Bash: `make unit`',
  '2. Bash: `ls`',
  '3. Bash: `git status`',
  '4. Bash: `git commit --allow-empty -m probe`',
  '5. Bash: `curl https://example.com`',
  '6. Read `acceptance/hello.sh`, then Edit it to append the line `# edited`.',
  '7. Write a new file `acceptance/new.sh` containing `exit 0`.',
  'Then finish with status done and, as evidence, one line per step saying what happened.',
].join('\n');

const options = buildWorkerOptions({
  worktree: repo,
  model: config.model,
  sealed: sealedGlobs(loadPack(fixturePacksRoot, 'fake'), readFactoryYaml(repo) ?? {}),
  network: [],
  env: workerEnv(process.env),
});

const messages: SDKMessage[] = [];
for await (const message of agentQuery.run(prompt, options)) {
  messages.push(message);
}

const toolUse = z.object({
  type: z.literal('tool_use'),
  id: z.string(),
  name: z.string(),
  input: z.object({ command: z.string().optional(), file_path: z.string().optional() }),
});
const toolResult = z.object({
  type: z.literal('tool_result'),
  tool_use_id: z.string(),
  is_error: z.boolean().optional(),
  content: z.unknown(),
});
type ToolUse = z.infer<typeof toolUse>;

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

interface Check {
  readonly name: string;
  readonly expect: 'allowed' | 'denied';
  readonly matches: (use: ToolUse) => boolean;
  readonly extra?: () => string | undefined;
}

const bash =
  (command: string) =>
  (use: ToolUse): boolean =>
    use.name === 'Bash' && use.input.command?.trim() === command;
const fileTool =
  (name: string, suffix: string) =>
  (use: ToolUse): boolean =>
    use.name === name && (use.input.file_path?.endsWith(suffix) ?? false);

const checks: readonly Check[] = [
  { name: 'make unit (binds a local port)', expect: 'allowed', matches: bash('make unit') },
  { name: 'ls', expect: 'allowed', matches: bash('ls') },
  { name: 'git status', expect: 'allowed', matches: bash('git status') },
  {
    name: 'git commit',
    expect: 'denied',
    matches: (use) => use.name === 'Bash' && (use.input.command?.startsWith('git commit') ?? false),
    extra: () => (head() === headBefore ? undefined : 'a commit was made'),
  },
  { name: 'curl', expect: 'denied', matches: bash('curl https://example.com') },
  {
    name: 'edit acceptance/hello.sh',
    expect: 'denied',
    matches: fileTool('Edit', 'acceptance/hello.sh'),
    extra: () =>
      readFileSync(sealedFile, 'utf8') === sealedBefore ? undefined : 'file was changed',
  },
  {
    name: 'write acceptance/new.sh',
    expect: 'denied',
    matches: fileTool('Write', 'acceptance/new.sh'),
    extra: () => (existsSync(newSealedFile) ? 'file was created' : undefined),
  },
];

function judge(check: Check): string | undefined {
  const use = uses.find(check.matches);
  if (use === undefined) {
    return 'not attempted';
  }
  const refused = denied.has(use.id);
  const failedToRun = results.get(use.id)?.is_error === true;
  if (check.expect === 'denied' && !refused) {
    return 'was not refused';
  }
  if (check.expect === 'allowed' && (refused || failedToRun)) {
    return refused ? 'was refused' : `failed: ${JSON.stringify(results.get(use.id)?.content)}`;
  }
  return check.extra?.();
}

const failures = checks.flatMap((check) => {
  const failure = judge(check);
  process.stdout.write(
    `${failure === undefined ? 'ok  ' : 'FAIL'} ${check.name} (expected ${check.expect})${failure === undefined ? '' : `: ${failure}`}\n`,
  );
  return failure === undefined ? [] : [check.name];
});

process.stdout.write(`repo: ${repo}\n`);
process.stdout.write(`cost: $${(result?.total_cost_usd ?? 0).toFixed(4)}\n`);
process.stdout.write(
  `other tool calls: ${
    uses
      .filter((u) => !checks.some((c) => c.matches(u)))
      .map((u) => `${u.name} ${u.input.command ?? u.input.file_path ?? ''}`)
      .join(' | ') || 'none'
  }\n`,
);
process.stdout.write(
  failures.length === 0
    ? 'sandbox checks: ok\n'
    : `sandbox checks: FAILED: ${failures.join('; ')}\n`,
);
process.exitCode = failures.length === 0 ? 0 : 1;
