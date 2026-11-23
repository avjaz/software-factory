import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { parseMapping } from '../../../src/yaml/parse-mapping.js';
import { someString } from '../../support/data.js';

class TestError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(`test: ${message}`, options);
    this.name = 'TestError';
  }
}

const fail = (message: string, options?: ErrorOptions): Error => new TestError(message, options);

const schema = z.strictObject({ name: z.string().min(1, 'must not be empty') });

describe('parseMapping', () => {
  it('Can_return_the_parsed_mapping_when_it_matches_the_schema', () => {
    const name = someString();

    // When
    const actual = parseMapping(`name: ${JSON.stringify(name)}`, schema, fail);

    // Then
    expect(actual).toEqual({ name });
  });

  it('Can_fail_with_the_injected_error_when_the_text_is_not_yaml', () => {
    // When
    const actual = () => parseMapping('name: [', schema, fail);

    // Then
    expect(actual).toThrow(TestError);
    expect(actual).toThrow(/^test: not valid YAML: /);
  });

  it('Can_chain_the_yaml_error_as_cause_when_the_text_is_not_yaml', () => {
    // When
    const actual = (): unknown => {
      try {
        return parseMapping('name: [', schema, fail);
      } catch (e) {
        return e;
      }
    };

    // Then
    expect(actual()).toHaveProperty('cause', expect.any(Error));
  });

  it.each(['- a', 'just text', ''])('Can_fail_when_the_yaml_%j_is_not_a_mapping', (text) => {
    // When
    const actual = () => parseMapping(text, schema, fail);

    // Then
    expect(actual).toThrow(/^test: expected a mapping$/);
  });

  it('Can_name_the_unknown_key_when_one_is_present', () => {
    const key = `x${someString()}`;

    // When
    const actual = () => parseMapping(`name: a\n${key}: b`, schema, fail);

    // Then
    expect(actual).toThrow(new RegExp(`^test: unknown key: ${key}$`));
  });

  it('Can_name_the_field_path_and_message_when_a_field_is_invalid', () => {
    // When
    const actual = () => parseMapping("name: ''", schema, fail);

    // Then
    expect(actual).toThrow(/^test: name: must not be empty$/);
  });

  it('Can_join_every_problem_when_several_fields_are_invalid', () => {
    const nested = z.strictObject({ a: z.string(), b: z.array(z.int()) });

    // When
    const actual = () => parseMapping('a: 1\nb: [1, x]', nested, fail);

    // Then
    expect(actual).toThrow(/^test: a: [^;]+; b\.1: [^;]+$/);
  });
});
