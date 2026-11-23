import { readFileSync } from 'node:fs';

import { z } from 'zod';

import { parseMapping } from '../yaml/parse-mapping.js';
import { ConfigError } from './config-error.js';

const schema = z.strictObject({
  model: z.string().min(1),
  maxAttempts: z.int().positive(),
  tailLines: z.int().positive(),
});

export type FactoryConfig = Readonly<z.infer<typeof schema>>;

export function parseConfig(text: string): FactoryConfig {
  return parseMapping(text, schema, (message, options) => new ConfigError(message, options));
}

export function loadConfig(path: string): FactoryConfig {
  return parseConfig(readFileSync(path, 'utf8'));
}
