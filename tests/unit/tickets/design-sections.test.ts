import { describe, expect, it } from 'vitest';

import { findHeadingSection, findNumberedSection } from '../../../src/tickets/design-sections.js';
import { someString } from '../../support/data.js';

describe('findNumberedSection', () => {
  it('Can_return_the_heading_and_body_when_the_number_has_a_trailing_dot', () => {
    const body = someString();

    // When
    const actual = findNumberedSection(
      `# Doc\n\n## 5. Packs\n\n${body}\n\n## 6. Run\n\nlater\n`,
      '5',
    );

    // Then
    expect(actual).toEqual({ heading: '## 5. Packs', body: `\n${body}\n` });
  });

  it('Can_match_a_subsection_number_without_a_trailing_dot', () => {
    const body = someString();

    // When
    const actual = findNumberedSection(
      `## 5. Packs\n\n### 5.3 Make\n${body}\n### 5.4 Next\n`,
      '5.3',
    );

    // Then
    expect(actual).toEqual({ heading: '### 5.3 Make', body });
  });

  it('Can_include_subsections_when_the_section_has_them', () => {
    // When
    const actual = findNumberedSection('## 7. Run\n### 7.1 Commands\ntext\n## 8. Worker\n', '7');

    // Then
    expect(actual).toEqual({ heading: '## 7. Run', body: '### 7.1 Commands\ntext' });
  });

  it('Can_run_to_the_end_of_the_doc_when_no_later_heading_closes_it', () => {
    // When
    const actual = findNumberedSection('## 2. Last\n\nend text\n', '2');

    // Then
    expect(actual).toEqual({ heading: '## 2. Last', body: '\nend text\n' });
  });

  it('Can_stop_at_a_higher_level_heading_when_one_follows', () => {
    // When
    const actual = findNumberedSection('### 5.3 Make\ntext\n# Appendix\nmore\n', '5.3');

    // Then
    expect(actual).toEqual({ heading: '### 5.3 Make', body: 'text' });
  });

  it.each([
    ['a longer number', '## 5.3 Make\ntext\n', '5'],
    ['a shorter number', '## 5. Packs\ntext\n', '5.3'],
    ['a number later in the heading', '## Section 5\ntext\n', '5'],
    ['no space after the hashes', '##5. Packs\ntext\n', '5'],
    ['a missing number', '## 1. One\ntext\n', '9'],
  ])('Can_return_undefined_when_the_only_heading_has_%s', (_, markdown, number) => {
    // When
    const actual = findNumberedSection(markdown, number);

    // Then
    expect(actual).toBeUndefined();
  });

  it.each([
    ['backticks', '```yaml\n# comment\n```'],
    ['tildes', '~~~\n# comment\n~~~'],
    ['a longer fence holding a shorter one', '````\n```\n# comment\n```\n````'],
  ])('Can_ignore_headings_inside_a_code_block_fenced_with_%s', (_, block) => {
    const markdown = `## 6. Packs\nbefore\n${block}\nafter\n## 7. Run\n`;

    // When
    const actual = findNumberedSection(markdown, '6');

    // Then
    expect(actual).toEqual({ heading: '## 6. Packs', body: `before\n${block}\nafter` });
  });

  it('Can_ignore_a_numbered_heading_when_it_is_inside_a_code_block', () => {
    // When
    const actual = findNumberedSection('```\n## 9. Fake\ntext\n```\n', '9');

    // Then
    expect(actual).toBeUndefined();
  });

  it('Can_ignore_a_shorter_closing_fence_when_the_block_opened_with_a_longer_one', () => {
    // When
    const actual = findNumberedSection('````\n```\n## 9. Fake\n````\n', '9');

    // Then
    expect(actual).toBeUndefined();
  });

  it('Can_find_the_section_when_the_doc_has_crlf_endings', () => {
    // When
    const actual = findNumberedSection('## 1. One\r\ntext\r\n## 2. Two\r\n', '1');

    // Then
    expect(actual).toEqual({ heading: '## 1. One', body: 'text' });
  });

  it('Can_give_an_empty_body_when_the_next_heading_follows_directly', () => {
    // When
    const actual = findNumberedSection('## 1. One\n## 2. Two\n', '1');

    // Then
    expect(actual).toEqual({ heading: '## 1. One', body: '' });
  });

  it('Can_return_the_first_match_when_a_number_appears_twice', () => {
    // When
    const actual = findNumberedSection('## 1. First\na\n## 1. Second\nb\n', '1');

    // Then
    expect(actual?.heading).toBe('## 1. First');
  });
});

describe('findHeadingSection', () => {
  it('Can_find_the_section_when_the_heading_text_matches_exactly', () => {
    // When
    const actual = findHeadingSection(
      '## What to build\nx\n## Acceptance criteria\n- a\n',
      'Acceptance criteria',
    );

    // Then
    expect(actual).toEqual({ heading: '## Acceptance criteria', body: '- a\n' });
  });

  it('Can_match_when_the_heading_has_trailing_spaces', () => {
    // When
    const actual = findHeadingSection('## Acceptance criteria  \n- a\n', 'Acceptance criteria');

    // Then
    expect(actual).toEqual({ heading: '## Acceptance criteria  ', body: '- a\n' });
  });

  it.each(['## Acceptance', '## Acceptance criteria and more', '```\n## Acceptance criteria\n```'])(
    'Can_return_undefined_when_the_doc_only_has_%j',
    (markdown) => {
      // When
      const actual = findHeadingSection(markdown, 'Acceptance criteria');

      // Then
      expect(actual).toBeUndefined();
    },
  );
});
