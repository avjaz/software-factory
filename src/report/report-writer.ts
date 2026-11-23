import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { NextResult } from '../run/run-result.js';
import { buildReport, type ReportSettings } from './build-report.js';
import { reportMarkdown } from './report-markdown.js';
import { transcriptOf } from './transcript.js';

export function runStamp(date: Date): string {
  return `${date.toISOString().slice(0, 19).replaceAll(/[-:]/g, '')}Z`;
}

export function writeReport(runsRoot: string, next: NextResult, settings: ReportSettings): string {
  const report = buildReport(next, settings);
  const dir = claimDir(runsRoot, `${next.ticketId}-${runStamp(next.startedAt)}`);
  writeFileSync(join(dir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(join(dir, 'report.md'), reportMarkdown(report));
  writeFileSync(
    join(dir, 'transcript.jsonl'),
    'attempts' in next.result ? transcriptOf(next.result.attempts) : '',
  );
  return dir;
}

function claimDir(runsRoot: string, name: string): string {
  let dir = join(runsRoot, name);
  for (let suffix = 2; existsSync(dir); suffix += 1) {
    dir = join(runsRoot, `${name}-${String(suffix)}`);
  }
  mkdirSync(dir, { recursive: true });
  return dir;
}
