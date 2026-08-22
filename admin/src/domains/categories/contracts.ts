import { z } from 'zod';

const stringValueSchema = z.string().nullable().optional().transform((value) => value ?? '');
const nullableStringSchema = z.string().nullable().optional().transform((value) => value ?? undefined);

export const categorySchema = z.object({
  id: z.string(),
  categoryKey: z.string(),
  name: z.string(),
  description: stringValueSchema.optional(),
  icon: stringValueSchema.optional(),
  iconUrl: stringValueSchema.optional(),
  parentId: nullableStringSchema.optional(),
  categoryType: z.enum(['normal', 'vocabulary']).optional().default('normal'),
  isActive: z.boolean().optional().default(true),
  minQuestionsRequired: z.coerce.number().optional().default(10),
  questionsPerMatch: z.coerce.number().optional().default(7),
  questionsPerMatchOverride: z.coerce.number().nullable().optional().default(null),
  useGlobalQuestionCount: z.boolean().optional().default(true),
  timePerQuestion: z.coerce.number().optional().default(15),
  displayOrder: z.coerce.number().optional().default(0),
  questionCount: z.coerce.number().optional().default(0),
  easyCount: z.coerce.number().optional().default(0),
  mediumCount: z.coerce.number().optional().default(0),
  hardCount: z.coerce.number().optional().default(0),
  createdAt: z.string().nullable().optional(),
  updatedAt: z.string().nullable().optional(),
});

export const categoriesListResponseSchema = z.object({
  categories: z.array(categorySchema).optional().default([]),
});

export const categoryMutationSuccessSchema = z.object({
  success: z.boolean(),
  reactivated: z.boolean().optional(),
  category: categorySchema.partial().optional(),
});

export const categoryDeleteResponseSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
  questionCount: z.coerce.number().optional(),
});

export type CategoryContract = z.infer<typeof categorySchema>;
export type CategoriesListResponse = z.infer<typeof categoriesListResponseSchema>;
export type CategoryMutationSuccess = z.infer<typeof categoryMutationSuccessSchema>;
export type CategoryDeleteResponse = z.infer<typeof categoryDeleteResponseSchema>;
