import type { AttemptRecord } from '../run/run-result.js';

export function transcriptOf(attempts: readonly AttemptRecord[]): string {
  return attempts
    .flatMap((attempt) => attempt.messages)
    .map((message) => `${JSON.stringify(message)}\n`)
    .join('');
}
