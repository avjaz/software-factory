import { readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import type { Output } from '../../src/cli/output.js';
import { newWorkRoot, testCli } from '../support/cli.js';
import { createTinyRepo } from '../support/tiny-repo.js';

const greetDir = 'docs/tickets/pending/01-greet';
const greetTicket = `${greetDir}/ticket.md`;

describe('factory validate-ticket', () => {
  const dirs: string[] = [];
  let output: MockProxy<Output>;
  let workRoot: string;

  function tinyRepo(): string {
    const repo = createTinyRepo();
    dirs.push(repo);
    return repo;
  }

  function validate(repo: string, ticket: string): Promise<number> {
    return testCli(workRoot)(['validate-ticket', '--repo', repo, '--ticket', ticket], output);
  }

  function editGreet(repo: string, edit: (text: string) => string): void {
    const path = join(repo, greetTicket);
    writeFileSync(path, edit(readFileSync(path, 'utf8')));
  }

  function expectRefusal(actual: number, message: string): void {
    expect(actual).toBe(2);
    expect(output.err).toHaveBeenCalledExactlyOnceWith(message);
    expect(output.out).not.toHaveBeenCalled();
  }

  beforeEach(() => {
    output = mock<Output>();
    workRoot = newWorkRoot();
    dirs.push(workRoot);
  });

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('Can_say_ok_with_exit_0_when_the_ticket_is_valid', async () => {
    const repo = tinyRepo();

    // When
    const actual = await validate(repo, '01-greet');

    // Then
    expect(actual).toBe(0);
    expect(output.out).toHaveBeenCalledExactlyOnceWith('ok: 01-greet is valid');
    expect(output.err).not.toHaveBeenCalled();
  });

  it('Can_validate_an_uncommitted_ticket_when_intake_has_just_written_it', async () => {
    const repo = tinyRepo();
    editGreet(repo, (t) => t.replace('Add the greeting file', 'Add the greeting file today'));

    // When
    const actual = await validate(repo, '01-greet');

    // Then
    expect(actual).toBe(0);
    expect(output.out).toHaveBeenCalledExactlyOnceWith('ok: 01-greet is valid');
  });

  it.each([
    ['id is missing', (t: string) => t.replace('id: greet\n', ''), 'id: required'],
    [
      'id does not match the folder',
      (t: string) => t.replace('id: greet', 'id: hello'),
      'id: "hello" does not match folder 01-greet',
    ],
    [
      'a header key is unknown',
      (t: string) => t.replace('id: greet\n', 'id: greet\nowner: me\n'),
      'unknown key: owner',
    ],
    [
      'the body is empty',
      (t: string) => t.slice(0, t.indexOf('---', 3) + 4),
      'body: must not be empty',
    ],
    [
      'there is no acceptance criteria section',
      (t: string) => t.slice(0, t.indexOf('## Acceptance criteria')),
      'acceptance criteria: missing ## Acceptance criteria',
    ],
    [
      'the acceptance criteria section is empty',
      (t: string) => t.replace('- `src/greet.txt` contains `greetings`\n', ''),
      'acceptance criteria: must list at least one item',
    ],
    [
      'design names a section the doc lacks',
      (t: string) => t.replace("design: ['1']", "design: ['9']"),
      'design: section 9 not found in docs/design.md',
    ],
  ])('Can_refuse_with_exit_2_naming_the_field_when_%s', async (_, edit, problem) => {
    const repo = tinyRepo();
    editGreet(repo, edit);

    // When
    const actual = await validate(repo, '01-greet');

    // Then
    expectRefusal(actual, `invalid ticket 01-greet: ${problem}`);
  });

  it('Can_refuse_with_exit_2_when_the_header_is_not_valid_yaml', async () => {
    const repo = tinyRepo();
    editGreet(repo, (t) => t.replace("design: ['1']", "design: ['1'"));

    // When
    const actual = await validate(repo, '01-greet');

    // Then
    expect(actual).toBe(2);
    expect(output.err).toHaveBeenCalledExactlyOnceWith(
      expect.stringMatching(/^invalid ticket 01-greet: not valid YAML: /),
    );
    expect(output.out).not.toHaveBeenCalled();
  });

  it('Can_refuse_with_exit_2_when_a_design_section_has_a_heading_but_no_text', async () => {
    const repo = tinyRepo();
    writeFileSync(
      join(repo, 'docs/design.md'),
      '# Tiny repo\n\n## 1. Greetings\n\n## 2. Farewells\n\nBye.\n',
    );

    // When
    const actual = await validate(repo, '01-greet');

    // Then
    expectRefusal(actual, 'invalid ticket 01-greet: design: section 1 has no text');
  });

  it('Can_refuse_with_exit_2_when_a_pending_folder_has_no_prefix', async () => {
    const repo = tinyRepo();
    renameSync(join(repo, greetDir), join(repo, 'docs/tickets/pending/greet'));

    // When
    const actual = await validate(repo, '02-farewell');

    // Then
    expectRefusal(actual, 'ticket folder must be NN-<id>: greet');
  });

  it('Can_refuse_with_exit_2_when_the_ticket_is_not_pending', async () => {
    const repo = tinyRepo();

    // When
    const actual = await validate(repo, '09-nope');

    // Then
    expectRefusal(actual, 'no such pending ticket: 09-nope');
  });
});
