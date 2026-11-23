import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createTinyRepo } from '../support/tiny-repo.js';

const root = join(import.meta.dirname, '..', '..');

function factory(...args: readonly string[]): {
  readonly status: number | null;
  readonly stderr: string;
} {
  const result = spawnSync('corepack', ['pnpm', '--silent', 'factory', ...args], {
    cwd: root,
    encoding: 'utf8',
  });
  return { status: result.status, stderr: result.stderr };
}

describe('factory CLI', () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('Can_refuse_an_unknown_pack_when_init_is_given_nope', () => {
    const repo = createTinyRepo({ uninitialised: true });
    dirs.push(repo);

    // When
    const actual = factory('init', '--repo', repo, '--pack', 'nope');

    // Then
    expect(actual).toEqual({ status: 2, stderr: 'unknown pack: nope\n' });
  });

  it('Can_refuse_a_plain_dir_when_init_is_given_one', () => {
    const dir = mkdtempSync(join(tmpdir(), 'plain-'));
    dirs.push(dir);

    // When
    const actual = factory('init', '--repo', dir, '--pack', 'fake');

    // Then
    expect(actual).toEqual({ status: 2, stderr: 'not a git repo\n' });
  });

  it('Can_print_usage_listing_commands_when_run_without_arguments', () => {
    // When
    const actual = factory();

    // Then
    expect(actual.status).toBe(2);
    expect(actual.stderr).toContain('init, next, check, validate-ticket');
  });

  it('Can_require_a_ticket_when_check_has_none', () => {
    // When
    const actual = factory('check', '--repo', 'x');

    // Then
    expect(actual).toEqual({ status: 2, stderr: '--ticket is required\n' });
  });

  it('Can_refuse_a_missing_dir_when_next_is_given_one', () => {
    // When
    const actual = factory('next', '--repo', join(tmpdir(), 'factory-cli-missing'));

    // Then
    expect(actual).toEqual({ status: 2, stderr: 'not a git repo\n' });
  });

  it('Can_require_repo_when_next_has_none', () => {
    // When
    const actual = factory('next');

    // Then
    expect(actual).toEqual({ status: 2, stderr: '--repo is required\n' });
  });

  it('Can_reject_an_unknown_command_when_bogus_is_given', () => {
    // When
    const actual = factory('bogus');

    // Then
    expect(actual).toEqual({ status: 2, stderr: 'unknown command: bogus\n' });
  });
});
