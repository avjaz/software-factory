import { z } from 'zod';

import { parseMapping } from '../yaml/parse-mapping.js';
import { PackError } from './pack-error.js';

const schema = z.strictObject({
  name: z.string(),
  sealed: z
    .array(z.string().min(1, 'must not be empty'))
    .min(1, 'must list at least one glob')
    .readonly(),
  network: z.array(z.hostname({ error: 'not a hostname' })).readonly(),
  skeleton: z
    .strictObject({
      params: z
        .array(
          z.strictObject({
            name: z.string().regex(/^[a-z][a-z0-9]*$/, 'must be a lowercase word'),
            describe: z.string().min(1, 'must not be empty'),
            pattern: z.string().refine(isRegex, 'not a valid regular expression'),
            pathSeparator: z.string().min(1, 'must not be empty').optional(),
          }),
        )
        .readonly(),
    })
    .optional(),
});

function isRegex(pattern: string): boolean {
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

export type PackManifest = Readonly<z.infer<typeof schema>>;

export function parseManifest(text: string, folder: string): PackManifest {
  const fail = (message: string, options?: ErrorOptions): PackError =>
    new PackError(`pack ${folder}: ${message}`, options);
  const manifest = parseMapping(text, schema, fail);
  if (manifest.name !== folder) {
    throw fail(`name "${manifest.name}" does not match its folder`);
  }
  return manifest;
}
