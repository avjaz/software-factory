import { describe, expect, it } from 'vitest';

import { parseParams } from '../../../src/cli/params.js';
import { RefusalError } from '../../../src/refusal.js';

describe('parseParams', () => {
  it('Can_return_no_params_when_none_are_given', () => {
    // When
    const actual = parseParams(undefined);

    // Then
    expect(actual).toEqual(new Map());
  });

  it('Can_split_each_param_at_the_first_equals_sign_when_params_are_given', () => {
    // When
    const actual = parseParams(['name=greeter', 'query=a=b', 'empty=']);

    // Then
    expect(actual).toEqual(
      new Map([
        ['name', 'greeter'],
        ['query', 'a=b'],
        ['empty', ''],
      ]),
    );
  });

  it.each<[string, readonly (string | boolean)[], string]>([
    ['a param has no equals sign', ['name'], '--param must be name=value: name'],
    ['a param has no name', ['=greeter'], '--param must be name=value: =greeter'],
    ['a param has no value at all', [true], '--param must be name=value: true'],
    ['a param is given twice', ['name=a', 'name=b'], '--param name given twice'],
  ])('Can_refuse_when_%s', (_, raw, message) => {
    // When
    const actual = () => parseParams(raw);

    // Then
    expect(actual).toThrow(new RefusalError(message));
  });
});
