import { z } from 'zod';

const stringValueSchema = z.string().nullable().optional().transform((value) => value ?? '');

export const rankTierSchema = z.object({
  id: z.string(),
  tierKey: stringValueSchema,
  name: stringValueSchema,
  minMmr: z.coerce.number().optional().default(0),
  maxMmr: z.coerce.number().optional().default(0),
  iconUrl: stringValueSchema,
  color: stringValueSchema,
  displayOrder: z.coerce.number().optional().default(0),
  isActive: z.boolean().optional().default(true),
  createdAt: stringValueSchema,
  updatedAt: stringValueSchema,
});

export const rankTiersListResponseSchema = z.object({
  tiers: z.array(rankTierSchema).optional().default([]),
});

export const rankTierMutationSuccessSchema = z.object({
  success: z.boolean(),
  tier: z.object({
    id: z.string(),
    tierKey: stringValueSchema,
    name: stringValueSchema,
  }).optional(),
});

export type RankTierContract = z.infer<typeof rankTierSchema>;
export type RankTiersListResponse = z.infer<typeof rankTiersListResponseSchema>;
