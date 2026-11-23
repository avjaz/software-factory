import { describe, expect, it } from 'vitest';

import { copiedTestsOf } from '../../../src/integrity/copied-tests.js';
import { someString, someTicketId } from '../../support/data.js';

describe('copiedTestsOf', () => {
  it('Can_pair_each_target_with_its_pending_folder_path_at_the_base', () => {
    const id = someTicketId();
    const folder = `03-${id}`;

    // When
    const actual = copiedTestsOf({
      dir: someString(),
      ticket: { folder, number: '03', id, title: someString(), body: someString(), design: [] },
      testFiles: [
        { source: someString(), target: 'acceptance/a.sh' },
        { source: someString(), target: 'src/test/b.ts' },
      ],
    });

    // Then
    expect(actual).toEqual([
      { target: 'acceptance/a.sh', pendingPath: `docs/tickets/pending/${folder}/acceptance/a.sh` },
      { target: 'src/test/b.ts', pendingPath: `docs/tickets/pending/${folder}/src/test/b.ts` },
    ]);
  });
});
