import { z } from 'zod';

const stringValueSchema = z.string().nullable().optional().transform((value) => value ?? '');
const nullableStringSchema = z.string().nullable().optional();

export const userSchema = z.object({
  userId: z.string(),
  username: stringValueSchema,
  displayName: stringValueSchema,
  avatarUrl: stringValueSchema,
  telegramId: z.coerce.number().optional().default(0),
  mmr: z.coerce.number().optional().default(1000),
  rankTier: stringValueSchema,
  gamesPlayed: z.coerce.number().optional().default(0),
  wins: z.coerce.number().optional().default(0),
  losses: z.coerce.number().optional().default(0),
  winRate: z.coerce.number().optional().default(0),
  isBanned: z.boolean().optional().default(false),
  createdAt: stringValueSchema,
  lastActiveAt: stringValueSchema,
});

export const userRecentMatchSchema = z.object({
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

export const banSchema = z.object({
  id: z.string(),
  userId: z.string(),
  username: stringValueSchema,
  telegramId: z.coerce.number().optional().default(0),
  bannedBy: stringValueSchema,
  bannedByName: stringValueSchema,
  reason: stringValueSchema,
  isPermanent: z.boolean().optional().default(false),
  expiresAt: nullableStringSchema.default(null),
  isActive: z.boolean().optional().default(false),
  createdAt: stringValueSchema,
  unbannedAt: nullableStringSchema.default(null),
  unbannedBy: nullableStringSchema.default(null),
  unbannedByName: nullableStringSchema.optional(),
});

export const mmrAdjustmentSchema = z.object({
  id: z.string(),
  userId: z.string(),
  adjustedBy: stringValueSchema,
  adjustedByName: stringValueSchema,
  oldMmr: z.coerce.number().optional().default(0),
  newMmr: z.coerce.number().optional().default(0),
  reason: stringValueSchema,
  createdAt: stringValueSchema,
});

export const userCategoryStatSchema = z.object({
  mmr: z.coerce.number().optional().default(1000),
  gamesPlayed: z.coerce.number().optional().default(0),
  wins: z.coerce.number().optional().default(0),
});

export const userDetailSchema = userSchema.extend({
  peakMmr: z.coerce.number().optional().default(1000),
  totalScore: z.coerce.number().optional().default(0),
  averageScore: z.coerce.number().optional().default(0),
  bestStreak: z.coerce.number().optional().default(0),
  categoryStats: z.record(z.string(), userCategoryStatSchema).optional().default({}),
  recentMatches: z.array(userRecentMatchSchema).optional().default([]),
  banHistory: z.array(banSchema).optional().default([]),
  mmrHistory: z.array(mmrAdjustmentSchema).optional().default([]),
});

export const usersListResponseSchema = z.object({
  items: z.array(userSchema),
  total: z.coerce.number().optional().default(0),
  page: z.coerce.number().optional().default(1),
  pageSize: z.coerce.number().optional().default(20),
  totalPages: z.coerce.number().optional().default(1),
});

export const userDetailResponseSchema = z.object({
  user: userDetailSchema,
});

export const bansListResponseSchema = z.object({
  items: z.array(banSchema),
  total: z.coerce.number().optional().default(0),
  page: z.coerce.number().optional().default(1),
  pageSize: z.coerce.number().optional().default(20),
  totalPages: z.coerce.number().optional().default(1),
});

export const mutationSuccessSchema = z.object({
  success: z.boolean(),
});

export const banMutationSuccessSchema = mutationSuccessSchema.extend({
  banId: z.string().optional(),
});

export type UserContract = z.infer<typeof userSchema>;
export type UserRecentMatchContract = z.infer<typeof userRecentMatchSchema>;
export type BanContract = z.infer<typeof banSchema>;
export type MmrAdjustmentContract = z.infer<typeof mmrAdjustmentSchema>;
export type UserCategoryStatContract = z.infer<typeof userCategoryStatSchema>;
export type UserDetailContract = z.infer<typeof userDetailSchema>;
export type UsersListResponse = z.infer<typeof usersListResponseSchema>;
export type UserDetailResponse = z.infer<typeof userDetailResponseSchema>;
export type BansListResponse = z.infer<typeof bansListResponseSchema>;
export type BanMutationSuccess = z.infer<typeof banMutationSuccessSchema>;
