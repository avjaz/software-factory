import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ConfigError } from '../../../src/config/config-error.js';
import { loadConfig, parseConfig } from '../../../src/config/factory-config.js';
import { somePositiveInteger, someString } from '../../support/data.js';

function yamlOf(fields: Readonly<Record<string, unknown>>): string {
  return Object.entries(fields)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join('\n');
}

describe('parseConfig', () => {
  const valid = {
    model: someString(),
    maxAttempts: somePositiveInteger(),
    tailLines: somePositiveInteger(),
  };

  it('Can_parse_config_when_all_fields_are_valid', () => {
    // When
    const actual = parseConfig(yamlOf(valid));

    // Then
    expect(actual).toEqual(valid);
  });

  it.each([
    ['maxAttempts', { ...valid, maxAttempts: 0 }],
    ['tailLines', { ...valid, tailLines: 0 }],
    ['model', { maxAttempts: valid.maxAttempts, tailLines: valid.tailLines }],
    ['model', { ...valid, model: '' }],
  ])('Can_name_the_field_when_%s_is_invalid', (field, fields) => {
    // When
    const actual = () => parseConfig(yamlOf(fields));

    // Then
    expect(actual).toThrow(ConfigError);
    expect(actual).toThrow(new RegExp(`^factory config: ${field}: `));
  });

  it('Can_name_the_field_when_a_key_is_unknown', () => {
    const key = `x${someString()}`;

    // When
    const actual = () => parseConfig(yamlOf({ ...valid, [key]: someString() }));

    // Then
    expect(actual).toThrow(new RegExp(`^factory config: unknown key: ${key}$`));
  });

  it('Can_fail_when_the_text_is_not_yaml', () => {
    // When
    const actual = () => parseConfig('model: [');

    // Then
    expect(actual).toThrow(/^factory config: not valid YAML: /);
  });

  it('Can_fail_when_the_yaml_is_not_a_mapping', () => {
    // When
    const actual = () => parseConfig('- a');

    // Then
    expect(actual).toThrow(/^factory config: expected a mapping$/);
  });
});

describe('loadConfig', () => {
  it('Can_load_the_shipped_config_when_it_has_the_design_values', () => {
    // When
    const actual = loadConfig(join(import.meta.dirname, '..', '..', '..', 'factory.config.yaml'));

    // Then
    expect(actual).toEqual({ model: 'claude-opus-5-5', maxAttempts: 3, tailLines: 150 });
  });
});
