import { spawn } from 'node:child_process';
import { constants } from 'node:os';

import type { Make, MakeResult } from './make.js';
import { MakeError } from './make-error.js';

const callerMakeVariables: ReadonlySet<string> = new Set(['MAKEFLAGS', 'MFLAGS', 'MAKELEVEL']);
const signalBase = 128;

export class ProcessMake implements Make {
  private readonly env: NodeJS.ProcessEnv;

  constructor(env: NodeJS.ProcessEnv) {
    this.env = Object.fromEntries(
      Object.entries(env).filter(([key]) => !callerMakeVariables.has(key)),
    );
  }

  run(dir: string, target: string): Promise<MakeResult> {
    return new Promise((resolve, reject) => {
      const child = spawn('sh', ['-c', 'exec make "$1" 2>&1', 'sh', target], {
        cwd: dir,
        env: this.env,
        stdio: ['ignore', 'pipe', 'inherit'],
      });
      const chunks: Buffer[] = [];
      child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
      child.on('error', (e) => {
        reject(
          new MakeError(`make ${target} could not start in ${dir}: ${e.message}`, { cause: e }),
        );
      });
      child.on('close', (code, signal) => {
        const exitCode = signal === null ? Number(code) : signalBase + constants.signals[signal];
        resolve({ exitCode, output: Buffer.concat(chunks).toString('utf8') });
      });
    });
  }
}
