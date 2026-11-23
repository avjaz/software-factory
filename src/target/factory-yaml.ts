import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { z } from 'zod';

import { parseMapping } from '../yaml/parse-mapping.js';
import { FactoryYamlError } from './factory-yaml-error.js';

const schema = z.strictObject({
  pack: z.string().min(1, 'must not be empty'),
  sealed: z.array(z.string().min(1, 'must not be empty')).readonly().optional(),
});

export type FactoryYaml = Readonly<z.infer<typeof schema>>;

export const factoryYamlFile = '.factory.yaml';

export function parseFactoryYaml(text: string): FactoryYaml {
  return parseMapping(text, schema, (message, options) => new FactoryYamlError(message, options));
}

export function readFactoryYaml(repo: string): FactoryYaml | undefined {
  const path = join(repo, factoryYamlFile);
  if (!existsSync(path)) {
    return undefined;
  }
  return parseFactoryYaml(readFileSync(path, 'utf8'));
}
