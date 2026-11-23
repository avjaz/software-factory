import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createTinyRepo, fakePackDir, type TinyRepoOptions } from '../support/tiny-repo.js';

function run(cwd: string, command: string, ...args: readonly string[]): number | null {
  return spawnSync(command, args, { cwd, encoding: 'utf8' }).status;
}

function stdout(cwd: string, command: string, ...args: readonly string[]): string {
  return spawnSync(command, args, { cwd, encoding: 'utf8' }).stdout;
}

function copyGreetTest(repo: string): void {
  copyFileSync(
    join(repo, 'docs/tickets/pending/01-greet/acceptance/greet.sh'),
    join(repo, 'acceptance/greet.sh'),
  );
}

describe('createTinyRepo', () => {
  const repos: string[] = [];

  function tinyRepo(options?: TinyRepoOptions): string {
    const repo = createTinyRepo(options);
    repos.push(repo);
    return repo;
  }

  afterEach(() => {
    for (const repo of repos.splice(0)) {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('Can_pass_verify_with_a_clean_main_when_created_with_defaults', () => {
    // When
    const repo = tinyRepo();

    // Then
    expect(run(repo, 'make', 'verify')).toBe(0);
    expect(stdout(repo, 'git', 'status', '--porcelain')).toBe('');
    expect(stdout(repo, 'git', 'branch', '--show-current')).toBe('main\n');
  });

  it('Can_carry_the_fake_pack_makefile_byte_for_byte_when_created', () => {
    // When
    const repo = tinyRepo();

    // Then
    expect(readFileSync(join(repo, 'Makefile'))).toEqual(
      readFileSync(join(fakePackDir, 'Makefile')),
    );
  });

  it('Can_fail_verify_when_created_broken', () => {
    // When
    const repo = tinyRepo({ broken: true });

    // Then
    expect(run(repo, 'make', 'verify')).not.toBe(0);
    expect(stdout(repo, 'git', 'status', '--porcelain')).toBe('');
  });

  it('Can_turn_acceptance_red_then_green_when_greet_test_is_added_then_satisfied', () => {
    const repo = tinyRepo();

    // When
    copyGreetTest(repo);

    // Then
    expect(run(repo, 'make', 'acceptance')).not.toBe(0);

    // When
    writeFileSync(join(repo, 'src/greet.txt'), 'greetings\n');

    // Then
    expect(run(repo, 'make', 'acceptance')).toBe(0);
  });

  it('Can_pass_acceptance_with_greet_test_when_created_already_green', () => {
    const repo = tinyRepo({ alreadyGreen: true });

    // When
    copyGreetTest(repo);

    // Then
    expect(run(repo, 'make', 'acceptance')).toBe(0);
  });

  it('Can_fail_unit_when_a_unit_script_fails', () => {
    const repo = tinyRepo();
    mkdirSync(join(repo, 'unit'), { recursive: true });
    writeFileSync(join(repo, 'unit/zz-fail.sh'), 'exit 1\n');

    // When
    const actual = run(repo, 'make', 'unit');

    // Then
    expect(actual).not.toBe(0);
  });

  it('Can_leave_out_every_factory_file_with_a_clean_main_when_created_uninitialised', () => {
    // When
    const repo = tinyRepo({ uninitialised: true });

    // Then
    for (const path of ['Makefile', 'CLAUDE.factory.md', 'CLAUDE.md', '.factory.yaml', '.claude']) {
      expect(existsSync(join(repo, path)), path).toBe(false);
    }
    expect(existsSync(join(repo, 'acceptance/hello.sh'))).toBe(true);
    expect(stdout(repo, 'git', 'status', '--porcelain')).toBe('');
    expect(stdout(repo, 'git', 'branch', '--show-current')).toBe('main\n');
  });

  it('Can_give_independent_directories_when_called_twice', () => {
    const first = tinyRepo();
    const second = tinyRepo();

    // When
    writeFileSync(join(first, 'BROKEN'), '');

    // Then
    expect(first).not.toBe(second);
    expect(run(first, 'make', 'verify')).not.toBe(0);
    expect(run(second, 'make', 'verify')).toBe(0);
  });
});
