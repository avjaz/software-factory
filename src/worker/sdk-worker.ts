import type { Options, SDKMessage, SDKResultMessage } from '@anthropic-ai/claude-agent-sdk';

import { parseFinish } from './finish-schema.js';
import type { TranscriptMessage, Worker, WorkerStart, WorkerTurn } from './worker.js';
import { WorkerError } from './worker-error.js';
import { buildWorkerOptions } from './worker-options.js';

export interface AgentQuery {
  readonly run: (prompt: string, options: Options) => AsyncIterable<SDKMessage>;
}

export interface SdkWorkerSettings {
  readonly model: string;
  readonly sealed: readonly string[];
  readonly network: readonly string[];
  readonly env: Readonly<Record<string, string>>;
}

interface Session {
  readonly worktree: string;
  readonly id: string | undefined;
}

export class SdkWorker implements Worker {
  private session: Session | undefined;

  constructor(
    private readonly agent: AgentQuery,
    private readonly settings: SdkWorkerSettings,
  ) {}

  start(input: WorkerStart): Promise<WorkerTurn> {
    return this.turn(input.prompt, { worktree: input.worktree, id: undefined });
  }

  resume(message: string): Promise<WorkerTurn> {
    const { session } = this;
    if (session?.id === undefined) {
      return Promise.reject(new WorkerError('resume called before a session started'));
    }
    return this.turn(message, session);
  }

  private async turn(prompt: string, { worktree, id }: Session): Promise<WorkerTurn> {
    this.session = { worktree, id };
    const options = buildWorkerOptions({
      ...this.settings,
      worktree,
      ...(id === undefined ? {} : { resume: id }),
    });
    const messages: TranscriptMessage[] = [];
    let result: SDKResultMessage | undefined;
    try {
      for await (const message of this.agent.run(prompt, options)) {
        messages.push(message);
        this.session = { worktree, id: id ?? message.session_id };
        result = message.type === 'result' ? message : result;
      }
    } catch (e) {
      if (result === undefined) {
        const reason = e instanceof Error ? e.message : String(e);
        throw new WorkerError(`agent sdk failed: ${reason}`, { cause: e });
      }
    }
    return { ...finishOf(result), messages };
  }
}

function finishOf(result: SDKResultMessage | undefined): Omit<WorkerTurn, 'messages'> {
  if (result === undefined) {
    throw new WorkerError('agent sdk ended without a result');
  }
  if (result.subtype !== 'success') {
    throw new WorkerError(`agent sdk ended with ${result.subtype}: ${result.errors.join('; ')}`);
  }
  if (result.is_error) {
    throw new WorkerError(`agent sdk ended with an error: ${result.result}`);
  }
  const finish = parseFinish(result.structured_output);
  if (finish === undefined) {
    throw new WorkerError('agent sdk returned no valid finish result');
  }
  const { usage } = result;
  return {
    result: finish,
    usage: {
      inputTokens:
        usage.input_tokens + usage.cache_creation_input_tokens + usage.cache_read_input_tokens,
      outputTokens: usage.output_tokens,
      costUsd: result.total_cost_usd,
    },
  };
}
