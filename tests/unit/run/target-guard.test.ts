import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import type { Git } from '../../../src/git/git.js';
import { PackError } from '../../../src/packs/pack-error.js';
import type { Pack, PackLoader } from '../../../src/packs/pack-loader.js';
import { RefusalError } from '../../../src/refusal.js';
import { TargetGuard } from '../../../src/run/target-guard.js';
import { FactoryYamlError } from '../../../src/target/factory-yaml-error.js';
import { somePackName, someString } from '../../support/data.js';

describe('TargetGuard', () => {
  let git: MockProxy<Git>;
  let packs: MockProxy<PackLoader>;
  let subject: TargetGuard;
  let repo: string;
  let pack: Pack;

  beforeEach(() => {
    git = mock<Git>();
    packs = mock<PackLoader>();
    subject = new TargetGuard(git, packs);
    repo = mkdtempSync(join(tmpdir(), 'guard-'));
    pack = {
      name: somePackName(),
      dir: someString(),
      sealed: [someString()],
      network: [],
      skills: [],
    };
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  function givenFactoryYaml(text: string): void {
    writeFileSync(join(repo, '.factory.yaml'), text);
  }

  it('Can_return_the_settings_and_pack_when_the_repo_joins_a_known_pack', () => {
    // Given
    const extra = someString();
    git.isTopLevel.mockReturnValue(true);
    packs.load.mockReturnValue(pack);
    givenFactoryYaml(`pack: ${JSON.stringify(pack.name)}\nsealed: [${JSON.stringify(extra)}]\n`);

    // When
    const actual = subject.check(repo);

    // Then
    expect(actual).toEqual({ settings: { pack: pack.name, sealed: [extra] }, pack });
    expect(git.isTopLevel).toHaveBeenCalledExactlyOnceWith(repo);
    expect(packs.load).toHaveBeenCalledExactlyOnceWith(pack.name);
  });

  it('Can_refuse_without_reading_settings_when_the_dir_is_not_a_repo_root', () => {
    // Given
    git.isTopLevel.mockReturnValue(false);
    givenFactoryYaml(`pack: ${JSON.stringify(pack.name)}\n`);

    // When
    const actual = () => subject.check(repo);

    // Then
    expect(actual).toThrow(new RefusalError('not a git repo'));
    expect(packs.load).not.toHaveBeenCalled();
  });

  it('Can_refuse_without_loading_a_pack_when_there_is_no_factory_yaml', () => {
    // Given
    git.isTopLevel.mockReturnValue(true);

    // When
    const actual = () => subject.check(repo);

    // Then
    expect(actual).toThrow(new RefusalError('no .factory.yaml'));
    expect(packs.load).not.toHaveBeenCalled();
  });

  it('Can_pass_the_error_through_when_factory_yaml_is_invalid', () => {
    // Given
    git.isTopLevel.mockReturnValue(true);
    givenFactoryYaml(`x${someString()}: 1\n`);

    // When
    const actual = () => subject.check(repo);

    // Then
    expect(actual).toThrow(FactoryYamlError);
    expect(packs.load).not.toHaveBeenCalled();
  });

  it('Can_pass_the_pack_error_through_when_the_pack_is_unknown', () => {
    // Given
    const error = new PackError(`unknown pack: ${pack.name}`);
    git.isTopLevel.mockReturnValue(true);
    givenFactoryYaml(`pack: ${JSON.stringify(pack.name)}\n`);
    packs.load.mockImplementation(() => {
      throw error;
    });

    // When
    const actual = () => subject.check(repo);

    // Then
    expect(actual).toThrow(error);
  });
});
