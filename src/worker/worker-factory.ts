import type { Pack } from '../packs/pack-loader.js';
import type { FactoryYaml } from '../target/factory-yaml.js';
import type { Worker } from './worker.js';

export interface WorkerContext {
  readonly pack: Pack;
  readonly factoryYaml: FactoryYaml;
}

export type WorkerFactory = (context: WorkerContext) => Worker;
