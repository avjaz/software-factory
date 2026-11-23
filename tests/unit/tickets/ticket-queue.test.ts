import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { TicketError } from '../../../src/tickets/ticket-error.js';
import { nextTicket, pendingTicket } from '../../../src/tickets/ticket-queue.js';
import { someString, someTicketId } from '../../support/data.js';
import { ticketSpecFactory, ticketText } from '../../support/factories.js';

describe('nextTicket', () => {
  let repo: string;
  let pending: string;

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'queue-'));
    pending = join(repo, 'docs', 'tickets', 'pending');
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  function write(path: string, content: string): void {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }

  function addTicket(number: string, id = someTicketId(), header = {}): string {
    const folder = join(pending, `${number}-${id}`);
    const spec = ticketSpecFactory.build();
    write(
      join(folder, 'ticket.md'),
      ticketText({ ...spec, header: { ...spec.header, id, ...header } }),
    );
    return folder;
  }

  it('Can_return_undefined_when_there_is_no_pending_folder', () => {
    // When
    const actual = nextTicket(repo);

    // Then
    expect(actual).toBeUndefined();
  });

  it('Can_return_undefined_when_pending_holds_only_plain_files', () => {
    write(join(pending, '.gitkeep'), '');

    // When
    const actual = nextTicket(repo);

    // Then
    expect(actual).toBeUndefined();
  });

  it('Can_pick_the_lowest_number_when_several_tickets_are_pending', () => {
    const id = someTicketId();
    addTicket('10');
    addTicket('02');
    const lowest = addTicket('01', id);

    // When
    const actual = nextTicket(repo);

    // Then
    expect(actual?.dir).toBe(lowest);
    expect(actual?.ticket.folder).toBe(`01-${id}`);
    expect(actual?.ticket.id).toBe(id);
  });

  it('Can_read_design_sections_from_the_repo_design_doc_when_the_ticket_names_them', () => {
    const text = someString();
    write(join(repo, 'docs', 'design.md'), `## 1. One\n\n${text}\n`);
    addTicket('01', someTicketId(), { design: ['1'] });

    // When
    const actual = nextTicket(repo);

    // Then
    expect(actual?.ticket.design).toEqual([{ number: '1', text: `## 1. One\n\n${text}` }]);
  });

  it('Can_list_every_file_but_ticket_md_with_its_repo_path_when_the_folder_has_test_files', () => {
    const folder = addTicket('01');
    write(join(folder, 'acceptance', 'b.sh'), someString());
    write(join(folder, 'acceptance', 'a.sh'), someString());
    write(join(folder, 'src', 'test', 'helper', 'ticket.md'), someString());

    // When
    const actual = nextTicket(repo);

    // Then
    expect(actual?.testFiles).toEqual([
      { source: join(folder, 'acceptance', 'a.sh'), target: 'acceptance/a.sh' },
      { source: join(folder, 'acceptance', 'b.sh'), target: 'acceptance/b.sh' },
      {
        source: join(folder, 'src', 'test', 'helper', 'ticket.md'),
        target: 'src/test/helper/ticket.md',
      },
    ]);
  });

  it('Can_list_no_test_files_when_the_folder_has_only_ticket_md', () => {
    addTicket('01');

    // When
    const actual = nextTicket(repo);

    // Then
    expect(actual?.testFiles).toEqual([]);
  });

  it('Can_ignore_a_later_invalid_ticket_when_the_first_is_valid', () => {
    const id = someTicketId();
    addTicket('01', id);
    write(join(pending, '02-broken', 'ticket.md'), someString());

    // When
    const actual = nextTicket(repo);

    // Then
    expect(actual?.ticket.id).toBe(id);
  });

  it('Can_reject_a_folder_without_a_prefix_when_it_is_anywhere_in_pending', () => {
    addTicket('01');
    mkdirSync(join(pending, 'greet'));

    // When
    const actual = () => nextTicket(repo);

    // Then
    expect(actual).toThrow(TicketError);
    expect(actual).toThrow(/^ticket folder must be NN-<id>: greet$/);
  });

  it('Can_reject_duplicate_numbers_when_two_folders_share_one', () => {
    addTicket('01', 'b');
    addTicket('01', 'a');
    addTicket('02');

    // When
    const actual = () => nextTicket(repo);

    // Then
    expect(actual).toThrow(/^duplicate ticket number 01: 01-a, 01-b$/);
  });

  it('Can_say_ticket_md_is_missing_when_the_first_folder_has_none', () => {
    mkdirSync(join(pending, '01-greet', 'acceptance'), { recursive: true });

    // When
    const actual = () => nextTicket(repo);

    // Then
    expect(actual).toThrow(/^invalid ticket 01-greet: missing ticket\.md$/);
  });

  it('Can_say_ticket_md_is_missing_when_it_is_a_folder', () => {
    mkdirSync(join(pending, '01-greet', 'ticket.md'), { recursive: true });

    // When
    const actual = () => nextTicket(repo);

    // Then
    expect(actual).toThrow(/^invalid ticket 01-greet: missing ticket\.md$/);
  });

  it('Can_pass_the_parse_error_through_when_the_first_ticket_is_invalid', () => {
    addTicket('01', 'greet', { id: 'hello' });

    // When
    const actual = () => nextTicket(repo);

    // Then
    expect(actual).toThrow(/^invalid ticket 01-greet: id: "hello" does not match folder 01-greet$/);
  });

  describe('pendingTicket', () => {
    it('Can_return_the_named_ticket_when_it_is_not_the_lowest', () => {
      const id = someTicketId();
      addTicket('01');
      const folder = addTicket('02', id);
      write(join(folder, 'acceptance', 'x.sh'), someString());

      // When
      const actual = pendingTicket(repo, `02-${id}`);

      // Then
      expect(actual.dir).toBe(folder);
      expect(actual.ticket.id).toBe(id);
      expect(actual.testFiles).toEqual([
        { source: join(folder, 'acceptance', 'x.sh'), target: 'acceptance/x.sh' },
      ]);
    });

    it('Can_refuse_when_no_pending_folder_has_the_name', () => {
      addTicket('01');

      // When
      const actual = () => pendingTicket(repo, '09-nope');

      // Then
      expect(actual).toThrow(TicketError);
      expect(actual).toThrow(/^no such pending ticket: 09-nope$/);
    });

    it('Can_refuse_when_there_is_no_pending_folder_at_all', () => {
      // When
      const actual = () => pendingTicket(repo, '09-nope');

      // Then
      expect(actual).toThrow(/^no such pending ticket: 09-nope$/);
    });

    it('Can_say_ticket_md_is_missing_when_the_named_folder_has_none', () => {
      mkdirSync(join(pending, '03-greet'), { recursive: true });

      // When
      const actual = () => pendingTicket(repo, '03-greet');

      // Then
      expect(actual).toThrow(/^invalid ticket 03-greet: missing ticket\.md$/);
    });

    it('Can_reject_a_misnamed_folder_when_another_ticket_is_named', () => {
      const id = someTicketId();
      addTicket('01', id);
      mkdirSync(join(pending, 'greet'));

      // When
      const actual = () => pendingTicket(repo, `01-${id}`);

      // Then
      expect(actual).toThrow(/^ticket folder must be NN-<id>: greet$/);
    });
  });
});
