import type { MakeResult } from '../make/make.js';
import { tail } from '../text/tail.js';

export function verifyFeedback(result: MakeResult, tailLines: number): string {
  const lines = tail(result.output, tailLines);
  const header = `make verify failed with exit ${String(result.exitCode)}. Last ${String(tailLines)} lines:`;
  return `${header}\n${lines === '' ? '(no output)' : lines}`;
}
