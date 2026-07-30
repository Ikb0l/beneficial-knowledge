import { z } from 'zod';

const stringValueSchema = z.string().nullable().optional().transform((value) => value ?? '');

export const seasonSchema = z.object({
  id: z.string(),
  seasonNumber: z.coerce.number().optional().default(0),
  name: stringValueSchema,
  startDate: stringValueSchema,
  endDate: stringValueSchema,
  isActive: z.boolean().optional().default(false),
  rewardsDistributed: z.boolean().optional().default(false),
});

export const seasonsListResponseSchema = z.object({
  seasons: z.array(seasonSchema).optional().default([]),
});

export const seasonMutationSuccessSchema = z.object({
  success: z.boolean(),
  seasonId: z.string().nullable().optional(),
  seasonNumber: z.coerce.number().optional(),
});

export type SeasonContract = z.infer<typeof seasonSchema>;
export type SeasonsListResponse = z.infer<typeof seasonsListResponseSchema>;
export type SeasonMutationSuccess = z.infer<typeof seasonMutationSuccessSchema>;
