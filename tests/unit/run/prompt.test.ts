import { describe, expect, it } from 'vitest';

import { buildFirstPrompt } from '../../../src/run/prompt.js';
import type { Ticket } from '../../../src/tickets/ticket.js';
import { someString, someTicketId } from '../../support/data.js';

function someTicket(overrides: Partial<Ticket> = {}): Ticket {
  const id = someTicketId();
  return {
    folder: `01-${id}`,
    number: '01',
    id,
    title: someString(),
    body: `\n## What to build\n\n${someString()}\n\n## Acceptance criteria\n\n- ${someString()}\n`,
    design: [],
    ...overrides,
  };
}

describe('buildFirstPrompt', () => {
  it('Can_lay_out_the_five_parts_in_order_when_the_ticket_names_design_sections', () => {
    const ticket = someTicket({
      title: 'Add the greeting file',
      folder: '01-greet',
      body: '\n## What to build\n\nThe file.\n\n## Acceptance criteria\n\n- it greets\n',
      design: [
        { number: '2', text: '## 2. Farewells\n\nBye.' },
        { number: '1', text: '## 1. Greetings\n\nHello.' },
      ],
    });

    // When
    const actual = buildFirstPrompt(ticket, ['acceptance/greet.sh', 'acceptance/helper.sh']);

    // Then
    expect(actual).toBe(
      [
        '# Ticket 01-greet: Add the greeting file',
        '',
        '## Rules',
        '',
        '- Make the acceptance tests listed below pass.',
        '- Work test-first: add or extend unit tests, then write the code. Run `make unit` as you go.',
        '- Run `make unit` as a Bash command on its own, never chained with other commands: it is the only build command you may run. Create and change files with Write and Edit, not with shell commands.',
        '- Never edit sealed paths: the ticket, the acceptance tests, the Makefile, `.factory.yaml`, any `.gitignore`, and every other path your rules name as sealed.',
        '- If a sealed test or the ticket itself is wrong, do not work around it: finish with `spec_defect` and say why.',
        '- Leave the ticket where it is: on green the factory moves it to `docs/tickets/done/` and commits.',
        '- When you finish, the factory runs `make verify` on the whole repo. If it fails, you get its output and another turn.',
        '',
        '## Ticket',
        '',
        '## What to build',
        '',
        'The file.',
        '',
        '## Acceptance criteria',
        '',
        '- it greets',
        '',
        '## Design sections',
        '',
        '## 2. Farewells',
        '',
        'Bye.',
        '',
        '## 1. Greetings',
        '',
        'Hello.',
        '',
        '## Acceptance tests added by this ticket',
        '',
        '- `acceptance/greet.sh`',
        '- `acceptance/helper.sh`',
        '',
        '## How to finish',
        '',
        'End your turn with the structured result:',
        '',
        '```json',
        '{ "status": "done" | "spec_defect", "summary": "…", "evidence": "…" }',
        '```',
        '',
        '- `done` means ready for verification, not finished: the factory decides with `make verify`.',
        '- `spec_defect` needs `evidence`: which test or ticket line is wrong, and why.',
        '',
      ].join('\n'),
    );
  });

  it('Can_tell_the_worker_to_run_make_unit_on_its_own_and_write_files_with_the_file_tools', () => {
    // When
    const actual = buildFirstPrompt(someTicket(), []);

    // Then
    expect(actual).toContain(
      '- Run `make unit` as a Bash command on its own, never chained with other commands: it is the only build command you may run. Create and change files with Write and Edit, not with shell commands.\n',
    );
  });

  it('Can_say_none_when_the_ticket_names_no_design_sections', () => {
    // When
    const actual = buildFirstPrompt(someTicket(), ['acceptance/a.sh']);

    // Then
    expect(actual).toContain(
      '## Design sections\n\nNone named by this ticket.\n\n## Acceptance tests',
    );
  });

  it('Can_say_none_when_the_ticket_adds_no_test_files', () => {
    // When
    const actual = buildFirstPrompt(someTicket(), []);

    // Then
    expect(actual).toContain(
      '## Acceptance tests added by this ticket\n\nNone: the criteria are covered by existing tests.\n\n## How to finish',
    );
  });

  it('Can_include_the_body_as_written_when_it_has_extra_sections', () => {
    const body = `\n## What already exists\n\n${someString()}\n\n## Acceptance criteria\n\n- ${someString()}\n`;

    // When
    const actual = buildFirstPrompt(someTicket({ body }), []);

    // Then
    expect(actual).toContain(`## Ticket\n\n${body.trim()}\n\n## Design sections`);
  });
});
