import { z } from 'zod';

import type { FinishResult } from './worker.js';

const finishSchema = z.strictObject({
  status: z.enum(['done', 'spec_defect']),
  summary: z.string(),
  evidence: z.string(),
});

export const finishJsonSchema: Readonly<Record<string, unknown>> = z.toJSONSchema(finishSchema, {
  target: 'draft-7',
});

export function parseFinish(value: unknown): FinishResult | undefined {
  const parsed = finishSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}
