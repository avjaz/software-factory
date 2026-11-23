import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildReport, type ReportSettings } from '../../../src/report/build-report.js';
import { reportMarkdown } from '../../../src/report/report-markdown.js';
import { runStamp, writeReport } from '../../../src/report/report-writer.js';
import { transcriptOf } from '../../../src/report/transcript.js';
import type { AttemptRecord, NextResult } from '../../../src/run/run-result.js';
import { someMessages, somePositiveInteger, someString, someTicketId } from '../../support/data.js';
import { attemptFactory } from '../../support/factories.js';

describe('writeReport', () => {
  let root: string;
  let runsRoot: string;
  let settings: ReportSettings;
  let next: NextResult;
  let attempts: readonly AttemptRecord[];

  beforeEach(() => {
    attempts = [attemptFactory.build({ messages: someMessages() })];
    root = mkdtempSync(join(tmpdir(), 'report-writer-'));
    runsRoot = join(root, 'runs');
    settings = { model: someString(), tailLines: 3 };
    const ticketId = someTicketId();
    next = {
      folder: `01-${ticketId}`,
      ticketId,
      startedAt: new Date('2026-11-16T05:06:07.890Z'),
      preflightMs: somePositiveInteger(),
      result: {
        outcome: 'escalated',
        attempts,
        workspace: { base: someString(), branch: `factory/${ticketId}`, worktree: someString() },
        lastTail: '',
      },
    };
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('Can_format_the_run_stamp_as_utc_seconds', () => {
    // When
    const actual = runStamp(new Date('2026-01-02T03:04:05.678Z'));

    // Then
    expect(actual).toBe('20260102T030405Z');
  });

  it('Can_write_the_json_markdown_and_transcript_into_a_new_ticket_stamped_directory', () => {
    // When
    const actual = writeReport(runsRoot, next, settings);

    // Then
    expect(actual).toBe(join(runsRoot, `${next.ticketId}-20261116T050607Z`));
    const report = buildReport(next, settings);
    expect(JSON.parse(readFileSync(join(actual, 'report.json'), 'utf8'))).toEqual(report);
    expect(readFileSync(join(actual, 'report.md'), 'utf8')).toBe(reportMarkdown(report));
    expect(readFileSync(join(actual, 'transcript.jsonl'), 'utf8')).toBe(transcriptOf(attempts));
  });

  it('Can_add_a_numbered_suffix_instead_of_overwriting_when_the_directory_exists', () => {
    const first = writeReport(runsRoot, next, settings);

    // When
    const second = writeReport(runsRoot, next, settings);
    const third = writeReport(runsRoot, next, settings);

    // Then
    expect(second).toBe(`${first}-2`);
    expect(third).toBe(`${first}-3`);
    expect(readdirSync(runsRoot)).toHaveLength(3);
  });

  it('Can_write_an_empty_transcript_when_preflight_failed', () => {
    const failed: NextResult = {
      ...next,
      result: {
        outcome: 'baseline_red',
        workspace: { base: someString(), branch: someString(), worktree: someString() },
        target: 'verify',
        result: { exitCode: 2, output: someString() },
      },
    };

    // When
    const actual = writeReport(runsRoot, failed, settings);

    // Then
    expect(readFileSync(join(actual, 'transcript.jsonl'), 'utf8')).toBe('');
  });
});
