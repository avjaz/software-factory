import { RefusalError } from '../refusal.js';

const param = /^([^=]+)=(.*)$/s;

export function parseParams(
  raw: readonly (string | boolean)[] | undefined,
): ReadonlyMap<string, string> {
  const params = new Map<string, string>();
  for (const entry of raw ?? []) {
    const match = typeof entry === 'string' ? param.exec(entry) : null;
    const [, name, value] = match ?? [];
    if (name === undefined || value === undefined) {
      throw new RefusalError(`--param must be name=value: ${String(entry)}`);
    }
    if (params.has(name)) {
      throw new RefusalError(`--param ${name} given twice`);
    }
    params.set(name, value);
  }
  return params;
}
