import { z } from 'zod';

const stringValueSchema = z.string().nullable().optional().transform((value) => value ?? '');
const nullableStringSchema = z.string().nullable().optional();

export const referralCodeSchema = z.object({
  id: z.string(),
  code: stringValueSchema,
  creatorId: nullableStringSchema.default(null),
  creatorType: z.enum(['user', 'admin', 'system']).default('system'),
  maxUses: z.coerce.number().optional().default(0),
  currentUses: z.coerce.number().optional().default(0),
  isActive: z.boolean().optional().default(true),
  createdAt: stringValueSchema,
  expiresAt: nullableStringSchema.default(null),
  notes: nullableStringSchema.default(null),
});

export const referralUsageSchema = z.object({
  userId: z.string(),
  nickname: stringValueSchema,
  usedAt: stringValueSchema,
});

export const referralCodesResponseSchema = z.object({
  codes: z.array(referralCodeSchema).optional().default([]),
  total: z.coerce.number().optional().default(0),
  page: z.coerce.number().optional().default(1),
  limit: z.coerce.number().optional().default(20),
  totalPages: z.coerce.number().optional().default(1),
});

export const referralCodeUsageResponseSchema = z.object({
  code: referralCodeSchema,
  usage: z.array(referralUsageSchema).optional().default([]),
});

export const referralMutationSuccessSchema = z.object({
  success: z.boolean(),
  code: z.string().optional(),
  maxUses: z.coerce.number().optional(),
  expiresAt: nullableStringSchema.optional(),
});

export type ReferralCodeContract = z.infer<typeof referralCodeSchema>;
export type ReferralUsageContract = z.infer<typeof referralUsageSchema>;
export type ReferralCodesResponse = z.infer<typeof referralCodesResponseSchema>;
export type ReferralCodeUsageResponse = z.infer<typeof referralCodeUsageResponseSchema>;
