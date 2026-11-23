const passedThrough: readonly string[] = [
  'PATH',
  'HOME',
  'USER',
  'SHELL',
  'TMPDIR',
  'LANG',
  'LC_ALL',
  'TERM',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'CLAUDE_CODE_OAUTH_TOKEN',
];

export const clientApp = 'software-factory/0.0.0';

export function workerEnv(env: NodeJS.ProcessEnv): Readonly<Record<string, string>> {
  const kept = passedThrough.flatMap((name) => {
    const value = env[name];
    return value === undefined ? [] : [[name, value] as const];
  });
  return { ...Object.fromEntries(kept), CLAUDE_AGENT_SDK_CLIENT_APP: clientApp };
}
