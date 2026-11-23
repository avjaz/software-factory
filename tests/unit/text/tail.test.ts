import { describe, expect, it } from 'vitest';

import { tail } from '../../../src/text/tail.js';

describe('tail', () => {
  it.each([
    ['more lines than asked', 'a\nb\nc\nd\n', 2, 'c\nd'],
    ['fewer lines than asked', 'a\nb\n', 5, 'a\nb'],
    ['no final newline', 'a\nb\nc', 2, 'b\nc'],
    ['blank lines inside', 'a\n\nb\n', 2, '\nb'],
    ['nothing at all', '', 3, ''],
    ['crlf endings', 'a\r\nb\r\nc\r\n', 2, 'b\nc'],
  ])('Can_return_the_last_lines_when_the_text_has_%s', (_, text, lines, expected) => {
    // When
    const actual = tail(text, lines);

    // Then
    expect(actual).toBe(expected);
  });
});
