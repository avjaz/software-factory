import { z } from 'zod';

import { parseMapping } from '../yaml/parse-mapping.js';
import { findHeadingSection, findNumberedSection } from './design-sections.js';
import type { DesignSection, Ticket } from './ticket.js';
import { TicketError } from './ticket-error.js';
import type { TicketFolder } from './ticket-folder.js';

const required = (expected: string) => (issue: { readonly input: unknown }) =>
  issue.input === undefined ? 'required' : expected;

const schema = z.strictObject({
  id: z
    .string({ error: required('must be a string') })
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'must be lowercase words joined by single hyphens'),
  title: z
    .string({ error: required('must be a string') })
    .trim()
    .min(1, 'must not be empty'),
  design: z
    .array(
      z
        .string({ error: 'must be a quoted section number' })
        .regex(/^\d+(\.\d+)*$/, 'must be a section number like 5 or 5.3'),
      { error: 'must be a list' },
    )
    .readonly()
    .optional(),
});

const headerBlock = /^---\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/;
const listItem = /^\s*(?:[-*+]|\d+[.)])[ \t]+\S/m;

export function parseTicket(
  folder: TicketFolder,
  text: string,
  designDoc: string | undefined,
): Ticket {
  const fail = (problem: string, options?: ErrorOptions): TicketError =>
    new TicketError(`invalid ticket ${folder.name}: ${problem}`, options);
  const block = headerBlock.exec(text);
  if (block === null) {
    throw fail('header: missing');
  }
  const header = parseMapping(block[1] ?? '', schema, fail);
  if (header.id !== folder.id) {
    throw fail(`id: "${header.id}" does not match folder ${folder.name}`);
  }
  const body = text.slice(block[0].length);
  checkBody(body, fail);
  return {
    folder: folder.name,
    number: folder.number,
    id: header.id,
    title: header.title,
    body,
    design: designSections(header.design ?? [], designDoc, fail),
  };
}

function checkBody(body: string, fail: (problem: string) => TicketError): void {
  if (body.trim() === '') {
    throw fail('body: must not be empty');
  }
  const criteria = findHeadingSection(body, 'Acceptance criteria');
  if (criteria === undefined) {
    throw fail('acceptance criteria: missing ## Acceptance criteria');
  }
  if (!listItem.test(criteria.body)) {
    throw fail('acceptance criteria: must list at least one item');
  }
}

function designSections(
  numbers: readonly string[],
  designDoc: string | undefined,
  fail: (problem: string) => TicketError,
): readonly DesignSection[] {
  if (numbers.length === 0) {
    return [];
  }
  if (designDoc === undefined) {
    throw fail('design: docs/design.md not found');
  }
  return numbers.map((number) => {
    const section = findNumberedSection(designDoc, number);
    if (section === undefined) {
      throw fail(`design: section ${number} not found in docs/design.md`);
    }
    if (section.body.trim() === '') {
      throw fail(`design: section ${number} has no text`);
    }
    return { number, text: `${section.heading}\n${section.body}`.trimEnd() };
  });
}
