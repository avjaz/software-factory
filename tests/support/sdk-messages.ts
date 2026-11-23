import { randomUUID } from 'node:crypto';

import type {
  NonNullableUsage,
  SDKAuthStatusMessage,
  SDKResultError,
  SDKResultSuccess,
} from '@anthropic-ai/claude-agent-sdk';

import { someCostUsd, somePositiveInteger, someString } from './data.js';

export function someSdkUsage(): NonNullableUsage {
  return {
    input_tokens: somePositiveInteger(),
    output_tokens: somePositiveInteger(),
    cache_creation_input_tokens: somePositiveInteger(),
    cache_read_input_tokens: somePositiveInteger(),
    cache_creation: { ephemeral_1h_input_tokens: 0, ephemeral_5m_input_tokens: 0 },
    fallback_credit: null,
    inference_geo: 'global',
    iterations: [],
    output_tokens_details: { thinking_tokens: 0 },
    server_tool_use: { web_fetch_requests: 0, web_search_requests: 0 },
    service_tier: 'standard',
    speed: 'standard',
  };
}

export function sdkNote(sessionId: string): SDKAuthStatusMessage {
  return {
    type: 'auth_status',
    isAuthenticating: false,
    output: [someString()],
    uuid: randomUUID(),
    session_id: sessionId,
  };
}

type ResultBase = Pick<
  SDKResultSuccess,
  | 'type'
  | 'duration_ms'
  | 'duration_api_ms'
  | 'num_turns'
  | 'stop_reason'
  | 'modelUsage'
  | 'permission_denials'
>;

function resultBase(): ResultBase {
  return {
    type: 'result',
    duration_ms: 0,
    duration_api_ms: 0,
    num_turns: 1,
    stop_reason: 'end_turn',
    modelUsage: {},
    permission_denials: [],
  };
}

export function sdkSuccess(
  sessionId: string,
  overrides: Partial<SDKResultSuccess> = {},
): SDKResultSuccess {
  return {
    ...resultBase(),
    subtype: 'success',
    is_error: false,
    result: someString(),
    total_cost_usd: someCostUsd(),
    usage: someSdkUsage(),
    structured_output: { status: 'done', summary: someString(), evidence: '' },
    uuid: randomUUID(),
    session_id: sessionId,
    ...overrides,
  };
}

export function sdkError(
  sessionId: string,
  overrides: Partial<SDKResultError> = {},
): SDKResultError {
  return {
    ...resultBase(),
    subtype: 'error_during_execution',
    is_error: true,
    total_cost_usd: someCostUsd(),
    usage: someSdkUsage(),
    errors: [someString()],
    uuid: randomUUID(),
    session_id: sessionId,
    ...overrides,
  };
}
