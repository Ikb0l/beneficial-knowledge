import { z } from 'zod';

export const questionDifficultySchema = z.enum(['easy', 'medium', 'hard']);
export const questionTypeSchema = z.enum(['mcq', 'true_false', 'true_false_not_given', 'heading_match']);

export const questionSchema = z.object({
  id: z.string(),
  category: z.string(),
  difficulty: questionDifficultySchema,
  questionText: z.string(),
  options: z.array(z.string()),
  questionType: questionTypeSchema.optional().default('mcq'),
  correctIndex: z.coerce.number(),
  explanation: z.string(),
  sourceReference: z.string().nullable().optional(),
  timesShown: z.coerce.number(),
  timesCorrect: z.coerce.number(),
  averageAnswerTimeMs: z.coerce.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
  isActive: z.boolean(),
});

export const questionsListResponseSchema = z.object({
  items: z.array(questionSchema),
  total: z.coerce.number(),
  page: z.coerce.number(),
  pageSize: z.coerce.number(),
  totalPages: z.coerce.number(),
});

export const questionMutationSuccessSchema = z.object({
  success: z.boolean(),
});

export const questionBulkDeleteResponseSchema = questionMutationSuccessSchema.extend({
  deletedCount: z.coerce.number().optional().default(0),
});

export const questionDetailResponseSchema = z.object({
  question: questionSchema,
});

export const questionImportResultSchema = z.object({
  imported: z.coerce.number(),
  errors: z.array(z.string()),
});

export const questionExportItemSchema = z.object({
  category: z.string(),
  difficulty: questionDifficultySchema,
  questionText: z.string(),
  options: z.array(z.string()),
  correctIndex: z.coerce.number(),
  questionType: questionTypeSchema.optional().default('mcq'),
  explanation: z.string().nullable().optional(),
  sourceReference: z.string().nullable().optional(),
});

export const questionsExportResponseSchema = z.object({
  questions: z.array(questionExportItemSchema),
  total: z.coerce.number(),
  errors: z.array(z.string()).optional().default([]),
});

export type QuestionContract = z.infer<typeof questionSchema>;
export type QuestionsListResponse = z.infer<typeof questionsListResponseSchema>;
export type QuestionImportResult = z.infer<typeof questionImportResultSchema>;
export type QuestionsExportResponse = z.infer<typeof questionsExportResponseSchema>;
export type QuestionDetailResponse = z.infer<typeof questionDetailResponseSchema>;
export type QuestionBulkDeleteResponse = z.infer<typeof questionBulkDeleteResponseSchema>;
