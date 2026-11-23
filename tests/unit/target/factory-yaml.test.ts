import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FactoryYamlError } from '../../../src/target/factory-yaml-error.js';
import { parseFactoryYaml, readFactoryYaml } from '../../../src/target/factory-yaml.js';
import { somePackName, someString } from '../../support/data.js';

const q = (value: string): string => JSON.stringify(value);

describe('parseFactoryYaml', () => {
  it('Can_parse_the_pack_when_sealed_is_absent', () => {
    const pack = somePackName();

    // When
    const actual = parseFactoryYaml(`pack: ${q(pack)}`);

    // Then
    expect(actual).toEqual({ pack });
  });

  it('Can_parse_extra_sealed_globs_when_present', () => {
    const pack = somePackName();
    const sealed = [someString(), `${someString()}/**`];

    // When
    const actual = parseFactoryYaml(`pack: ${q(pack)}\nsealed: ${JSON.stringify(sealed)}`);

    // Then
    expect(actual).toEqual({ pack, sealed });
  });

  it('Can_name_pack_when_it_is_missing', () => {
    // When
    const actual = () => parseFactoryYaml('sealed: []');

    // Then
    expect(actual).toThrow(FactoryYamlError);
    expect(actual).toThrow(/^\.factory\.yaml: pack: /);
  });

  it('Can_name_pack_when_it_is_blank', () => {
    // When
    const actual = () => parseFactoryYaml("pack: ''");

    // Then
    expect(actual).toThrow(/^\.factory\.yaml: pack: must not be empty$/);
  });

  it('Can_name_the_glob_when_a_sealed_entry_is_blank', () => {
    // When
    const actual = () => parseFactoryYaml(`pack: ${q(somePackName())}\nsealed: ['']`);

    // Then
    expect(actual).toThrow(/^\.factory\.yaml: sealed\.0: must not be empty$/);
  });

  it('Can_name_sealed_when_it_is_not_a_list', () => {
    // When
    const actual = () => parseFactoryYaml(`pack: ${q(somePackName())}\nsealed: ${q(someString())}`);

    // Then
    expect(actual).toThrow(/^\.factory\.yaml: sealed: /);
  });

  it('Can_name_the_key_when_a_key_is_unknown', () => {
    const key = `x${someString()}`;

    // When
    const actual = () => parseFactoryYaml(`pack: ${q(somePackName())}\n${key}: 1`);

    // Then
    expect(actual).toThrow(new RegExp(`^\\.factory\\.yaml: unknown key: ${key}$`));
  });
});

describe('readFactoryYaml', () => {
  let repo: string;

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'repo-'));
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it('Can_return_undefined_when_the_repo_has_no_factory_yaml', () => {
    // When
    const actual = readFactoryYaml(repo);

    // Then
    expect(actual).toBeUndefined();
  });

  it('Can_read_the_file_when_the_repo_has_one', () => {
    const pack = somePackName();
    writeFileSync(join(repo, '.factory.yaml'), `pack: ${q(pack)}\n`);

    // When
    const actual = readFactoryYaml(repo);

    // Then
    expect(actual).toEqual({ pack });
  });
});
