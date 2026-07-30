import { z } from 'zod';
import { questionTypeSchema } from '../questions/contracts';

export const jobWarningSchema = z.object({
  id: z.string(),
  tone: z.enum(['info', 'warning', 'danger']),
  title: z.string(),
  description: z.string(),
});

export const jobsSummarySchema = z.object({
  activeJobs: z.coerce.number(),
  failedJobs: z.coerce.number(),
  queuedJobs: z.coerce.number(),
});

const rankedResetTotalsSchema = z.object({
  players: z.coerce.number(),
  categoryLeaderboards: z.coerce.number(),
});

const rankedResetProgressSchema = z.object({
  playersProcessed: z.coerce.number(),
  playersTotal: z.coerce.number(),
  categoryBoardsProcessed: z.coerce.number(),
  categoryBoardsTotal: z.coerce.number(),
  categoryRecordsDeleted: z.coerce.number(),
  matchHistoryRowsDeleted: z.coerce.number(),
});

export const rankedResetJobSchema = z.object({
  jobId: z.string(),
  status: z.string(),
  stage: z.string(),
  reason: z.string(),
  createdAt: z.coerce.number().nullable(),
  updatedAt: z.coerce.number().nullable(),
  completedAt: z.coerce.number().nullable(),
  totals: rankedResetTotalsSchema,
  progress: rankedResetProgressSchema,
  error: z.string().nullable(),
});

export const aiGenerationJobSchema = z.object({
  id: z.string(),
  requestedBy: z.string(),
  triggerType: z.enum(['manual', 'scheduled', 'retry']),
  status: z.enum(['scheduled', 'pending', 'running', 'completed', 'failed', 'cancelled']),
  categoryKey: z.string(),
  sourcePackId: z.string().nullable(),
  sourcePackKey: z.string().nullable(),
  profileId: z.string().nullable(),
  profileKey: z.string().nullable(),
  questionTargetCount: z.coerce.number(),
  autoPublish: z.boolean(),
  strictMode: z.boolean(),
  allowedQuestionTypes: z.array(questionTypeSchema),
  scheduleIntervalMinutes: z.coerce.number().nullable(),
  nextRunAt: z.string().nullable(),
  lastRunAt: z.string().nullable(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  stats: z.record(z.string(), z.unknown()),
  errorSummary: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const recentJobSchema = z.object({
  id: z.string(),
  kind: z.enum(['ranked_reset', 'ai_generation']),
  title: z.string(),
  label: z.string(),
  status: z.string(),
  detail: z.string(),
  updatedAt: z.string().nullable(),
  routePath: z.string(),
});

export const jobsSnapshotSchema = z.object({
  summary: jobsSummarySchema,
  canViewRankedReset: z.boolean(),
  rankedReset: rankedResetJobSchema.nullable(),
  aiJobs: z.array(aiGenerationJobSchema),
  recentJobs: z.array(recentJobSchema),
  warnings: z.array(jobWarningSchema),
});

export type JobsSnapshot = z.infer<typeof jobsSnapshotSchema>;
export type RecentJob = z.infer<typeof recentJobSchema>;
export type RankedResetJob = z.infer<typeof rankedResetJobSchema>;
