import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PackError } from '../../../src/packs/pack-error.js';
import { loadPack } from '../../../src/packs/pack-loader.js';
import { somePackName, someString } from '../../support/data.js';
import { fakePackDir, fixturePacksRoot } from '../../support/tiny-repo.js';

describe('loadPack', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'packs-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function copyFake(name: string): string {
    const dir = join(root, name);
    cpSync(fakePackDir, dir, { recursive: true });
    writeFileSync(
      join(dir, 'manifest.yaml'),
      `name: ${JSON.stringify(name)}\nsealed: [a/**]\nnetwork: []\n`,
    );
    return dir;
  }

  it('Can_load_the_fake_pack_when_given_the_fixture_root', () => {
    // When
    const actual = loadPack(fixturePacksRoot, 'fake');

    // Then
    expect(actual).toEqual({
      name: 'fake',
      dir: fakePackDir,
      sealed: ['acceptance/**', 'docs/tickets/**', 'Makefile', '.factory.yaml'],
      network: [],
      skills: ['fake-standards'],
      skeleton: {
        dir: join(fakePackDir, 'skeleton'),
        params: [
          { name: 'name', describe: 'Lowercase app name, e.g. greeter', pattern: '^[a-z]+$' },
        ],
      },
    });
  });

  it('Can_load_a_skeleton_with_no_params_when_the_manifest_declares_none', () => {
    const name = somePackName();
    const dir = copyFake(name);

    // When
    const actual = loadPack(root, name);

    // Then
    expect(actual.skeleton).toEqual({ dir: join(dir, 'skeleton'), params: [] });
  });

  it('Can_load_no_skeleton_when_the_pack_has_no_skeleton_folder', () => {
    const name = somePackName();
    rmSync(join(copyFake(name), 'skeleton'), { recursive: true });

    // When
    const actual = loadPack(root, name);

    // Then
    expect(actual).not.toHaveProperty('skeleton');
  });

  it('Can_report_the_missing_folder_when_the_manifest_declares_a_skeleton_without_one', () => {
    const name = somePackName();
    const dir = copyFake(name);
    rmSync(join(dir, 'skeleton'), { recursive: true });
    writeFileSync(
      join(dir, 'manifest.yaml'),
      `name: ${JSON.stringify(name)}\nsealed: [a/**]\nnetwork: []\nskeleton:\n  params: []\n`,
    );

    // When
    const actual = () => loadPack(root, name);

    // Then
    expect(actual).toThrow(new PackError(`pack ${name}: skeleton: no skeleton folder`));
  });

  it('Can_list_skills_in_name_order_when_the_pack_has_several', () => {
    const name = somePackName();
    const dir = copyFake(name);
    mkdirSync(join(dir, 'skills', 'a-skill'));
    writeFileSync(join(dir, 'skills', 'not-a-skill.md'), someString());

    // When
    const actual = loadPack(root, name);

    // Then
    expect(actual.skills).toEqual(['a-skill', 'fake-standards']);
  });

  it('Can_list_no_skills_when_the_pack_has_no_skills_folder', () => {
    const name = somePackName();
    rmSync(join(copyFake(name), 'skills'), { recursive: true });

    // When
    const actual = loadPack(root, name);

    // Then
    expect(actual.skills).toEqual([]);
  });

  it('Can_report_unknown_pack_when_the_folder_is_missing', () => {
    const name = somePackName();

    // When
    const actual = () => loadPack(root, name);

    // Then
    expect(actual).toThrow(PackError);
    expect(actual).toThrow(new RegExp(`^unknown pack: ${name}$`));
  });

  it('Can_report_unknown_pack_when_the_packs_root_is_missing', () => {
    // When
    const actual = () => loadPack(join(root, someString()), 'fake');

    // Then
    expect(actual).toThrow(/^unknown pack: fake$/);
  });

  it.each(['../fake', 'fake/', 'Fake', '', '-fake', '.'])(
    'Can_report_unknown_pack_when_the_name_%j_is_not_a_pack_name',
    (name) => {
      // When
      const actual = () => loadPack(fixturePacksRoot, name);

      // Then
      expect(actual).toThrow(new PackError(`unknown pack: ${name}`));
    },
  );

  it('Can_report_unknown_pack_when_the_name_is_a_file', () => {
    const name = somePackName();
    writeFileSync(join(root, name), someString());

    // When
    const actual = () => loadPack(root, name);

    // Then
    expect(actual).toThrow(new RegExp(`^unknown pack: ${name}$`));
  });

  it.each(['manifest.yaml', 'Makefile', 'CLAUDE.factory.md'])(
    'Can_name_the_missing_file_when_%s_is_absent',
    (file) => {
      const name = somePackName();
      rmSync(join(copyFake(name), file));

      // When
      const actual = () => loadPack(root, name);

      // Then
      expect(actual).toThrow(new PackError(`pack ${name}: missing ${file}`));
    },
  );

  it('Can_name_the_missing_file_when_makefile_is_a_folder', () => {
    const name = somePackName();
    const dir = copyFake(name);
    rmSync(join(dir, 'Makefile'));
    mkdirSync(join(dir, 'Makefile'));

    // When
    const actual = () => loadPack(root, name);

    // Then
    expect(actual).toThrow(new RegExp(`^pack ${name}: missing Makefile$`));
  });

  it('Can_surface_the_manifest_problem_when_the_manifest_is_invalid', () => {
    const name = somePackName();
    writeFileSync(
      join(copyFake(name), 'manifest.yaml'),
      `name: ${JSON.stringify(name)}\nsealed: []\nnetwork: []\n`,
    );

    // When
    const actual = () => loadPack(root, name);

    // Then
    expect(actual).toThrow(new RegExp(`^pack ${name}: sealed: must list at least one glob$`));
  });
});
