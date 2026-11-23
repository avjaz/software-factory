import { parse } from 'yaml';
import type { z } from 'zod';

export type ErrorFactory = (message: string, options?: ErrorOptions) => Error;

export function parseMapping<S extends z.ZodType>(
  text: string,
  schema: S,
  fail: ErrorFactory,
): z.output<S> {
  const document = parseYaml(text, fail);
  if (typeof document !== 'object' || document === null || Array.isArray(document)) {
    throw fail('expected a mapping');
  }
  const result = schema.safeParse(document);
  if (!result.success) {
    throw fail(result.error.issues.map(describeIssue).join('; '));
  }
  return result.data;
}

function parseYaml(text: string, fail: ErrorFactory): unknown {
  try {
    return parse(text);
  } catch (e) {
    throw fail(`not valid YAML: ${String(e)}`, { cause: e });
  }
}

function describeIssue(issue: z.core.$ZodIssue): string {
  if (issue.code === 'unrecognized_keys') {
    return `unknown key: ${issue.keys.join(', ')}`;
  }
  return `${issue.path.join('.')}: ${issue.message}`;
}
