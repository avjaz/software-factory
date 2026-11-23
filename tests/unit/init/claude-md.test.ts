import { describe, expect, it } from 'vitest';

import { importLine, withImportLine } from '../../../src/init/claude-md.js';
import { someString } from '../../support/data.js';

describe('withImportLine', () => {
  it('Can_create_a_file_with_only_the_import_line_when_there_is_none', () => {
    // When
    const actual = withImportLine(undefined);

    // Then
    expect(actual).toBe('@CLAUDE.factory.md\n');
    expect(importLine).toBe('@CLAUDE.factory.md');
  });

  it('Can_give_only_the_import_line_when_the_file_is_empty', () => {
    // When
    const actual = withImportLine('');

    // Then
    expect(actual).toBe(`${importLine}\n`);
  });

  it('Can_append_the_import_line_when_the_text_ends_with_a_newline', () => {
    const text = `# ${someString()}\n`;

    // When
    const actual = withImportLine(text);

    // Then
    expect(actual).toBe(`${text}${importLine}\n`);
  });

  it('Can_add_a_newline_first_when_the_text_does_not_end_with_one', () => {
    const text = `# ${someString()}`;

    // When
    const actual = withImportLine(text);

    // Then
    expect(actual).toBe(`${text}\n${importLine}\n`);
  });

  it.each([
    ['alone', `${importLine}\n`],
    ['in the middle', `# a\n${importLine}\nmore\n`],
    ['last without a newline', `# a\n${importLine}`],
    ['with CRLF endings', `# a\r\n${importLine}\r\n`],
  ])('Can_leave_the_text_unchanged_when_the_import_line_is_%s', (_, text) => {
    // When
    const actual = withImportLine(text);

    // Then
    expect(actual).toBe(text);
  });

  it('Can_append_the_import_line_when_it_only_appears_inside_another_line', () => {
    const text = `see ${importLine} for rules\n`;

    // When
    const actual = withImportLine(text);

    // Then
    expect(actual).toBe(`${text}${importLine}\n`);
  });
});
