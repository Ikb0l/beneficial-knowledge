import rpcWithSchema from '../../lib/rpc';
import type { QuestionType } from '../../types';
import {
  aiCredentialResponseSchema,
  aiDeleteProfileResponseSchema,
  aiGenerateResponseSchema,
  aiJobsResponseSchema,
  aiMutationSuccessSchema,
  aiOverrideResponseSchema,
  aiReviewQueueResponseSchema,
  aiRetryResponseSchema,
  aiSettingsResponseSchema,
  aiUpdateProfileResponseSchema,
  type AiAdminSnapshotContract,
  type AiCredentialResponseContract,
  type AiDeleteProfileResponseContract,
  type AiGenerateResponseContract,
  type AiJobsResponseContract,
  type AiOverrideResponseContract,
  type AiReviewQueueResponseContract,
  type AiRetryResponseContract,
  type AiSettingsResponseContract,
  type AiUpdateProfileResponseContract,
} from './contracts';

export interface AiGenerationJobsParams {
  categoryKey?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

export interface AiReviewQueueParams {
  categoryKey?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

export interface CreateAiProviderProfileInput {
  profile: Record<string, unknown>;
}

export interface UpdateAiProviderProfileInput {
  profileId: string;
  updates: Record<string, unknown>;
}

export interface CreateAiSourcePackInput {
  pack: Record<string, unknown>;
}

export interface UpsertAiCategoryOverrideInput {
  categoryKey: string;
  isEnabled: boolean;
  profileId: string | null;
  sourcePackId: string | null;
  overrideConfig: Record<string, unknown>;
  budgets: Record<string, number>;
}

export interface GenerateAiQuestionsInput {
  categoryKey: string;
  count: number;
  sourcePackId?: string;
  profileId?: string;
  autoPublish: boolean;
  strictMode: boolean;
  allowedQuestionTypes: QuestionType[];
  scheduled: boolean;
  scheduleIntervalMinutes?: number;
}

export async function fetchAiSettings(): Promise<AiSettingsResponseContract> {
  return rpcWithSchema('admin_get_ai_settings', {}, aiSettingsResponseSchema);
}

export async function fetchAiGenerationJobs(params: AiGenerationJobsParams = {}): Promise<AiJobsResponseContract> {
  return rpcWithSchema(
    'admin_list_ai_generation_jobs',
    {
      categoryKey: params.categoryKey,
      status: params.status,
      limit: params.limit ?? 25,
      offset: params.offset ?? 0,
    },
    aiJobsResponseSchema,
  );
}

export async function fetchAiReviewQueue(params: AiReviewQueueParams = {}): Promise<AiReviewQueueResponseContract> {
  return rpcWithSchema(
    'admin_list_ai_review_queue',
    {
      categoryKey: params.categoryKey,
      status: params.status ?? 'needs_review',
      limit: params.limit ?? 25,
      offset: params.offset ?? 0,
    },
    aiReviewQueueResponseSchema,
  );
}

export async function fetchAiAdminSnapshot(): Promise<AiAdminSnapshotContract> {
  const [settings, jobs, reviewQueue] = await Promise.all([
    fetchAiSettings(),
    fetchAiGenerationJobs({ limit: 25, offset: 0 }),
    fetchAiReviewQueue({ status: 'needs_review', limit: 25, offset: 0 }),
  ]);

  return {
    settings: settings.settings,
    categoryOverrides: settings.categoryOverrides,
    profiles: settings.profiles,
    sourcePacks: settings.sourcePacks,
    jobs: jobs.items,
    reviewQueue: reviewQueue.items,
  };
}

export async function updateAiSettings(settings: object): Promise<AiSettingsResponseContract> {
  return rpcWithSchema(
    'admin_update_ai_settings',
    { settings },
    aiSettingsResponseSchema,
  );
}

export async function toggleAiKillSwitch(enabled: boolean) {
  return rpcWithSchema(
    'admin_toggle_ai_kill_switch',
    { enabled },
    aiMutationSuccessSchema,
  );
}

export async function setAiProviderCredential(apiKey: string): Promise<AiCredentialResponseContract> {
  return rpcWithSchema(
    'admin_set_ai_provider_credential',
    {
      providerKey: 'deepseek',
      apiKey,
    },
    aiCredentialResponseSchema,
  );
}

export async function createAiProviderProfile(input: CreateAiProviderProfileInput) {
  return rpcWithSchema(
    'admin_create_ai_provider_profile',
    input,
    aiMutationSuccessSchema,
  );
}

export async function updateAiProviderProfile(input: UpdateAiProviderProfileInput): Promise<AiUpdateProfileResponseContract> {
  return rpcWithSchema(
    'admin_update_ai_provider_profile',
    input,
    aiUpdateProfileResponseSchema,
  );
}

export async function deleteAiProviderProfile(profileId: string): Promise<AiDeleteProfileResponseContract> {
  return rpcWithSchema(
    'admin_delete_ai_provider_profile',
    { profileId },
    aiDeleteProfileResponseSchema,
  );
}

export async function createAiSourcePack(input: CreateAiSourcePackInput) {
  return rpcWithSchema(
    'admin_create_ai_source_pack',
    input,
    aiMutationSuccessSchema,
  );
}

export async function deleteAiSourcePack(sourcePackId: string) {
  return rpcWithSchema(
    'admin_delete_ai_source_pack',
    { sourcePackId },
    aiMutationSuccessSchema,
  );
}

export async function upsertAiCategoryOverride(
  input: UpsertAiCategoryOverrideInput,
): Promise<AiOverrideResponseContract> {
  return rpcWithSchema(
    'admin_upsert_ai_category_override',
    input,
    aiOverrideResponseSchema,
  );
}

export async function deleteAiCategoryOverride(categoryKey: string) {
  return rpcWithSchema(
    'admin_delete_ai_category_override',
    { categoryKey },
    aiMutationSuccessSchema,
  );
}

export async function generateAiQuestions(input: GenerateAiQuestionsInput): Promise<AiGenerateResponseContract> {
  return rpcWithSchema(
    'admin_generate_ai_questions',
    input,
    aiGenerateResponseSchema,
  );
}

export async function approveAiQuestion(candidateId: string) {
  return rpcWithSchema(
    'admin_approve_ai_question',
    { candidateId },
    aiMutationSuccessSchema,
  );
}

export async function rejectAiQuestion(candidateId: string, reason: string) {
  return rpcWithSchema(
    'admin_reject_ai_question',
    { candidateId, reason },
    aiMutationSuccessSchema,
  );
}

export async function retryAiQuestion(candidateId: string): Promise<AiRetryResponseContract> {
  return rpcWithSchema(
    'admin_retry_ai_question',
    { candidateId },
    aiRetryResponseSchema,
  );
}
