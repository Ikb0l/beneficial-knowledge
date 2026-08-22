import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import rpcWithSchema from '../../lib/rpc';
import {
  questionBulkDeleteResponseSchema,
  questionDetailResponseSchema,
  questionImportResultSchema,
  questionMutationSuccessSchema,
  questionsExportResponseSchema,
  questionsListResponseSchema,
  type QuestionBulkDeleteResponse,
  type QuestionDetailResponse,
  type QuestionImportResult,
  type QuestionsExportResponse,
  type QuestionsListResponse,
} from './contracts';

export interface QuestionsListParams {
  page?: number;
  pageSize?: number;
  limit?: number;
  offset?: number;
  category?: string;
  difficulty?: string;
  questionType?: string;
  search?: string;
  showInactive?: boolean;
  isActive?: boolean;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface ToggleQuestionStatusInput {
  questionId: string;
  isActive: boolean;
}

export interface QuestionInputPayload {
  category: string;
  difficulty: 'easy' | 'medium' | 'hard';
  questionText: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  sourceReference?: string;
  questionType?: string;
}

export interface UpdateQuestionInput {
  questionId: string;
  updates: QuestionInputPayload;
}

export interface QuestionBulkImportInput {
  category: string;
  questions: unknown[];
  allowedQuestionTypes: string[];
}

export interface BulkDeleteQuestionsInput {
  questionIds: string[];
}

export const QUESTIONS_QUERY_KEY = ['admin', 'questions'] as const;

function buildQuestionsListPayload(params: QuestionsListParams) {
  const limit = params.limit ?? params.pageSize ?? 20;
  const offset = params.offset ?? Math.max(0, ((params.page ?? 1) - 1) * limit);
  const isActive = typeof params.isActive === 'boolean'
    ? params.isActive
    : params.showInactive
      ? undefined
      : true;

  return {
    category: params.category,
    difficulty: params.difficulty,
    questionType: params.questionType,
    search: params.search,
    isActive,
    sortBy: params.sortBy ?? 'createdAt',
    sortOrder: params.sortOrder ?? 'desc',
    limit,
    offset,
  };
}

export function getQuestionsQueryKey(params: QuestionsListParams) {
  return [
    ...QUESTIONS_QUERY_KEY,
    'list',
    {
      page: params.page ?? 1,
      pageSize: params.pageSize ?? params.limit ?? 20,
      offset: params.offset ?? 0,
      category: params.category ?? '',
      difficulty: params.difficulty ?? '',
      questionType: params.questionType ?? '',
      search: params.search ?? '',
      showInactive: Boolean(params.showInactive),
      isActive: typeof params.isActive === 'boolean' ? params.isActive : 'default',
      sortBy: params.sortBy ?? 'createdAt',
      sortOrder: params.sortOrder ?? 'desc',
    },
  ] as const;
}

export function getQuestionDetailQueryKey(questionId: string) {
  return [...QUESTIONS_QUERY_KEY, 'detail', questionId] as const;
}

export async function fetchQuestions(params: QuestionsListParams): Promise<QuestionsListResponse> {
  return rpcWithSchema(
    'admin_list_questions',
    buildQuestionsListPayload(params),
    questionsListResponseSchema,
  );
}

export async function fetchQuestionDetail(questionId: string): Promise<QuestionDetailResponse> {
  return rpcWithSchema(
    'admin_get_question',
    { questionId },
    questionDetailResponseSchema,
  );
}

export async function deleteQuestion(questionId: string): Promise<void> {
  await rpcWithSchema(
    'admin_delete_question',
    { questionId },
    questionMutationSuccessSchema,
  );
}

export async function bulkDeleteQuestions(input: BulkDeleteQuestionsInput): Promise<QuestionBulkDeleteResponse> {
  return rpcWithSchema(
    'admin_bulk_delete_questions',
    { questionIds: input.questionIds },
    questionBulkDeleteResponseSchema,
  );
}

export async function toggleQuestionStatus({
  questionId,
  isActive,
}: ToggleQuestionStatusInput): Promise<void> {
  await rpcWithSchema(
    'admin_toggle_question',
    { questionId, isActive },
    questionMutationSuccessSchema,
  );
}

export async function bulkImportQuestions({
  category,
  questions,
  allowedQuestionTypes,
}: QuestionBulkImportInput): Promise<QuestionImportResult> {
  return rpcWithSchema(
    'admin_bulk_import_questions',
    { category, questions, allowedQuestionTypes },
    questionImportResultSchema,
  );
}

export async function exportQuestions(category?: string): Promise<QuestionsExportResponse> {
  return rpcWithSchema(
    'admin_export_questions',
    { category },
    questionsExportResponseSchema,
  );
}

export async function createQuestion(question: QuestionInputPayload): Promise<void> {
  await rpcWithSchema(
    'admin_create_question',
    { question },
    questionMutationSuccessSchema,
  );
}

export async function updateQuestion(input: UpdateQuestionInput): Promise<void> {
  await rpcWithSchema(
    'admin_update_question',
    { questionId: input.questionId, updates: input.updates },
    questionMutationSuccessSchema,
  );
}

export function useQuestionsQuery(params: QuestionsListParams) {
  return useQuery<QuestionsListResponse, Error>({
    queryKey: getQuestionsQueryKey(params),
    queryFn: () => fetchQuestions(params),
    placeholderData: keepPreviousData,
  });
}

export function useQuestionDetailQuery(questionId: string | undefined) {
  return useQuery<QuestionDetailResponse, Error>({
    queryKey: getQuestionDetailQueryKey(questionId || ''),
    queryFn: () => fetchQuestionDetail(questionId || ''),
    enabled: Boolean(questionId),
  });
}

export function useDeleteQuestionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteQuestion,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: QUESTIONS_QUERY_KEY });
    },
  });
}

export function useBulkDeleteQuestionsMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: bulkDeleteQuestions,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: QUESTIONS_QUERY_KEY });
    },
  });
}

export function useToggleQuestionStatusMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: toggleQuestionStatus,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: QUESTIONS_QUERY_KEY });
    },
  });
}

export function useBulkImportQuestionsMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: bulkImportQuestions,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: QUESTIONS_QUERY_KEY });
    },
  });
}

export function useCreateQuestionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createQuestion,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: QUESTIONS_QUERY_KEY });
    },
  });
}

export function useUpdateQuestionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateQuestion,
    onSuccess: async (_data, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: QUESTIONS_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: getQuestionDetailQueryKey(variables.questionId) }),
      ]);
    },
  });
}
