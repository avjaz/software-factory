import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import type { Pack } from '../../../src/packs/pack-loader.js';
import type { AgentQuery } from '../../../src/worker/sdk-worker.js';
import { sdkWorkerFactory } from '../../../src/worker/sdk-worker-factory.js';
import { workerEnv } from '../../../src/worker/worker-env.js';
import { buildWorkerOptions } from '../../../src/worker/worker-options.js';
import { someHostname, somePackName, someString } from '../../support/data.js';
import { sdkSuccess } from '../../support/sdk-messages.js';

async function* once(sessionId: string): AsyncGenerator<ReturnType<typeof sdkSuccess>, void> {
  await Promise.resolve();
  yield sdkSuccess(sessionId);
}

describe('sdkWorkerFactory', () => {
  it('Can_make_a_worker_with_the_model_every_sealed_glob_the_pack_hosts_and_a_clean_env', async () => {
    const agent = mock<AgentQuery>();
    const model = someString();
    const env = { PATH: someString(), GITHUB_TOKEN: someString() };
    const pack: Pack = {
      name: somePackName(),
      dir: someString(),
      sealed: ['acceptance/**'],
      network: [someHostname()],
      skills: [],
    };
    const worktree = `/work/${someString()}`;
    const prompt = someString();
    agent.run.mockReturnValue(once(someString()));

    // When
    const worker = sdkWorkerFactory(
      agent,
      model,
      env,
    )({ pack, factoryYaml: { pack: pack.name, sealed: ['x/**'] } });
    await worker.start({ worktree, prompt });

    // Then
    expect(agent.run).toHaveBeenCalledExactlyOnceWith(
      prompt,
      buildWorkerOptions({
        worktree,
        model,
        sealed: ['.factory.yaml', '**/.gitignore', 'acceptance/**', 'x/**'],
        network: pack.network,
        env: workerEnv(env),
      }),
    );
  });
});
