import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { MakeError } from '../../../src/make/make-error.js';
import { ProcessMake } from '../../../src/make/process-make.js';
import { someString } from '../../support/data.js';

const makefile = `
.PHONY: ok fail mixed level ranaway
ok:
\t@echo out
fail:
\t@echo before; exit 3
mixed:
\t@echo one; echo two >&2; echo three
level:
\t@echo "level=$$MAKELEVEL"
ranaway:
\t@kill -KILL $$PPID
`;

describe('ProcessMake', () => {
  let dir: string;
  let subject: ProcessMake;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'make-'));
    writeFileSync(join(dir, 'Makefile'), makefile);
    subject = new ProcessMake({ PATH: process.env.PATH });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('Can_return_exit_0_and_the_output_when_the_target_passes', async () => {
    // When
    const actual = await subject.run(dir, 'ok');

    // Then
    expect(actual).toEqual({ exitCode: 0, output: 'out\n' });
  });

  it('Can_return_make_exit_code_and_output_when_the_target_fails', async () => {
    // When
    const actual = await subject.run(dir, 'fail');

    // Then
    expect(actual.exitCode).toBe(2);
    expect(actual.output).toMatch(/^before\n.*Error 3/s);
  });

  it('Can_interleave_stdout_and_stderr_in_write_order_when_both_are_used', async () => {
    // When
    const actual = await subject.run(dir, 'mixed');

    // Then
    expect(actual).toEqual({ exitCode: 0, output: 'one\ntwo\nthree\n' });
  });

  it('Can_report_a_missing_target_as_a_failed_run_when_the_makefile_lacks_it', async () => {
    // When
    const actual = await subject.run(dir, `missing-${someString()}`);

    // Then
    expect(actual.exitCode).toBe(2);
    expect(actual.output).toContain('No rule to make target');
  });

  it('Can_strip_the_callers_make_variables_when_they_are_in_the_environment', async () => {
    // Given
    const leaky = new ProcessMake({
      PATH: process.env.PATH,
      MAKEFLAGS: 'n',
      MFLAGS: '-n',
      MAKELEVEL: '5',
    });

    // When
    const actual = await leaky.run(dir, 'level');

    // Then
    expect(actual).toEqual({ exitCode: 0, output: 'level=1\n' });
  });

  it('Can_give_128_plus_the_signal_when_make_is_killed', async () => {
    // When
    const actual = await subject.run(dir, 'ranaway');

    // Then
    expect(actual.exitCode).toBe(137);
  });

  it('Can_reject_with_a_make_error_when_the_dir_does_not_exist', async () => {
    const missing = join(dir, `missing-${someString()}`);

    // When
    const actual = subject.run(missing, 'ok');

    // Then
    await expect(actual).rejects.toThrow(MakeError);
    await expect(subject.run(missing, 'ok')).rejects.toThrow(
      new RegExp(`^make ok could not start in ${missing}: `),
    );
  });
});
