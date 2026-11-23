import type { PreflightFailed } from '../run/outcome.js';
import { tail } from '../text/tail.js';
import type { Output } from './output.js';

export function printFailure(failed: PreflightFailed, output: Output, tailLines: number): void {
  output.out(`${failed.outcome}: make ${failed.target} exited ${String(failed.result.exitCode)}`);
  const lines = tail(failed.result.output, tailLines);
  if (lines !== '') {
    output.out(lines);
  }
}
