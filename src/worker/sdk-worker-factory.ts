import { sealedGlobs } from '../integrity/sealed-globs.js';
import { type AgentQuery, SdkWorker } from './sdk-worker.js';
import { workerEnv } from './worker-env.js';
import type { WorkerFactory } from './worker-factory.js';

export function sdkWorkerFactory(
  agent: AgentQuery,
  model: string,
  env: NodeJS.ProcessEnv,
): WorkerFactory {
  return ({ pack, factoryYaml }) =>
    new SdkWorker(agent, {
      model,
      sealed: sealedGlobs(pack, factoryYaml),
      network: pack.network,
      env: workerEnv(env),
    });
}
