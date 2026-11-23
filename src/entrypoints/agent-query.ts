import { query } from '@anthropic-ai/claude-agent-sdk';

import type { AgentQuery } from '../worker/sdk-worker.js';

export const agentQuery: AgentQuery = {
  run: (prompt, options) => query({ prompt, options }),
};
