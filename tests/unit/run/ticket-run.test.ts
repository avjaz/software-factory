import { beforeEach, describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import type { GitDirSnapshot } from '../../../src/integrity/git-dir-watch.js';
import type { Pack } from '../../../src/packs/pack-loader.js';
import type { Workspace } from '../../../src/run/outcome.js';
import type { LoopResult } from '../../../src/run/run-result.js';
import type { Target } from '../../../src/run/target-guard.js';
import {
  type Committer,
  type Loop,
  type Snapshotter,
  TicketRun,
} from '../../../src/run/ticket-run.js';
import type { PendingTicket } from '../../../src/tickets/ticket.js';
import type { Worker } from '../../../src/worker/worker.js';
import type { WorkerContext } from '../../../src/worker/worker-factory.js';
import { somePackName, someString, someTicketId } from '../../support/data.js';
import { attempt } from '../../support/factories.js';

describe('TicketRun', () => {
  let watch: MockProxy<Snapshotter>;
  let loop: MockProxy<Loop>;
  let green: MockProxy<Committer>;
  let worker: Worker;
  let subject: TicketRun;
  let repo: string;
  let target: Target;
  let pending: PendingTicket;
  let workspace: Workspace;
  let snapshot: GitDirSnapshot;

  beforeEach(() => {
    watch = mock<Snapshotter>();
    loop = mock<Loop>();
    green = mock<Committer>();
    worker = mock<Worker>();
    subject = new TicketRun(watch, loop, green, () => worker);
    repo = someString();
    const pack: Pack = {
      name: somePackName(),
      dir: someString(),
      sealed: [someString()],
      network: [],
      skills: [],
    };
    target = { settings: { pack: pack.name, sealed: [someString()] }, pack };
    const id = someTicketId();
    pending = {
      dir: someString(),
      ticket: {
        folder: `01-${id}`,
        number: '01',
        id,
        title: someString(),
        body: someString(),
        design: [],
      },
      testFiles: [{ source: someString(), target: 'acceptance/a.sh' }],
    };
    workspace = { base: someString(), branch: `factory/${id}`, worktree: someString() };
    snapshot = { files: new Map([[someString(), someString()]]) };
    watch.snapshot.mockReturnValue(snapshot);
  });

  it('Can_run_the_loop_with_the_prompt_and_integrity_input_and_commit_when_green', async () => {
    // Given
    const looped: LoopResult = { outcome: 'green', attempts: [attempt(1)] };
    const sha = someString();
    loop.run.mockResolvedValue(looped);
    green.commit.mockReturnValue(sha);

    // When
    const actual = await subject.run(repo, target, pending, workspace);

    // Then
    expect(actual).toEqual({ ...looped, workspace, commit: sha });
    expect(watch.snapshot).toHaveBeenCalledExactlyOnceWith(workspace.worktree);
    expect(loop.run).toHaveBeenCalledExactlyOnceWith(
      worker,
      expect.stringContaining('- `acceptance/a.sh`'),
      {
        worktree: workspace.worktree,
        base: workspace.base,
        pack: target.pack,
        factoryYaml: target.settings,
        copiedTests: [
          {
            target: 'acceptance/a.sh',
            pendingPath: `docs/tickets/pending/${pending.ticket.folder}/acceptance/a.sh`,
          },
        ],
        gitDir: snapshot,
      },
    );
    expect(green.commit).toHaveBeenCalledExactlyOnceWith(repo, workspace, pending.ticket);
  });

  it.each<[string, () => LoopResult]>([
    ['escalated', () => ({ outcome: 'escalated', attempts: [], lastTail: someString() })],
    [
      'spec_defect',
      () => ({
        outcome: 'spec_defect',
        attempts: [],
        summary: someString(),
        evidence: someString(),
      }),
    ],
    [
      'integrity_violation',
      () => ({ outcome: 'integrity_violation', attempts: [], violations: [] }),
    ],
    ['worker_error', () => ({ outcome: 'worker_error', attempts: [], error: someString() })],
  ])('Can_return_the_result_without_committing_when_the_loop_ends_%s', async (_, makeResult) => {
    // Given
    const looped = makeResult();
    loop.run.mockResolvedValue(looped);

    // When
    const actual = await subject.run(repo, target, pending, workspace);

    // Then
    expect(actual).toEqual({ ...looped, workspace });
    expect(green.commit).not.toHaveBeenCalled();
  });

  it('Can_ask_for_a_fresh_worker_with_the_pack_and_factory_yaml_for_each_run', async () => {
    // Given
    const contexts: WorkerContext[] = [];
    const counting = new TicketRun(watch, loop, green, (context) => {
      contexts.push(context);
      return worker;
    });
    loop.run.mockResolvedValue({ outcome: 'escalated', attempts: [], lastTail: '' });

    // When
    await counting.run(repo, target, pending, workspace);
    await counting.run(repo, target, pending, workspace);

    // Then
    const context = { pack: target.pack, factoryYaml: target.settings };
    expect(contexts).toEqual([context, context]);
  });
});
