import { describe, expect, it } from 'vitest';

import { zip } from '../../../src/util/zip.js';
import { someString } from '../../support/data.js';

describe('zip', () => {
  it('Can_pair_values_in_order_when_both_lists_have_the_same_length', () => {
    const [a, b] = [someString(), someString()];

    // When
    const actual = zip([a, b], [1, 2]);

    // Then
    expect(actual).toEqual([
      [a, 1],
      [b, 2],
    ]);
  });

  it('Can_return_nothing_when_both_lists_are_empty', () => {
    // When
    const actual = zip([], []);

    // Then
    expect(actual).toEqual([]);
  });

  it.each([
    [['a', 'b'], [1], 'cannot zip 2 values with 1'],
    [['a'], [1, 2], 'cannot zip 1 values with 2'],
  ])('Can_throw_when_the_lengths_differ_like_%j_and_%j', (left, right, message) => {
    // When
    const actual = () => zip(left, right);

    // Then
    expect(actual).toThrow(new Error(message));
  });
});
