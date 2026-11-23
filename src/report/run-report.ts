import { z } from 'zod';

const count = z.int().nonnegative();

const attemptSchema = z.strictObject({
  number: z.int().positive(),
  status: z.enum(['done', 'spec_defect']).optional(),
  summary: z.string().optional(),
  inputTokens: count,
  outputTokens: count,
  costUsd: z.number().nonnegative(),
  workerMs: count,
  integrity: z.enum(['ok', 'violation']).optional(),
  verifyExit: z.int().optional(),
  verifyTail: z.string().optional(),
  verifyMs: count.optional(),
});

const violationSchema = z.strictObject({
  path: z.string().min(1),
  kind: z.enum(['modified', 'added', 'deleted', 'makefile_mismatch', 'test_mismatch']),
});

const common = {
  ticketId: z.string().min(1),
  folder: z.string().min(1),
  base: z.string().min(1),
  branch: z.string().min(1),
  model: z.string().min(1),
  startedAt: z.iso.datetime(),
  timings: z.strictObject({ preflightMs: count }),
  totalCostUsd: z.number().nonnegative(),
  attempts: z.array(attemptSchema),
};

const kept = { ...common, worktree: z.string().min(1) };

export const runReportSchema = z.discriminatedUnion('outcome', [
  z.strictObject({ ...common, outcome: z.literal('green'), commit: z.string().min(1) }),
  z.strictObject({ ...kept, outcome: z.literal('escalated') }),
  z.strictObject({
    ...kept,
    outcome: z.literal('spec_defect'),
    summary: z.string(),
    evidence: z.string().min(1),
  }),
  z.strictObject({
    ...kept,
    outcome: z.literal('integrity_violation'),
    violations: z.array(violationSchema).min(1),
  }),
  z.strictObject({ ...kept, outcome: z.literal('worker_error'), error: z.string() }),
  z.strictObject({
    ...kept,
    outcome: z.literal('baseline_red'),
    attempts: z.array(attemptSchema).max(0),
    verifyTail: z.string(),
  }),
  z.strictObject({
    ...kept,
    outcome: z.literal('ticket_already_green'),
    attempts: z.array(attemptSchema).max(0),
    acceptanceTail: z.string(),
  }),
]);

export type RunReport = z.infer<typeof runReportSchema>;
export type ReportAttempt = z.infer<typeof attemptSchema>;
