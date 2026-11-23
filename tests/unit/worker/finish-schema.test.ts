import { describe, expect, it } from 'vitest';

import { finishJsonSchema, parseFinish } from '../../../src/worker/finish-schema.js';
import { someString } from '../../support/data.js';

describe('finish schema', () => {
  it.each(['done', 'spec_defect'] as const)('Can_parse_a_%s_result', (status) => {
    const result = { status, summary: someString(), evidence: someString() };

    // When
    const actual = parseFinish(result);

    // Then
    expect(actual).toEqual(result);
  });

  it.each([
    ['an unknown status', { status: 'finished', summary: 'x', evidence: '' }],
    ['a missing summary', { status: 'done', evidence: '' }],
    ['an extra key', { status: 'done', summary: 'x', evidence: '', extra: 1 }],
    ['no object', undefined],
  ])('Can_reject_%s', (_, value) => {
    // When
    const actual = parseFinish(value);

    // Then
    expect(actual).toBeUndefined();
  });

  it('Can_describe_the_result_as_draft_7_json_schema_with_every_field_required', () => {
    // Then
    expect(finishJsonSchema).toMatchObject({
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      required: ['status', 'summary', 'evidence'],
      additionalProperties: false,
      properties: { status: { enum: ['done', 'spec_defect'] } },
    });
  });
});
