import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import type { Output } from '../../src/cli/output.js';
import { newWorkRoot, testCli } from '../support/cli.js';
import {
  commitAll,
  createTinyRepo,
  fakePackDir,
  fixturePacksRoot,
  type TinyRepoOptions,
} from '../support/tiny-repo.js';

function git(repo: string, ...args: readonly string[]): string {
  return spawnSync('git', args, { cwd: repo, encoding: 'utf8' }).stdout;
}

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('factory init', () => {
  const dirs: string[] = [];
  let output: MockProxy<Output>;

  function track(dir: string): string {
    dirs.push(dir);
    return dir;
  }

  function tinyRepo(options: TinyRepoOptions = { uninitialised: true }): string {
    return track(createTinyRepo(options));
  }

  function init(repo: string, pack = 'fake', packsRoot = fixturePacksRoot): Promise<number> {
    return testCli(track(newWorkRoot()), { packsRoot })(
      ['init', '--repo', repo, '--pack', pack],
      output,
    );
  }

  beforeEach(() => {
    output = mock<Output>();
  });

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('Can_set_up_every_pack_file_without_committing_when_the_repo_is_uninitialised', async () => {
    const repo = tinyRepo();
    const head = git(repo, 'rev-parse', 'HEAD');

    // When
    const actual = await init(repo);

    // Then
    expect(actual).toBe(0);
    expect(readFileSync(join(repo, 'Makefile'))).toEqual(
      readFileSync(join(fakePackDir, 'Makefile')),
    );
    expect(read(join(repo, 'CLAUDE.factory.md'))).toBe(
      read(join(fakePackDir, 'CLAUDE.factory.md')),
    );
    expect(read(join(repo, '.claude/skills/fake-standards/SKILL.md'))).toBe(
      read(join(fakePackDir, 'skills/fake-standards/SKILL.md')),
    );
    expect(read(join(repo, '.factory.yaml'))).toBe('pack: fake\n');
    expect(read(join(repo, 'CLAUDE.md'))).toBe('@CLAUDE.factory.md\n');
    expect(git(repo, 'rev-parse', 'HEAD')).toBe(head);
    expect(git(repo, 'status', '--porcelain', '--untracked-files=all').split('\n').sort()).toEqual([
      '',
      '?? .claude/skills/fake-standards/SKILL.md',
      '?? .factory.yaml',
      '?? CLAUDE.factory.md',
      '?? CLAUDE.md',
      '?? Makefile',
    ]);
    expect(output.out).toHaveBeenCalledExactlyOnceWith(
      'initialised with pack fake; review the changes and commit them',
    );
    expect(output.err).not.toHaveBeenCalled();
  });

  it('Can_pass_verify_when_the_initialised_repo_is_committed', async () => {
    const repo = tinyRepo();

    // When
    await init(repo);
    commitAll(repo, 'init');

    // Then
    expect(spawnSync('make', ['verify'], { cwd: repo }).status).toBe(0);
  });

  it('Can_append_the_import_line_once_when_claude_md_exists_without_it', async () => {
    const repo = tinyRepo();
    writeFileSync(join(repo, 'CLAUDE.md'), '# Tiny repo rules\n');
    commitAll(repo, 'own CLAUDE.md');

    // When
    const first = await init(repo);
    commitAll(repo, 'init');
    const second = await init(repo);

    // Then
    expect([first, second]).toEqual([0, 0]);
    expect(read(join(repo, 'CLAUDE.md'))).toBe('# Tiny repo rules\n@CLAUDE.factory.md\n');
  });

  it('Can_change_nothing_when_init_runs_again_on_an_initialised_repo', async () => {
    const repo = tinyRepo();
    await init(repo);
    commitAll(repo, 'init');

    // When
    const actual = await init(repo);

    // Then
    expect(actual).toBe(0);
    expect(git(repo, 'status', '--porcelain', '--untracked-files=all')).toBe('');
  });

  it('Can_keep_an_existing_factory_yaml_unchanged_when_it_has_an_extra_sealed_entry', async () => {
    const repo = tinyRepo();
    const existing = 'pack: fake\nsealed:\n  - src/hello.txt\n';
    writeFileSync(join(repo, '.factory.yaml'), existing);
    commitAll(repo, 'own .factory.yaml');

    // When
    const actual = await init(repo);

    // Then
    expect(actual).toBe(0);
    expect(read(join(repo, '.factory.yaml'))).toBe(existing);
  });

  it('Can_refuse_with_exit_2_when_the_working_tree_is_dirty', async () => {
    const repo = tinyRepo();
    writeFileSync(join(repo, 'src/hello.txt'), 'changed\n');

    // When
    const actual = await init(repo);

    // Then
    expect(actual).toBe(2);
    expect(output.err).toHaveBeenCalledExactlyOnceWith('working tree is dirty');
    expect(git(repo, 'status', '--porcelain')).toBe(' M src/hello.txt\n');
  });

  it('Can_refuse_with_exit_2_when_the_pack_is_unknown', async () => {
    const repo = tinyRepo();

    // When
    const actual = await init(repo, 'nope');

    // Then
    expect(actual).toBe(2);
    expect(output.err).toHaveBeenCalledExactlyOnceWith('unknown pack: nope');
    expect(git(repo, 'status', '--porcelain')).toBe('');
  });

  it('Can_refuse_with_exit_2_when_the_dir_is_not_a_git_repo', async () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'plain-')));

    // When
    const actual = await init(dir);

    // Then
    expect(actual).toBe(2);
    expect(output.err).toHaveBeenCalledExactlyOnceWith('not a git repo');
    expect(readdirSync(dir)).toEqual([]);
  });

  it.each([
    ['an unknown key', 'name: bad\nsealed: [a]\nnetwork: []\nextra: 1\n', 'unknown key: extra'],
    [
      'an empty sealed',
      'name: bad\nsealed: []\nnetwork: []\n',
      'sealed: must list at least one glob',
    ],
    [
      'a name not matching its folder',
      'name: other\nsealed: [a]\nnetwork: []\n',
      'name "other" does not match its folder',
    ],
  ])('Can_name_the_problem_with_exit_2_when_the_manifest_has_%s', async (_, manifest, problem) => {
    const repo = tinyRepo();
    const packsRoot = track(mkdtempSync(join(tmpdir(), 'packs-')));
    cpSync(fakePackDir, join(packsRoot, 'bad'), { recursive: true });
    writeFileSync(join(packsRoot, 'bad', 'manifest.yaml'), manifest);

    // When
    const actual = await init(repo, 'bad', packsRoot);

    // Then
    expect(actual).toBe(2);
    expect(output.err).toHaveBeenCalledExactlyOnceWith(`pack bad: ${problem}`);
    expect(git(repo, 'status', '--porcelain')).toBe('');
  });

  describe('skeleton', () => {
    function freshRepo(): string {
      const repo = track(mkdtempSync(join(tmpdir(), 'fresh-')));
      spawnSync('git', ['init', '--quiet', '--initial-branch=main'], { cwd: repo });
      return repo;
    }

    function initWith(
      repo: string,
      extra: readonly string[],
      pack = 'fake',
      packsRoot = fixturePacksRoot,
    ): Promise<number> {
      return testCli(track(newWorkRoot()), { packsRoot })(
        ['init', '--repo', repo, '--pack', pack, ...extra],
        output,
      );
    }

    function untracked(repo: string): readonly string[] {
      return git(repo, 'status', '--porcelain', '--untracked-files=all')
        .split('\n')
        .filter((line) => line !== '')
        .sort();
    }

    function hasCommits(repo: string): boolean {
      return (
        spawnSync('git', ['rev-parse', '--verify', '--quiet', 'HEAD'], { cwd: repo }).status === 0
      );
    }

    it('Can_initialise_a_fresh_repo_with_no_commits_when_no_skeleton_is_asked_for', async () => {
      const repo = freshRepo();

      // When
      const actual = await init(repo);

      // Then
      expect(actual).toBe(0);
      expect(untracked(repo)).toEqual([
        '?? .claude/skills/fake-standards/SKILL.md',
        '?? .factory.yaml',
        '?? CLAUDE.factory.md',
        '?? CLAUDE.md',
        '?? Makefile',
      ]);
      expect(hasCommits(repo)).toBe(false);
    });

    it('Can_write_the_skeleton_with_the_pack_files_without_committing_when_the_repo_is_fresh', async () => {
      const repo = freshRepo();

      // When
      const actual = await initWith(repo, ['--skeleton', '--param', 'name=greeter']);

      // Then
      expect(actual).toBe(0);
      expect(read(join(repo, 'greeter/hello.txt'))).toBe('hi greeter\n');
      expect(read(join(repo, 'run.sh'))).toBe('#!/bin/sh\necho greeter\n');
      expect(statSync(join(repo, 'run.sh')).mode & 0o111).toBe(0o111);
      expect(untracked(repo)).toEqual([
        '?? .claude/skills/fake-standards/SKILL.md',
        '?? .factory.yaml',
        '?? CLAUDE.factory.md',
        '?? CLAUDE.md',
        '?? Makefile',
        '?? greeter/hello.txt',
        '?? run.sh',
      ]);
      expect(hasCommits(repo)).toBe(false);
      expect(output.err).not.toHaveBeenCalled();
    });

    it('Can_write_no_skeleton_file_when_skeleton_is_not_asked_for', async () => {
      const repo = freshRepo();

      // When
      await init(repo);

      // Then
      expect(existsSync(join(repo, 'greeter'))).toBe(false);
      expect(existsSync(join(repo, 'run.sh'))).toBe(false);
    });

    it.each<[string, readonly string[], string]>([
      [
        'the name param is missing',
        ['--skeleton'],
        '--param name is required: Lowercase app name, e.g. greeter',
      ],
      [
        'the name does not match the pattern',
        ['--skeleton', '--param', 'name=Greeter'],
        '--param name: "Greeter" does not match ^[a-z]+$',
      ],
      [
        'a param is unknown',
        ['--skeleton', '--param', 'name=greeter', '--param', 'colour=red'],
        'unknown param: colour',
      ],
      ['a param comes without skeleton', ['--param', 'name=greeter'], '--param needs --skeleton'],
    ])('Can_refuse_with_exit_2_and_write_nothing_when_%s', async (_, extra, message) => {
      const repo = freshRepo();

      // When
      const actual = await initWith(repo, extra);

      // Then
      expect(actual).toBe(2);
      expect(output.err).toHaveBeenCalledExactlyOnceWith(message);
      expect(readdirSync(repo)).toEqual(['.git']);
    });

    it('Can_refuse_with_exit_2_and_write_nothing_when_a_skeleton_file_exists', async () => {
      const repo = freshRepo();
      mkdirSync(join(repo, 'greeter'));
      writeFileSync(join(repo, 'greeter/hello.txt'), 'mine\n');
      commitAll(repo, 'own greeter');

      // When
      const actual = await initWith(repo, ['--skeleton', '--param', 'name=greeter']);

      // Then
      expect(actual).toBe(2);
      expect(output.err).toHaveBeenCalledExactlyOnceWith('skeleton file exists: greeter/hello.txt');
      expect(untracked(repo)).toEqual([]);
      expect(read(join(repo, 'greeter/hello.txt'))).toBe('mine\n');
    });

    it('Can_refuse_with_exit_2_when_the_pack_has_no_skeleton', async () => {
      const repo = freshRepo();
      const packsRoot = track(mkdtempSync(join(tmpdir(), 'packs-')));
      cpSync(fakePackDir, join(packsRoot, 'bare'), { recursive: true });
      rmSync(join(packsRoot, 'bare', 'skeleton'), { recursive: true });
      writeFileSync(
        join(packsRoot, 'bare', 'manifest.yaml'),
        'name: bare\nsealed: [a]\nnetwork: []\n',
      );

      // When
      const actual = await initWith(repo, ['--skeleton'], 'bare', packsRoot);

      // Then
      expect(actual).toBe(2);
      expect(output.err).toHaveBeenCalledExactlyOnceWith('pack bare has no skeleton');
      expect(readdirSync(repo)).toEqual(['.git']);
    });
  });

  it('Can_refuse_with_exit_2_when_factory_yaml_names_another_pack', async () => {
    const repo = tinyRepo();
    writeFileSync(join(repo, '.factory.yaml'), 'pack: java\n');
    commitAll(repo, 'own .factory.yaml');

    // When
    const actual = await init(repo);

    // Then
    expect(actual).toBe(2);
    expect(output.err).toHaveBeenCalledExactlyOnceWith('.factory.yaml names pack java, not fake');
    expect(git(repo, 'status', '--porcelain')).toBe('');
  });

  it('Can_report_the_problem_with_exit_2_when_factory_yaml_is_invalid', async () => {
    const repo = tinyRepo();
    writeFileSync(join(repo, '.factory.yaml'), 'pack: fake\nextra: 1\n');
    commitAll(repo, 'bad .factory.yaml');

    // When
    const actual = await init(repo);

    // Then
    expect(actual).toBe(2);
    expect(output.err).toHaveBeenCalledExactlyOnceWith('.factory.yaml: unknown key: extra');
  });
});
