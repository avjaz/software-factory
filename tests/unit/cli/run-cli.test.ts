import { beforeEach, describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import type { Commands } from '../../../src/cli/commands.js';
import type { Output } from '../../../src/cli/output.js';
import { runCli } from '../../../src/cli/run-cli.js';
import { ConfigError } from '../../../src/config/config-error.js';
import { GitError } from '../../../src/git/git-error.js';
import { PackError } from '../../../src/packs/pack-error.js';
import { RefusalError } from '../../../src/refusal.js';
import type { PreflightFailed, Workspace } from '../../../src/run/outcome.js';
import type { NextResult } from '../../../src/run/run-result.js';
import { FactoryYamlError } from '../../../src/target/factory-yaml-error.js';
import { TicketError } from '../../../src/tickets/ticket-error.js';
import {
  somePackName,
  somePositiveInteger,
  someRepoPath,
  someString,
  someTicketId,
} from '../../support/data.js';
import { attempt } from '../../support/factories.js';

const usage =
  'usage: factory <command> --repo <dir> [--pack <name> [--skeleton --param <name>=<value>]] [--ticket <NN-id>]\ncommands: init, next, check, validate-ticket';

function someWorkspace(): Workspace {
  return { base: someString(), branch: `factory/${someTicketId()}`, worktree: someRepoPath() };
}

function failedPreflight(output: string): PreflightFailed {
  return {
    outcome: 'baseline_red',
    workspace: someWorkspace(),
    target: 'verify',
    result: { exitCode: 2, output },
  };
}

describe('runCli', () => {
  let output: MockProxy<Output>;
  let commands: MockProxy<Commands>;
  const tailLines = 2;

  beforeEach(() => {
    output = mock<Output>();
    commands = mock<Commands>();
  });

  function cli(...argv: readonly string[]): Promise<number> {
    return runCli(argv, output, commands, { tailLines });
  }

  function printed(): readonly unknown[] {
    return output.out.mock.calls.map(([line]) => line);
  }

  describe('arguments', () => {
    it('Can_print_usage_and_exit_2_when_no_command_is_given', async () => {
      // When
      const actual = await cli();

      // Then
      expect(actual).toBe(2);
      expect(output.err).toHaveBeenCalledExactlyOnceWith(usage);
      expect(output.out).not.toHaveBeenCalled();
    });

    it('Can_report_unknown_command_and_exit_2_when_command_is_unknown', async () => {
      const command = `x${someString()}`;

      // When
      const actual = await cli(command, '--repo', someRepoPath());

      // Then
      expect(actual).toBe(2);
      expect(output.err).toHaveBeenCalledExactlyOnceWith(`unknown command: ${command}`);
    });

    it('Can_report_bad_option_and_exit_2_when_an_option_is_unknown', async () => {
      const option = `x${someString()}`;

      // When
      const actual = await cli('next', `--${option}`);

      // Then
      expect(actual).toBe(2);
      expect(output.err).toHaveBeenCalledExactlyOnceWith(`unknown option: --${option}\n${usage}`);
    });

    it.each([
      ['next', '--pack'],
      ['next', '--ticket'],
      ['init', '--ticket'],
      ['next', '--skeleton'],
      ['check', '--param'],
      ['check', '--pack'],
      ['validate-ticket', '--pack'],
    ])('Can_reject_an_option_another_command_owns_when_%s_gets_%s', async (command, option) => {
      // When
      const actual = await cli(command, '--repo', someRepoPath(), option, someString());

      // Then
      expect(actual).toBe(2);
      expect(output.err).toHaveBeenCalledExactlyOnceWith(`unknown option: ${option}\n${usage}`);
    });

    it.each([
      ['init', ['--pack', 'fake']],
      ['next', []],
      ['check', ['--ticket', '01-a']],
      ['validate-ticket', ['--ticket', '01-a']],
    ])('Can_report_missing_repo_and_exit_2_when_%s_has_no_repo', async (command, extra) => {
      // When
      const actual = await cli(command, ...extra);

      // Then
      expect(actual).toBe(2);
      expect(output.err).toHaveBeenCalledExactlyOnceWith('--repo is required');
    });

    it.each([
      ['init', '--pack is required'],
      ['check', '--ticket is required'],
      ['validate-ticket', '--ticket is required'],
    ])('Can_report_the_missing_option_and_exit_2_when_%s_lacks_it', async (command, message) => {
      // When
      const actual = await cli(command, '--repo', someRepoPath());

      // Then
      expect(actual).toBe(2);
      expect(output.err).toHaveBeenCalledExactlyOnceWith(message);
      expect(commands.init).not.toHaveBeenCalled();
      expect(commands.check).not.toHaveBeenCalled();
      expect(commands.validateTicket).not.toHaveBeenCalled();
    });
  });

  describe('init', () => {
    it('Can_run_init_and_exit_0_when_init_has_a_repo_and_a_pack', async () => {
      const repo = someRepoPath();
      const pack = somePackName();

      // When
      const actual = await cli('init', '--repo', repo, '--pack', pack);

      // Then
      expect(actual).toBe(0);
      expect(commands.init).toHaveBeenCalledExactlyOnceWith(repo, pack, undefined);
      expect(output.out).toHaveBeenCalledExactlyOnceWith(
        `initialised with pack ${pack}; review the changes and commit them`,
      );
      expect(output.err).not.toHaveBeenCalled();
    });

    it('Can_pass_the_skeleton_params_to_init_when_skeleton_is_asked_for', async () => {
      const repo = someRepoPath();
      const pack = somePackName();
      const value = someTicketId();

      // When
      const actual = await cli(
        'init',
        '--repo',
        repo,
        '--pack',
        pack,
        '--skeleton',
        '--param',
        `name=${value}`,
        '--param',
        'space=a.b',
      );

      // Then
      expect(actual).toBe(0);
      expect(commands.init).toHaveBeenCalledExactlyOnceWith(
        repo,
        pack,
        new Map([
          ['name', value],
          ['space', 'a.b'],
        ]),
      );
    });

    it('Can_pass_no_params_to_init_when_skeleton_is_asked_for_without_any', async () => {
      const repo = someRepoPath();
      const pack = somePackName();

      // When
      const actual = await cli('init', '--repo', repo, '--pack', pack, '--skeleton');

      // Then
      expect(actual).toBe(0);
      expect(commands.init).toHaveBeenCalledExactlyOnceWith(repo, pack, new Map());
    });

    it.each<[string, readonly string[], string]>([
      ['a param comes without skeleton', ['--param', 'name=a'], '--param needs --skeleton'],
      [
        'a param is malformed',
        ['--skeleton', '--param', 'name'],
        '--param must be name=value: name',
      ],
    ])('Can_refuse_with_exit_2_without_running_init_when_%s', async (_, extra, message) => {
      // When
      const actual = await cli(
        'init',
        '--repo',
        someRepoPath(),
        '--pack',
        somePackName(),
        ...extra,
      );

      // Then
      expect(actual).toBe(2);
      expect(output.err).toHaveBeenCalledExactlyOnceWith(message);
      expect(commands.init).not.toHaveBeenCalled();
    });

    it('Can_say_initialised_when_init_runs_with_a_skeleton', async () => {
      const pack = somePackName();

      // When
      await cli('init', '--repo', someRepoPath(), '--pack', pack, '--skeleton');

      // Then
      expect(output.out).toHaveBeenCalledExactlyOnceWith(
        `initialised with pack ${pack}; review the changes and commit them`,
      );
      expect(output.err).not.toHaveBeenCalled();
    });

    it.each([
      ['RefusalError', (message: string) => new RefusalError(message)],
      ['PackError', (message: string) => new PackError(message)],
      ['FactoryYamlError', (message: string) => new FactoryYamlError(message)],
      ['ConfigError', (message: string) => new ConfigError(message)],
      ['TicketError', (message: string) => new TicketError(message)],
    ])('Can_print_the_message_and_exit_2_when_init_throws_a_%s', async (_, makeError) => {
      // Given
      const error = makeError(someString());
      commands.init.mockImplementation(() => {
        throw error;
      });

      // When
      const actual = await cli('init', '--repo', someRepoPath(), '--pack', somePackName());

      // Then
      expect(actual).toBe(2);
      expect(output.err).toHaveBeenCalledExactlyOnceWith(error.message);
      expect(output.out).not.toHaveBeenCalled();
    });

    it('Can_let_an_unexpected_error_escape_when_init_throws_one', async () => {
      // Given
      const error = new GitError(someString());
      commands.init.mockImplementation(() => {
        throw error;
      });

      // When
      const actual = cli('init', '--repo', someRepoPath(), '--pack', somePackName());

      // Then
      await expect(actual).rejects.toThrow(error);
      expect(output.err).not.toHaveBeenCalled();
    });
  });

  describe('next', () => {
    const folder = '01-greet';
    let reportDir: string;

    function givenNext(result: NextResult['result']): void {
      reportDir = someRepoPath();
      commands.next.mockResolvedValue({
        reportDir,
        folder,
        ticketId: 'greet',
        startedAt: new Date(),
        preflightMs: somePositiveInteger(),
        result,
      });
    }

    it('Can_print_the_ticket_the_outcome_and_the_commit_and_exit_0_when_green', async () => {
      // Given
      const repo = someRepoPath();
      const workspace = someWorkspace();
      const commit = someString();
      givenNext({ outcome: 'green', attempts: [attempt(1)], workspace, commit });

      // When
      const actual = await cli('next', '--repo', repo);

      // Then
      expect(actual).toBe(0);
      expect(commands.next).toHaveBeenCalledExactlyOnceWith(repo);
      expect(printed()).toEqual([
        'ticket: 01-greet',
        'green (exit 0) after 1 attempt',
        `committed ${commit} on ${workspace.branch}`,
        reportDir,
      ]);
      expect(output.err).not.toHaveBeenCalled();
    });

    it.each<[string, (workspace: Workspace) => NextResult['result'], readonly string[]]>([
      [
        'escalated',
        (workspace) => ({
          outcome: 'escalated',
          attempts: [attempt(1), attempt(2), attempt(3)],
          workspace,
          lastTail: 'tail line',
        }),
        ['escalated (exit 1) after 3 attempts', 'tail line'],
      ],
      [
        'escalated_without_output',
        (workspace) => ({
          outcome: 'escalated',
          attempts: [attempt(1)],
          workspace,
          lastTail: '',
        }),
        ['escalated (exit 1) after 1 attempt'],
      ],
      [
        'spec_defect',
        (workspace) => ({
          outcome: 'spec_defect',
          attempts: [attempt(1)],
          workspace,
          summary: 'the test is wrong',
          evidence: 'greet.sh greps the wrong file',
        }),
        [
          'spec_defect (exit 1) after 1 attempt',
          'summary: the test is wrong',
          'evidence: greet.sh greps the wrong file',
        ],
      ],
      [
        'integrity_violation',
        (workspace) => ({
          outcome: 'integrity_violation',
          attempts: [attempt(1)],
          workspace,
          violations: [
            { path: 'Makefile', kind: 'makefile_mismatch' },
            { path: 'acceptance/hello.sh', kind: 'modified' },
          ],
        }),
        [
          'integrity_violation (exit 1) after 1 attempt',
          'makefile_mismatch Makefile',
          'modified acceptance/hello.sh',
        ],
      ],
      [
        'worker_error',
        (workspace) => ({
          outcome: 'worker_error',
          attempts: [attempt(1)],
          workspace,
          error: 'worker not configured',
        }),
        ['worker_error (exit 1) after 1 attempt', 'error: worker not configured'],
      ],
    ])(
      'Can_print_the_details_and_kept_worktree_and_exit_1_when_%s',
      async (_, makeResult, lines) => {
        // Given
        const workspace = someWorkspace();
        givenNext(makeResult(workspace));

        // When
        const actual = await cli('next', '--repo', someRepoPath());

        // Then
        expect(actual).toBe(1);
        expect(printed()).toEqual([
          'ticket: 01-greet',
          ...lines,
          `worktree kept: ${workspace.worktree}`,
          reportDir,
        ]);
      },
    );

    it('Can_print_the_preflight_failure_tail_and_kept_worktree_and_exit_1', async () => {
      // Given
      const failed = failedPreflight('one\ntwo\nthree\n');
      givenNext(failed);

      // When
      const actual = await cli('next', '--repo', someRepoPath());

      // Then
      expect(actual).toBe(1);
      expect(printed()).toEqual([
        'ticket: 01-greet',
        'baseline_red: make verify exited 2',
        'two\nthree',
        `worktree kept: ${failed.workspace.worktree}`,
        reportDir,
      ]);
    });

    it('Can_skip_the_tail_line_when_make_printed_nothing', async () => {
      // Given
      const failed: PreflightFailed = {
        outcome: 'ticket_already_green',
        workspace: someWorkspace(),
        target: 'acceptance',
        result: { exitCode: 0, output: '' },
      };
      givenNext(failed);

      // When
      const actual = await cli('next', '--repo', someRepoPath());

      // Then
      expect(actual).toBe(1);
      expect(printed()).toEqual([
        'ticket: 01-greet',
        'ticket_already_green: make acceptance exited 0',
        `worktree kept: ${failed.workspace.worktree}`,
        reportDir,
      ]);
    });

    it('Can_print_the_message_and_exit_2_when_next_refuses', async () => {
      // Given
      const error = new TicketError(someString());
      commands.next.mockRejectedValue(error);

      // When
      const actual = await cli('next', '--repo', someRepoPath());

      // Then
      expect(actual).toBe(2);
      expect(output.err).toHaveBeenCalledExactlyOnceWith(error.message);
    });
  });

  describe('check', () => {
    it('Can_print_the_ok_line_and_the_acceptance_tail_and_exit_0_when_preflight_passes', async () => {
      // Given
      const repo = someRepoPath();
      const ticket = `01-${someTicketId()}`;
      commands.check.mockResolvedValue({
        outcome: 'ok',
        workspace: someWorkspace(),
        acceptance: { exitCode: 2, output: 'one\nFAIL: a.sh\npass: b.sh\n' },
      });

      // When
      const actual = await cli('check', '--repo', repo, '--ticket', ticket);

      // Then
      expect(actual).toBe(0);
      expect(commands.check).toHaveBeenCalledExactlyOnceWith(repo, ticket);
      expect(printed()).toEqual([`ok: main is green, ${ticket} is red`, 'FAIL: a.sh\npass: b.sh']);
    });

    it('Can_print_only_the_ok_line_when_the_acceptance_output_is_empty', async () => {
      // Given
      const ticket = `01-${someTicketId()}`;
      commands.check.mockResolvedValue({
        outcome: 'ok',
        workspace: someWorkspace(),
        acceptance: { exitCode: 2, output: '' },
      });

      // When
      const actual = await cli('check', '--repo', someRepoPath(), '--ticket', ticket);

      // Then
      expect(actual).toBe(0);
      expect(printed()).toEqual([`ok: main is green, ${ticket} is red`]);
    });

    it('Can_print_the_outcome_and_tail_without_a_worktree_and_exit_1_when_preflight_fails', async () => {
      // Given
      commands.check.mockResolvedValue(failedPreflight('only\n'));

      // When
      const actual = await cli('check', '--repo', someRepoPath(), '--ticket', '01-a');

      // Then
      expect(actual).toBe(1);
      expect(printed()).toEqual(['baseline_red: make verify exited 2', 'only']);
    });

    it('Can_print_the_message_and_exit_2_when_check_refuses', async () => {
      // Given
      const error = new RefusalError(someString());
      commands.check.mockRejectedValue(error);

      // When
      const actual = await cli('check', '--repo', someRepoPath(), '--ticket', '01-a');

      // Then
      expect(actual).toBe(2);
      expect(output.err).toHaveBeenCalledExactlyOnceWith(error.message);
    });
  });

  describe('validate-ticket', () => {
    it('Can_print_the_ok_line_and_exit_0_when_the_ticket_is_valid', async () => {
      const repo = someRepoPath();
      const ticket = `01-${someTicketId()}`;

      // When
      const actual = await cli('validate-ticket', '--repo', repo, '--ticket', ticket);

      // Then
      expect(actual).toBe(0);
      expect(commands.validateTicket).toHaveBeenCalledExactlyOnceWith(repo, ticket);
      expect(printed()).toEqual([`ok: ${ticket} is valid`]);
      expect(output.err).not.toHaveBeenCalled();
    });

    it('Can_print_the_message_and_exit_2_when_the_ticket_is_invalid', async () => {
      // Given
      const error = new TicketError(someString());
      commands.validateTicket.mockImplementation(() => {
        throw error;
      });

      // When
      const actual = await cli('validate-ticket', '--repo', someRepoPath(), '--ticket', '01-a');

      // Then
      expect(actual).toBe(2);
      expect(output.err).toHaveBeenCalledExactlyOnceWith(error.message);
      expect(output.out).not.toHaveBeenCalled();
    });
  });
});
