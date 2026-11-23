import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { planSkeleton, writeSkeleton } from '../../../src/init/skeleton.js';
import type { Pack, SkeletonParam } from '../../../src/packs/pack-loader.js';
import { RefusalError } from '../../../src/refusal.js';
import { somePackName, someString } from '../../support/data.js';

describe('skeleton', () => {
  let repo: string;
  let packDir: string;
  let skeletonDir: string;
  let describe_: string;

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'skeleton-repo-'));
    packDir = mkdtempSync(join(tmpdir(), 'skeleton-pack-'));
    skeletonDir = join(packDir, 'skeleton');
    describe_ = someString();
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
    rmSync(packDir, { recursive: true, force: true });
  });

  function skeletonFile(path: string, text: string, mode = 0o644): void {
    const full = join(skeletonDir, path);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, text);
    chmodSync(full, mode);
  }

  function packWith(params: readonly SkeletonParam[]): Pack {
    return {
      name: somePackName(),
      dir: packDir,
      sealed: [someString()],
      network: [],
      skills: [],
      skeleton: { dir: skeletonDir, params },
    };
  }

  const nameParam = (): SkeletonParam => ({
    name: 'name',
    describe: describe_,
    pattern: '^[a-z]+$',
  });

  function read(path: string): string {
    return readFileSync(join(repo, path), 'utf8');
  }

  it('Can_replace_each_param_in_paths_and_text_when_the_skeleton_is_written', () => {
    skeletonFile('{{name}}/hello.txt', 'hi {{name}}, {{name}}\n');
    skeletonFile('top.txt', 'plain {{other}}\n');

    // When
    writeSkeleton(
      repo,
      planSkeleton(repo, packWith([nameParam()]), new Map([['name', 'greeter']])),
    );

    // Then
    expect(read('greeter/hello.txt')).toBe('hi greeter, greeter\n');
    expect(read('top.txt')).toBe('plain {{other}}\n');
  });

  it('Can_split_the_value_into_folders_in_paths_only_when_the_param_has_a_path_separator', () => {
    skeletonFile('src/{{space}}/Main.txt', 'space {{space}}\n');
    const space: SkeletonParam = {
      name: 'space',
      describe: describe_,
      pattern: '^[a-z.]+$',
      pathSeparator: '.',
    };

    // When
    const actual = planSkeleton(repo, packWith([space]), new Map([['space', 'a.b']]));

    // Then
    expect(actual.map((file) => [file.target, file.text])).toEqual([
      ['src/a/b/Main.txt', 'space a.b\n'],
    ]);
  });

  it('Can_keep_the_file_mode_when_a_skeleton_file_is_executable', () => {
    skeletonFile('run.sh', '#!/bin/sh\n', 0o755);
    skeletonFile('notes.txt', 'notes\n', 0o640);

    // When
    writeSkeleton(repo, planSkeleton(repo, packWith([]), new Map()));

    // Then
    expect(statSync(join(repo, 'run.sh')).mode & 0o777).toBe(0o755);
    expect(statSync(join(repo, 'notes.txt')).mode & 0o777).toBe(0o640);
  });

  it('Can_plan_the_files_in_path_order_when_the_skeleton_has_several', () => {
    skeletonFile('b.txt', '');
    skeletonFile('a/z.txt', '');
    skeletonFile('a.txt', '');

    // When
    const actual = planSkeleton(repo, packWith([]), new Map());

    // Then
    expect(actual.map((file) => file.target)).toEqual(['a.txt', 'a/z.txt', 'b.txt']);
  });

  it('Can_refuse_when_the_pack_has_no_skeleton', () => {
    const bare: Pack = { name: somePackName(), dir: packDir, sealed: [], network: [], skills: [] };

    // When
    const actual = () => planSkeleton(repo, bare, new Map());

    // Then
    expect(actual).toThrow(new RefusalError(`pack ${bare.name} has no skeleton`));
  });

  it.each<[string, ReadonlyMap<string, string>, string]>([
    [
      'a param is unknown',
      new Map([
        ['name', 'greeter'],
        ['colour', 'red'],
      ]),
      'unknown param: colour',
    ],
    ['a param is missing', new Map(), '--param name is required: DESCRIBE'],
    [
      'a value does not match the pattern',
      new Map([['name', 'Greeter']]),
      '--param name: "Greeter" does not match ^[a-z]+$',
    ],
  ])('Can_refuse_naming_the_param_when_%s', (_, values, message) => {
    skeletonFile('{{name}}/hello.txt', 'hi\n');

    // When
    const actual = () => planSkeleton(repo, packWith([nameParam()]), values);

    // Then
    expect(actual).toThrow(new RefusalError(message.replace('DESCRIBE', describe_)));
  });

  it('Can_refuse_naming_the_first_clash_when_a_skeleton_file_already_exists', () => {
    skeletonFile('a.txt', 'new\n');
    skeletonFile('{{name}}/hello.txt', 'new\n');
    mkdirSync(join(repo, 'greeter'));
    writeFileSync(join(repo, 'greeter', 'hello.txt'), 'mine\n');

    // When
    const actual = () =>
      planSkeleton(repo, packWith([nameParam()]), new Map([['name', 'greeter']]));

    // Then
    expect(actual).toThrow(new RefusalError('skeleton file exists: greeter/hello.txt'));
    expect(read('greeter/hello.txt')).toBe('mine\n');
  });
});
