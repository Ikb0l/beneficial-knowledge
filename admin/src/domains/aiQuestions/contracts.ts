import { z } from 'zod';

const stringValueSchema = z.string().nullable().optional().transform((value) => value ?? '');
const nullableStringSchema = z.string().nullable().optional().default(null);
const optionalStringSchema = z.string().nullable().optional().transform((value) => value ?? undefined);
const questionTypeSchema = z.enum(['mcq', 'true_false', 'true_false_not_given', 'heading_match']);

export const aiGenerationSettingsSchema = z.object({
  enabled: z.boolean().optional().default(false),
  killSwitch: z.boolean().optional().default(false),
  autoPublish: z.boolean().optional().default(false),
  strictMode: z.boolean().optional().default(false),
  maxQuestionsPerRun: z.coerce.number().optional().default(20),
  maxInputTokensPerRun: z.coerce.number().optional().default(6000),
  maxOutputTokensPerRun: z.coerce.number().optional().default(4000),
  dailyBudgetUsd: z.coerce.number().optional().default(0),
  monthlyBudgetUsd: z.coerce.number().optional().default(0),
  similarityThreshold: z.coerce.number().optional().default(0.92),
  requireCitation: z.boolean().optional().default(true),
  defaultLanguage: stringValueSchema,
  allowedQuestionTypes: z.array(questionTypeSchema).optional().default([]),
  defaultProfileKey: stringValueSchema,
});

export const aiCategoryOverrideSchema = z.object({
  id: z.string(),
  categoryKey: z.string(),
  isEnabled: z.boolean().optional().default(true),
  profileId: nullableStringSchema,
  sourcePackId: nullableStringSchema,
  overrideConfig: z.record(z.string(), z.unknown()).optional().default({}),
  budgets: z.record(z.string(), z.unknown()).optional().default({}),
  updatedBy: nullableStringSchema.optional(),
  createdAt: stringValueSchema,
  updatedAt: stringValueSchema,
});

export const aiProviderProfileSchema = z.object({
  id: z.string(),
  profileKey: z.string(),
  providerKey: z.string(),
  credentialProviderKey: z.string(),
  endpointUrl: z.string(),
  model: z.string(),
  temperature: z.coerce.number().optional().default(0),
  topP: z.coerce.number().optional().default(1),
  maxTokens: z.coerce.number().optional().default(0),
  timeoutMs: z.coerce.number().optional().default(0),
  maxRetries: z.coerce.number().optional().default(0),
  isDefault: z.boolean().optional().default(false),
  isActive: z.boolean().optional().default(true),
  config: z.record(z.string(), z.unknown()).optional().default({}),
  budgets: z.record(z.string(), z.unknown()).optional().default({}),
});

export const aiSourcePackSchema = z.object({
  id: z.string(),
  packKey: z.string(),
  categoryKey: z.string(),
  name: z.string(),
  description: stringValueSchema,
  language: stringValueSchema,
  status: z.enum(['active', 'archived']).optional().default('active'),
  isActive: z.boolean().optional().default(true),
  documentCount: z.coerce.number().optional().default(0),
  chunkCount: z.coerce.number().optional().default(0),
  createdAt: optionalStringSchema,
  updatedAt: optionalStringSchema,
});

export const aiGenerationJobSchema = z.object({
  id: z.string(),
  requestedBy: stringValueSchema,
  triggerType: z.enum(['manual', 'scheduled', 'retry']).optional().default('manual'),
  status: z.enum(['scheduled', 'pending', 'running', 'completed', 'failed', 'cancelled']).optional().default('pending'),
  categoryKey: z.string(),
  sourcePackId: nullableStringSchema,
  sourcePackKey: nullableStringSchema,
  profileId: nullableStringSchema,
  profileKey: nullableStringSchema,
  questionTargetCount: z.coerce.number().optional().default(0),
  autoPublish: z.boolean().optional().default(false),
  strictMode: z.boolean().optional().default(false),
  allowedQuestionTypes: z.array(questionTypeSchema).optional().default([]),
  scheduleIntervalMinutes: z.coerce.number().nullable().optional().default(null),
  nextRunAt: z.string().nullable().optional().default(null),
  lastRunAt: z.string().nullable().optional().default(null),
  startedAt: z.string().nullable().optional().default(null),
  finishedAt: z.string().nullable().optional().default(null),
  stats: z.record(z.string(), z.unknown()).optional().default({}),
  errorSummary: stringValueSchema,
  createdAt: stringValueSchema,
  updatedAt: stringValueSchema,
});

const citationSchema = z.object({
  chunkId: stringValueSchema,
  quote: stringValueSchema,
});

export const aiGeneratedCandidateSchema = z.object({
  id: z.string(),
  jobId: nullableStringSchema,
  categoryKey: z.string(),
  sourcePackId: nullableStringSchema,
  profileId: nullableStringSchema,
  status: z.enum(['needs_review', 'rejected', 'published', 'invalid', 'approved']).optional().default('needs_review'),
  question: z.object({
    category: z.string().optional(),
    difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
    questionType: questionTypeSchema.optional(),
    questionText: z.string().optional(),
    options: z.array(z.string()).optional(),
    correctIndex: z.coerce.number().optional(),
    explanation: z.string().optional(),
    sourceReference: z.string().optional(),
    citations: z.array(citationSchema).optional(),
  }).optional().default({}),
  questionType: questionTypeSchema.optional().default('mcq'),
  questionText: stringValueSchema,
  options: z.array(z.string()).optional().default([]),
  correctIndex: z.coerce.number().optional().default(0),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional().default('medium'),
  explanation: stringValueSchema,
  sourceReference: stringValueSchema,
  citations: z.array(citationSchema).optional().default([]),
  gateReport: z.record(z.string(), z.unknown()).optional().default({}),
  failureReasons: z.array(z.string()).optional().default([]),
  normalizedQuestionText: stringValueSchema,
  publishedQuestionId: nullableStringSchema,
  createdBy: nullableStringSchema,
  reviewedBy: nullableStringSchema,
  reviewedAt: nullableStringSchema,
  createdAt: stringValueSchema,
  updatedAt: stringValueSchema,
  sourcePackKey: nullableStringSchema.optional(),
  profileKey: nullableStringSchema.optional(),
});

export const aiSettingsResponseSchema = z.object({
  settings: aiGenerationSettingsSchema,
  categoryOverrides: z.array(aiCategoryOverrideSchema).optional().default([]),
  profiles: z.array(aiProviderProfileSchema).optional().default([]),
  sourcePacks: z.array(aiSourcePackSchema).optional().default([]),
});

export const aiJobsResponseSchema = z.object({
  items: z.array(aiGenerationJobSchema).optional().default([]),
  total: z.coerce.number().optional().default(0),
});

export const aiReviewQueueResponseSchema = z.object({
  items: z.array(aiGeneratedCandidateSchema).optional().default([]),
  total: z.coerce.number().optional().default(0),
});

export const aiMutationSuccessSchema = z.object({
  success: z.boolean(),
});

export const aiCredentialResponseSchema = aiMutationSuccessSchema.extend({
  providerKey: z.string(),
  hint: z.string().optional(),
});

export const aiUpdateProfileResponseSchema = aiMutationSuccessSchema.extend({
  profile: aiProviderProfileSchema.optional(),
  defaultProfileKey: z.string().optional(),
});

export const aiDeleteProfileResponseSchema = aiMutationSuccessSchema.extend({
  deletedProfileId: z.string().optional(),
  nextDefaultProfileKey: z.string().optional(),
});

export const aiOverrideResponseSchema = aiMutationSuccessSchema.extend({
  override: aiCategoryOverrideSchema.optional(),
});

export const aiGenerateResponseSchema = aiMutationSuccessSchema.extend({
  scheduled: z.boolean().optional(),
  queued: z.boolean().optional(),
  status: z.string().optional(),
  jobId: z.string().optional(),
  jobIds: z.array(z.string()).optional(),
  batchCount: z.coerce.number().optional(),
  imported: z.coerce.number().optional(),
  queuedForReview: z.coerce.number().optional(),
  failed: z.coerce.number().optional(),
});

export const aiRetryResponseSchema = aiMutationSuccessSchema.extend({
  queued: z.boolean().optional(),
  status: z.string().optional(),
  retryJobId: z.string().optional(),
});

export interface AiAdminSnapshotContract {
  settings: z.infer<typeof aiGenerationSettingsSchema>;
  categoryOverrides: z.infer<typeof aiCategoryOverrideSchema>[];
  profiles: z.infer<typeof aiProviderProfileSchema>[];
  sourcePacks: z.infer<typeof aiSourcePackSchema>[];
  jobs: z.infer<typeof aiGenerationJobSchema>[];
  reviewQueue: z.infer<typeof aiGeneratedCandidateSchema>[];
}

export type AiSettingsResponseContract = z.infer<typeof aiSettingsResponseSchema>;
export type AiJobsResponseContract = z.infer<typeof aiJobsResponseSchema>;
export type AiReviewQueueResponseContract = z.infer<typeof aiReviewQueueResponseSchema>;
export type AiCredentialResponseContract = z.infer<typeof aiCredentialResponseSchema>;
export type AiUpdateProfileResponseContract = z.infer<typeof aiUpdateProfileResponseSchema>;
export type AiDeleteProfileResponseContract = z.infer<typeof aiDeleteProfileResponseSchema>;
export type AiOverrideResponseContract = z.infer<typeof aiOverrideResponseSchema>;
export type AiGenerateResponseContract = z.infer<typeof aiGenerateResponseSchema>;
export type AiRetryResponseContract = z.infer<typeof aiRetryResponseSchema>;
