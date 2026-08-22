import { z } from 'zod';

const stringValueSchema = z.string().nullable().optional().transform((value) => value ?? '');
const nullableStringSchema = z.string().nullable().optional();
const nullableNumberSchema = z.union([z.coerce.number(), z.null()]).optional().default(null);

export const matchSummarySchema = z.object({
  matchId: z.string(),
  category: stringValueSchema,
  player1Id: stringValueSchema,
  player1Name: stringValueSchema,
  player1Score: z.coerce.number().optional().default(0),
  player2Id: stringValueSchema,
  player2Name: stringValueSchema,
  player2Score: z.coerce.number().optional().default(0),
  winnerId: nullableStringSchema.default(null),
  completedAt: stringValueSchema,
});

export const matchQuestionSchema = z.object({
  questionId: z.string(),
  questionText: stringValueSchema,
  correctIndex: z.coerce.number().optional().default(0),
  player1Answer: nullableNumberSchema,
  player1TimeMs: nullableNumberSchema,
  player2Answer: nullableNumberSchema,
  player2TimeMs: nullableNumberSchema,
});

export const matchDetailSchema = matchSummarySchema.extend({
  player1MmrBefore: z.coerce.number().optional().default(0),
  player1MmrAfter: z.coerce.number().optional().default(0),
  player2MmrBefore: z.coerce.number().optional().default(0),
  player2MmrAfter: z.coerce.number().optional().default(0),
  durationSeconds: z.coerce.number().optional().default(0),
  questionsData: z.array(matchQuestionSchema).optional().default([]),
});

export const matchesListResponseSchema = z.object({
  items: z.array(matchSummarySchema),
  total: z.coerce.number().optional().default(0),
  page: z.coerce.number().optional().default(1),
  pageSize: z.coerce.number().optional().default(20),
  totalPages: z.coerce.number().optional().default(1),
});

export const matchDetailResponseSchema = z.object({
  match: matchDetailSchema,
});

export type MatchSummaryContract = z.infer<typeof matchSummarySchema>;
export type MatchQuestionContract = z.infer<typeof matchQuestionSchema>;
export type MatchDetailContract = z.infer<typeof matchDetailSchema>;
export type MatchesListResponse = z.infer<typeof matchesListResponseSchema>;
export type MatchDetailResponse = z.infer<typeof matchDetailResponseSchema>;
