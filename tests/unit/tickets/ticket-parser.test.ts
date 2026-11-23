import { describe, expect, it } from 'vitest';

import type { TicketFolder } from '../../../src/tickets/ticket-folder.js';
import { TicketError } from '../../../src/tickets/ticket-error.js';
import { parseTicket } from '../../../src/tickets/ticket-parser.js';
import { someString, someTicketNumber } from '../../support/data.js';
import { type TicketSpec, ticketSpecFactory, ticketText } from '../../support/factories.js';

const designDoc =
  '# Design\n\n## 1. One\n\nFirst text.\n\n## 2. Two\n\n### 2.1 Sub\n\nSub text.\n\n## 3. Empty\n\n## 4. Four\n\nFour text.\n';

function folderFor(spec: TicketSpec): TicketFolder {
  const { id } = spec.header;
  const name = typeof id === 'string' ? id : someString();
  const number = someTicketNumber();
  return { name: `${number}-${name}`, number, id: name };
}

function failure(folder: TicketFolder, problem: string): RegExp {
  return new RegExp(`^invalid ticket ${folder.name}: ${problem}$`);
}

describe('parseTicket', () => {
  it('Can_parse_the_ticket_when_every_rule_holds', () => {
    const spec = ticketSpecFactory.build();
    const folder = folderFor(spec);

    // When
    const actual = parseTicket(folder, ticketText(spec), undefined);

    // Then
    expect(actual).toEqual({
      folder: folder.name,
      number: folder.number,
      id: folder.id,
      title: spec.header.title,
      body: `\n${spec.body}`,
      design: [],
    });
  });

  it('Can_carry_the_design_section_texts_in_order_when_design_names_sections', () => {
    const spec = ticketSpecFactory.build();
    const withDesign = { ...spec, header: { ...spec.header, design: ['4', '2.1', '2'] } };
    const folder = folderFor(withDesign);

    // When
    const actual = parseTicket(folder, ticketText(withDesign), designDoc);

    // Then
    expect(actual.design).toEqual([
      { number: '4', text: '## 4. Four\n\nFour text.' },
      { number: '2.1', text: '### 2.1 Sub\n\nSub text.' },
      { number: '2', text: '## 2. Two\n\n### 2.1 Sub\n\nSub text.' },
    ]);
  });

  it('Can_accept_an_empty_design_list_when_there_is_no_design_doc', () => {
    const spec = ticketSpecFactory.build();
    const withDesign = { ...spec, header: { ...spec.header, design: [] } };

    // When
    const actual = parseTicket(folderFor(withDesign), ticketText(withDesign), undefined);

    // Then
    expect(actual.design).toEqual([]);
  });

  it('Can_accept_ordered_and_star_list_items_when_they_are_the_criteria', () => {
    const spec = ticketSpecFactory.build({
      body: '## Acceptance criteria\n\n1. one\n* two\n+ three\n',
    });

    // When
    const actual = () => parseTicket(folderFor(spec), ticketText(spec), undefined);

    // Then
    expect(actual).not.toThrow();
  });

  it('Can_parse_the_ticket_when_it_has_crlf_endings', () => {
    const spec = ticketSpecFactory.build();
    const folder = folderFor(spec);

    // When
    const actual = parseTicket(folder, ticketText(spec).replaceAll('\n', '\r\n'), undefined);

    // Then
    expect(actual.id).toBe(folder.id);
  });

  describe('header', () => {
    it.each([
      ['id', 'id: required'],
      ['title', 'title: required'],
    ])('Can_name_the_field_when_%s_is_missing', (field, problem) => {
      const spec = ticketSpecFactory.build();
      const folder = folderFor(spec);
      const header = Object.fromEntries(
        Object.entries(spec.header).filter(([key]) => key !== field),
      );

      // When
      const actual = () => parseTicket(folder, ticketText({ ...spec, header }), undefined);

      // Then
      expect(actual).toThrow(TicketError);
      expect(actual).toThrow(failure(folder, problem));
    });

    it('Can_name_id_when_it_does_not_match_the_folder', () => {
      const spec = ticketSpecFactory.build({ header: { id: 'hello', title: someString() } });
      const folder: TicketFolder = { name: '01-greet', number: '01', id: 'greet' };

      // When
      const actual = () => parseTicket(folder, ticketText(spec), undefined);

      // Then
      expect(actual).toThrow(failure(folder, 'id: "hello" does not match folder 01-greet'));
    });

    it.each(['Greet', 'greet--me', '-greet', 'greet_me', 'greet-'])(
      'Can_name_id_when_it_is_%j',
      (id) => {
        const spec = ticketSpecFactory.build({ header: { id, title: someString() } });
        const folder: TicketFolder = { name: `01-${id}`, number: '01', id };

        // When
        const actual = () => parseTicket(folder, ticketText(spec), undefined);

        // Then
        expect(actual).toThrow(
          failure(folder, 'id: must be lowercase words joined by single hyphens'),
        );
      },
    );

    it.each([
      ['id', 7, 'id: must be a string'],
      ['title', '  ', 'title: must not be empty'],
      ['title', 7, 'title: must be a string'],
      ['design', '1', 'design: must be a list'],
      ['design', [1], 'design\\.0: must be a quoted section number'],
      ['design', ['1.'], 'design\\.0: must be a section number like 5 or 5\\.3'],
    ])('Can_name_%s_when_it_is_%j', (field, value, problem) => {
      const spec = ticketSpecFactory.build();
      const folder = folderFor(spec);
      const header = { ...spec.header, [field]: value };

      // When
      const actual = () => parseTicket(folder, ticketText({ ...spec, header }), designDoc);

      // Then
      expect(actual).toThrow(failure(folder, problem));
    });

    it('Can_name_the_key_when_a_header_key_is_unknown', () => {
      const spec = ticketSpecFactory.build();
      const folder = folderFor(spec);
      const header = { ...spec.header, owner: someString() };

      // When
      const actual = () => parseTicket(folder, ticketText({ ...spec, header }), undefined);

      // Then
      expect(actual).toThrow(failure(folder, 'unknown key: owner'));
    });

    it('Can_say_the_header_is_not_yaml_when_it_cannot_be_parsed', () => {
      const spec = ticketSpecFactory.build();
      const folder = folderFor(spec);

      // When
      const actual = () => parseTicket(folder, `---\nid: [\n---\n${spec.body}`, undefined);

      // Then
      expect(actual).toThrow(new RegExp(`^invalid ticket ${folder.name}: not valid YAML: `));
    });

    it.each([
      ['there is no header', (body: string) => body],
      ['the header is never closed', (body: string) => `---\nid: a\n${body}`],
      ['the header does not start the file', (body: string) => `\n---\nid: a\n---\n${body}`],
    ])('Can_say_the_header_is_missing_when_%s', (_, render) => {
      const spec = ticketSpecFactory.build();
      const folder = folderFor(spec);

      // When
      const actual = () => parseTicket(folder, render(spec.body), undefined);

      // Then
      expect(actual).toThrow(failure(folder, 'header: missing'));
    });

    it('Can_say_the_header_is_not_a_mapping_when_it_is_empty', () => {
      const spec = ticketSpecFactory.build();
      const folder = folderFor(spec);

      // When
      const actual = () => parseTicket(folder, `---\n---\n${spec.body}`, undefined);

      // Then
      expect(actual).toThrow(failure(folder, 'expected a mapping'));
    });
  });

  describe('body', () => {
    it.each(['', '\n  \n'])('Can_name_body_when_it_is_%j', (body) => {
      const spec = ticketSpecFactory.build({ body });
      const folder = folderFor(spec);

      // When
      const actual = () => parseTicket(folder, ticketText(spec), undefined);

      // Then
      expect(actual).toThrow(failure(folder, 'body: must not be empty'));
    });

    it('Can_name_acceptance_criteria_when_the_section_is_missing', () => {
      const spec = ticketSpecFactory.build({ body: `## What to build\n\n- ${someString()}\n` });
      const folder = folderFor(spec);

      // When
      const actual = () => parseTicket(folder, ticketText(spec), undefined);

      // Then
      expect(actual).toThrow(
        failure(folder, 'acceptance criteria: missing ## Acceptance criteria'),
      );
    });

    it.each([
      ['empty', '## Acceptance criteria\n\n## Notes\n- not a criterion\n'],
      ['prose only', `## Acceptance criteria\n\n${someString()}\n`],
      ['a bare marker', '## Acceptance criteria\n\n- \n'],
    ])('Can_name_acceptance_criteria_when_the_section_is_%s', (_, body) => {
      const spec = ticketSpecFactory.build({ body });
      const folder = folderFor(spec);

      // When
      const actual = () => parseTicket(folder, ticketText(spec), undefined);

      // Then
      expect(actual).toThrow(failure(folder, 'acceptance criteria: must list at least one item'));
    });
  });

  describe('design', () => {
    function withDesign(design: readonly string[]): TicketSpec {
      const spec = ticketSpecFactory.build();
      return { ...spec, header: { ...spec.header, design } };
    }

    it('Can_name_design_when_a_section_is_not_in_the_doc', () => {
      const spec = withDesign(['1', '9']);
      const folder = folderFor(spec);

      // When
      const actual = () => parseTicket(folder, ticketText(spec), designDoc);

      // Then
      expect(actual).toThrow(failure(folder, 'design: section 9 not found in docs/design.md'));
    });

    it('Can_name_design_when_a_section_has_a_heading_but_no_text', () => {
      const spec = withDesign(['3']);
      const folder = folderFor(spec);

      // When
      const actual = () => parseTicket(folder, ticketText(spec), designDoc);

      // Then
      expect(actual).toThrow(failure(folder, 'design: section 3 has no text'));
    });

    it('Can_name_design_when_the_repo_has_no_design_doc', () => {
      const spec = withDesign(['1']);
      const folder = folderFor(spec);

      // When
      const actual = () => parseTicket(folder, ticketText(spec), undefined);

      // Then
      expect(actual).toThrow(failure(folder, 'design: docs/design.md not found'));
    });
  });
});
