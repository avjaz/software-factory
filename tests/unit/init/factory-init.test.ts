import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import type { Git } from '../../../src/git/git.js';
import { FactoryInit } from '../../../src/init/factory-init.js';
import { PackError } from '../../../src/packs/pack-error.js';
import type { Pack, PackLoader } from '../../../src/packs/pack-loader.js';
import { RefusalError } from '../../../src/refusal.js';
import { FactoryYamlError } from '../../../src/target/factory-yaml-error.js';
import { parseFactoryYaml } from '../../../src/target/factory-yaml.js';
import { somePackName, someString } from '../../support/data.js';

const q = (value: string): string => JSON.stringify(value);

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('FactoryInit', () => {
  let git: MockProxy<Git>;
  let packs: MockProxy<PackLoader>;
  let subject: FactoryInit;
  let pack: Pack;
  let repo: string;
  let packDir: string;

  beforeEach(() => {
    git = mock<Git>();
    packs = mock<PackLoader>();
    subject = new FactoryInit(git, packs);

    repo = mkdtempSync(join(tmpdir(), 'init-repo-'));
    packDir = mkdtempSync(join(tmpdir(), 'init-pack-'));
    const skill = someString();
    writeFileSync(join(packDir, 'Makefile'), someString());
    writeFileSync(join(packDir, 'CLAUDE.factory.md'), someString());
    mkdirSync(join(packDir, 'skills', skill, 'references'), { recursive: true });
    writeFileSync(join(packDir, 'skills', skill, 'SKILL.md'), someString());
    writeFileSync(join(packDir, 'skills', skill, 'references', 'a.md'), someString());
    pack = {
      name: somePackName(),
      dir: packDir,
      sealed: [someString()],
      network: [],
      skills: [skill],
    };
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
    rmSync(packDir, { recursive: true, force: true });
  });

  function givenReadyRepo(): void {
    git.isTopLevel.mockReturnValue(true);
    git.isClean.mockReturnValue(true);
    packs.load.mockReturnValue(pack);
  }

  function skill(): string {
    const [name] = pack.skills;
    if (name === undefined) {
      throw new Error('test pack has no skill');
    }
    return name;
  }

  it('Can_refuse_without_checking_further_when_the_dir_is_not_a_repo_root', () => {
    // Given
    git.isTopLevel.mockReturnValue(false);

    // When
    const actual = () => {
      subject.run(repo, pack.name);
    };

    // Then
    expect(actual).toThrow(RefusalError);
    expect(actual).toThrow(/^not a git repo$/);
    expect(git.isTopLevel).toHaveBeenCalledWith(repo);
    expect(git.isClean).not.toHaveBeenCalled();
    expect(packs.load).not.toHaveBeenCalled();
  });

  it('Can_refuse_without_loading_the_pack_when_the_tree_is_dirty', () => {
    // Given
    git.isTopLevel.mockReturnValue(true);
    git.isClean.mockReturnValue(false);

    // When
    const actual = () => {
      subject.run(repo, pack.name);
    };

    // Then
    expect(actual).toThrow(new RefusalError('working tree is dirty'));
    expect(git.isClean).toHaveBeenCalledWith(repo);
    expect(packs.load).not.toHaveBeenCalled();
  });

  it('Can_pass_the_pack_error_through_and_write_nothing_when_the_pack_fails_to_load', () => {
    // Given
    const error = new PackError(`unknown pack: ${pack.name}`);
    git.isTopLevel.mockReturnValue(true);
    git.isClean.mockReturnValue(true);
    packs.load.mockImplementation(() => {
      throw error;
    });

    // When
    const actual = () => {
      subject.run(repo, pack.name);
    };

    // Then
    expect(actual).toThrow(error);
    expect(packs.load).toHaveBeenCalledWith(pack.name);
    expect(readdirSync(repo)).toEqual([]);
  });

  it('Can_copy_the_pack_files_and_write_the_repo_files_when_the_repo_is_new', () => {
    // Given
    givenReadyRepo();

    // When
    subject.run(repo, pack.name);

    // Then
    expect(readFileSync(join(repo, 'Makefile'))).toEqual(readFileSync(join(packDir, 'Makefile')));
    expect(read(join(repo, 'CLAUDE.factory.md'))).toBe(read(join(packDir, 'CLAUDE.factory.md')));
    expect(read(join(repo, '.claude', 'skills', skill(), 'SKILL.md'))).toBe(
      read(join(packDir, 'skills', skill(), 'SKILL.md')),
    );
    expect(read(join(repo, '.claude', 'skills', skill(), 'references', 'a.md'))).toBe(
      read(join(packDir, 'skills', skill(), 'references', 'a.md')),
    );
    expect(parseFactoryYaml(read(join(repo, '.factory.yaml')))).toEqual({ pack: pack.name });
    expect(read(join(repo, 'CLAUDE.md'))).toBe('@CLAUDE.factory.md\n');
  });

  describe('skeleton', () => {
    let skeletonPack: Pack;

    beforeEach(() => {
      const skeletonDir = join(packDir, 'skeleton');
      mkdirSync(join(skeletonDir, '{{name}}'), { recursive: true });
      writeFileSync(join(skeletonDir, '{{name}}', 'hello.txt'), 'hi {{name}}\n');
      skeletonPack = {
        ...pack,
        skeleton: {
          dir: skeletonDir,
          params: [{ name: 'name', describe: someString(), pattern: '^[a-z]+$' }],
        },
      };
      git.isTopLevel.mockReturnValue(true);
      git.isClean.mockReturnValue(true);
      packs.load.mockReturnValue(skeletonPack);
    });

    it('Can_write_the_skeleton_with_the_pack_files_when_skeleton_values_are_given', () => {
      // When
      subject.run(repo, pack.name, new Map([['name', 'greeter']]));

      // Then
      expect(read(join(repo, 'greeter', 'hello.txt'))).toBe('hi greeter\n');
      expect(read(join(repo, 'CLAUDE.md'))).toBe('@CLAUDE.factory.md\n');
      expect(existsSync(join(repo, 'Makefile'))).toBe(true);
    });

    it('Can_leave_the_skeleton_out_when_no_skeleton_values_are_given', () => {
      // When
      subject.run(repo, pack.name);

      // Then
      expect(existsSync(join(repo, 'greeter'))).toBe(false);
      expect(existsSync(join(repo, 'Makefile'))).toBe(true);
    });

    it('Can_refuse_and_write_nothing_when_the_skeleton_values_are_wrong', () => {
      // When
      const actual = () => {
        subject.run(repo, pack.name, new Map([['name', 'Greeter']]));
      };

      // Then
      expect(actual).toThrow(RefusalError);
      expect(readdirSync(repo)).toEqual([]);
    });
  });

  it.each(['true', 'null', '123'])(
    'Can_write_a_factory_yaml_that_reads_back_as_the_pack_when_the_name_is_%s',
    (name) => {
      // Given
      givenReadyRepo();
      packs.load.mockReturnValue({ ...pack, name });

      // When
      subject.run(repo, name);

      // Then
      expect(parseFactoryYaml(read(join(repo, '.factory.yaml')))).toEqual({ pack: name });
    },
  );

  it('Can_append_the_import_line_once_when_claude_md_exists_without_it', () => {
    // Given
    givenReadyRepo();
    const existing = `# ${someString()}\n`;
    writeFileSync(join(repo, 'CLAUDE.md'), existing);

    // When
    subject.run(repo, pack.name);
    subject.run(repo, pack.name);

    // Then
    expect(read(join(repo, 'CLAUDE.md'))).toBe(`${existing}@CLAUDE.factory.md\n`);
  });

  it('Can_keep_an_existing_factory_yaml_unchanged_when_it_names_the_same_pack', () => {
    // Given
    givenReadyRepo();
    const existing = `pack: ${q(pack.name)}\nsealed:\n  - ${q(someString())}\n`;
    writeFileSync(join(repo, '.factory.yaml'), existing);

    // When
    subject.run(repo, pack.name);

    // Then
    expect(read(join(repo, '.factory.yaml'))).toBe(existing);
  });

  it('Can_refuse_and_write_nothing_when_factory_yaml_names_another_pack', () => {
    // Given
    givenReadyRepo();
    const other = `x${somePackName()}`;
    writeFileSync(join(repo, '.factory.yaml'), `pack: ${q(other)}\n`);

    // When
    const actual = () => {
      subject.run(repo, pack.name);
    };

    // Then
    expect(actual).toThrow(new RefusalError(`.factory.yaml names pack ${other}, not ${pack.name}`));
    expect(readdirSync(repo)).toEqual(['.factory.yaml']);
  });

  it('Can_pass_the_error_through_and_write_nothing_when_factory_yaml_is_invalid', () => {
    // Given
    givenReadyRepo();
    writeFileSync(join(repo, '.factory.yaml'), `pack: ${q(pack.name)}\nx${someString()}: 1\n`);

    // When
    const actual = () => {
      subject.run(repo, pack.name);
    };

    // Then
    expect(actual).toThrow(FactoryYamlError);
    expect(readdirSync(repo)).toEqual(['.factory.yaml']);
  });

  it('Can_restore_the_pack_files_exactly_when_they_were_edited_or_extended', () => {
    // Given
    givenReadyRepo();
    subject.run(repo, pack.name);
    writeFileSync(join(repo, 'Makefile'), someString());
    writeFileSync(join(repo, 'CLAUDE.factory.md'), someString());
    writeFileSync(join(repo, '.claude', 'skills', skill(), 'stale.md'), someString());

    // When
    subject.run(repo, pack.name);

    // Then
    expect(read(join(repo, 'Makefile'))).toBe(read(join(packDir, 'Makefile')));
    expect(read(join(repo, 'CLAUDE.factory.md'))).toBe(read(join(packDir, 'CLAUDE.factory.md')));
    expect(existsSync(join(repo, '.claude', 'skills', skill(), 'stale.md'))).toBe(false);
  });

  it('Can_leave_other_skills_alone_when_the_repo_has_its_own', () => {
    // Given
    givenReadyRepo();
    const own = join(repo, '.claude', 'skills', `own-${someString()}`, 'SKILL.md');
    const content = someString();
    mkdirSync(join(own, '..'), { recursive: true });
    writeFileSync(own, content);

    // When
    subject.run(repo, pack.name);

    // Then
    expect(read(own)).toBe(content);
  });

  it('Can_copy_no_skills_when_the_pack_has_none', () => {
    // Given
    givenReadyRepo();
    packs.load.mockReturnValue({ ...pack, skills: [] });

    // When
    subject.run(repo, pack.name);

    // Then
    expect(existsSync(join(repo, '.claude'))).toBe(false);
    expect(existsSync(join(repo, 'Makefile'))).toBe(true);
  });
});
