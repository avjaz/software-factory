import { describe, expect, it } from 'vitest';

import { parseFolderName } from '../../../src/tickets/ticket-folder.js';
import { someTicketId, someTicketNumber } from '../../support/data.js';

describe('parseFolderName', () => {
  it('Can_split_the_number_and_id_when_the_name_is_nn_id', () => {
    const number = someTicketNumber();
    const id = someTicketId();

    // When
    const actual = parseFolderName(`${number}-${id}`);

    // Then
    expect(actual).toEqual({ name: `${number}-${id}`, number, id });
  });

  it.each(['greet', '1-greet', '001-greet', '01greet', '01-', 'ab-greet', ' 01-greet'])(
    'Can_return_undefined_when_the_name_is_%j',
    (name) => {
      // When
      const actual = parseFolderName(name);

      // Then
      expect(actual).toBeUndefined();
    },
  );
});
