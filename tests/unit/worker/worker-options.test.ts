import { beforeEach, describe, expect, it } from 'vitest';

import { finishJsonSchema } from '../../../src/worker/finish-schema.js';
import { buildWorkerOptions, type WorkerOptionsInput } from '../../../src/worker/worker-options.js';
import { someHostname, someString } from '../../support/data.js';

describe('buildWorkerOptions', () => {
  let input: WorkerOptionsInput;

  beforeEach(() => {
    input = {
      worktree: `/work/${someString()}`,
      model: someString(),
      sealed: ['.factory.yaml', '**/.gitignore', 'acceptance/**', 'Makefile'],
      network: [someHostname(), someHostname()],
      env: { PATH: someString() },
    };
  });

  it('Can_use_the_configured_model_and_the_worktree_as_working_directory', () => {
    // When
    const actual = buildWorkerOptions(input);

    // Then
    expect(actual.model).toBe(input.model);
    expect(actual.cwd).toBe(input.worktree);
  });

  it('Can_offer_only_the_six_tools_and_allow_only_make_unit_and_the_read_only_commands', () => {
    // When
    const actual = buildWorkerOptions(input);

    // Then
    expect(actual.tools).toEqual(['Read', 'Glob', 'Grep', 'Edit', 'Write', 'Bash']);
    expect(actual.allowedTools).toEqual([
      'Read',
      'Glob',
      'Grep',
      'Edit',
      'Write',
      'Bash(make unit)',
      'Bash(ls *)',
      'Bash(cat *)',
      'Bash(head *)',
      'Bash(tail *)',
      'Bash(wc *)',
      'Bash(find *)',
      'Bash(grep *)',
    ]);
  });

  it('Can_deny_everything_not_allowed_without_prompting_or_bypassing', () => {
    // When
    const actual = buildWorkerOptions(input);

    // Then
    expect(actual.permissionMode).toBe('dontAsk');
    expect(actual.settings).toMatchObject({
      permissions: {
        disableBypassPermissionsMode: 'disable',
        blockWritesOutsideWorkingDirectories: true,
      },
    });
  });

  it('Can_deny_edits_to_every_sealed_glob_and_git_and_find_actions_that_run_or_write', () => {
    const w = input.worktree;

    // When
    const actual = buildWorkerOptions(input);

    // Then
    expect(actual.settings).toMatchObject({
      permissions: {
        deny: [
          `Edit(/${w}/.factory.yaml)`,
          `Edit(/${w}/**/.gitignore)`,
          `Edit(/${w}/acceptance/**)`,
          `Edit(/${w}/Makefile)`,
          `Edit(/${w}/.git/**)`,
          'Bash(find *-exec*)',
          'Bash(find *-ok*)',
          'Bash(find *-delete*)',
          'Bash(find *-fprint*)',
          'Bash(find *-fls*)',
        ],
      },
    });
  });

  it('Can_require_the_sandbox_with_no_escape_only_the_pack_hosts_and_local_binding', () => {
    // When
    const actual = buildWorkerOptions(input);

    // Then
    expect(actual.sandbox).toEqual({
      enabled: true,
      failIfUnavailable: true,
      allowUnsandboxedCommands: false,
      autoAllowBashIfSandboxed: false,
      network: { allowedDomains: input.network, strictAllowlist: true, allowLocalBinding: true },
    });
  });

  it('Can_ask_for_the_finish_result_as_structured_output_and_load_project_settings_only', () => {
    // When
    const actual = buildWorkerOptions(input);

    // Then
    expect(actual.outputFormat).toEqual({ type: 'json_schema', schema: finishJsonSchema });
    expect(actual.settingSources).toEqual(['project']);
    expect(actual.env).toEqual(input.env);
  });

  it('Can_leave_out_resume_when_starting_and_name_the_session_when_resuming', () => {
    const sessionId = someString();

    // When
    const started = buildWorkerOptions(input);
    const resumed = buildWorkerOptions({ ...input, resume: sessionId });

    // Then
    expect(started).not.toHaveProperty('resume');
    expect(resumed.resume).toBe(sessionId);
  });
});
