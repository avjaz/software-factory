import { describe, expect, it } from 'vitest';

import { PackError } from '../../../src/packs/pack-error.js';
import { parseManifest } from '../../../src/packs/pack-manifest.js';
import { someHostname, somePackName, someString } from '../../support/data.js';

function yamlOf(fields: Readonly<Record<string, unknown>>): string {
  return Object.entries(fields)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join('\n');
}

describe('parseManifest', () => {
  const folder = somePackName();
  const valid = {
    name: folder,
    sealed: [`${someString()}/**`, someString()],
    network: [someHostname()],
  };

  it('Can_parse_the_manifest_when_all_fields_are_valid', () => {
    // When
    const actual = parseManifest(yamlOf(valid), folder);

    // Then
    expect(actual).toEqual(valid);
  });

  it('Can_parse_the_manifest_when_network_is_empty', () => {
    // When
    const actual = parseManifest(yamlOf({ ...valid, network: [] }), folder);

    // Then
    expect(actual.network).toEqual([]);
  });

  it('Can_name_the_key_when_a_key_is_unknown', () => {
    const key = `x${someString()}`;

    // When
    const actual = () => parseManifest(yamlOf({ ...valid, [key]: someString() }), folder);

    // Then
    expect(actual).toThrow(PackError);
    expect(actual).toThrow(new RegExp(`^pack ${folder}: unknown key: ${key}$`));
  });

  it('Can_name_sealed_when_it_is_empty', () => {
    // When
    const actual = () => parseManifest(yamlOf({ ...valid, sealed: [] }), folder);

    // Then
    expect(actual).toThrow(new RegExp(`^pack ${folder}: sealed: must list at least one glob$`));
  });

  it('Can_name_the_glob_when_a_sealed_entry_is_blank', () => {
    // When
    const actual = () => parseManifest(yamlOf({ ...valid, sealed: [someString(), ''] }), folder);

    // Then
    expect(actual).toThrow(new RegExp(`^pack ${folder}: sealed\\.1: must not be empty$`));
  });

  it('Can_name_the_folder_mismatch_when_name_differs_from_the_folder', () => {
    const name = `x${somePackName()}`;

    // When
    const actual = () => parseManifest(yamlOf({ ...valid, name }), folder);

    // Then
    expect(actual).toThrow(
      new RegExp(`^pack ${folder}: name "${name}" does not match its folder$`),
    );
  });

  it('Can_name_the_host_when_a_network_entry_is_not_a_hostname', () => {
    // When
    const actual = () => parseManifest(yamlOf({ ...valid, network: ['not a host'] }), folder);

    // Then
    expect(actual).toThrow(new RegExp(`^pack ${folder}: network\\.0: not a hostname$`));
  });

  it.each(['name', 'sealed', 'network'])('Can_name_the_field_when_%s_is_missing', (field) => {
    const fields = Object.fromEntries(Object.entries(valid).filter(([key]) => key !== field));

    // When
    const actual = () => parseManifest(yamlOf(fields), folder);

    // Then
    expect(actual).toThrow(new RegExp(`^pack ${folder}: ${field}: `));
  });

  describe('skeleton', () => {
    const param = { name: 'name', describe: someString(), pattern: '^[a-z]+$' };

    function parseSkeleton(skeleton: unknown): () => unknown {
      return () => parseManifest(yamlOf({ ...valid, skeleton }), folder);
    }

    it('Can_parse_the_skeleton_params_when_they_are_valid', () => {
      const skeleton = { params: [param, { ...param, name: 'space', pathSeparator: '.' }] };

      // When
      const actual = parseSkeleton(skeleton)();

      // Then
      expect(actual).toEqual({ ...valid, skeleton });
    });

    it('Can_parse_the_manifest_without_a_skeleton_when_it_has_none', () => {
      // When
      const actual = parseManifest(yamlOf(valid), folder);

      // Then
      expect(actual).not.toHaveProperty('skeleton');
    });

    it.each<[string, unknown, string]>([
      ['the block has an unknown key', { params: [], extra: 1 }, 'unknown key: extra'],
      ['a param has an unknown key', { params: [{ ...param, extra: 1 }] }, 'unknown key: extra'],
      [
        'a param has no name',
        { params: [{ describe: param.describe, pattern: param.pattern }] },
        'skeleton.params.0.name: Invalid input: expected string, received undefined',
      ],
      [
        'a param name is not a lowercase word',
        { params: [{ ...param, name: 'Bad-name' }] },
        'skeleton.params.0.name: must be a lowercase word',
      ],
      [
        'a param has an empty describe',
        { params: [{ ...param, describe: '' }] },
        'skeleton.params.0.describe: must not be empty',
      ],
      [
        'a param pattern is not a regular expression',
        { params: [{ ...param, pattern: '[' }] },
        'skeleton.params.0.pattern: not a valid regular expression',
      ],
      [
        'a param has an empty path separator',
        { params: [{ ...param, pathSeparator: '' }] },
        'skeleton.params.0.pathSeparator: must not be empty',
      ],
    ])('Can_name_the_field_when_%s', (_, skeleton, problem) => {
      // When
      const actual = parseSkeleton(skeleton);

      // Then
      expect(actual).toThrow(new PackError(`pack ${folder}: ${problem}`));
    });
  });

  it('Can_fail_when_the_manifest_is_not_yaml', () => {
    // When
    const actual = () => parseManifest('name: [', folder);

    // Then
    expect(actual).toThrow(new RegExp(`^pack ${folder}: not valid YAML: `));
  });
});
