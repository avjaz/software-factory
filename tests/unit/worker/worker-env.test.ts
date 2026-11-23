import { describe, expect, it } from 'vitest';

import { clientApp, workerEnv } from '../../../src/worker/worker-env.js';
import { someString } from '../../support/data.js';

describe('workerEnv', () => {
  it('Can_keep_only_the_runtime_and_model_credential_variables_that_are_set', () => {
    const path = someString();
    const key = someString();

    // When
    const actual = workerEnv({
      PATH: path,
      ANTHROPIC_API_KEY: key,
      AWS_SECRET_ACCESS_KEY: someString(),
      GITHUB_TOKEN: someString(),
      HOME: undefined,
    });

    // Then
    expect(actual).toEqual({
      PATH: path,
      ANTHROPIC_API_KEY: key,
      CLAUDE_AGENT_SDK_CLIENT_APP: clientApp,
    });
  });
});
