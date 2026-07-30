import { z } from 'zod';
import { jobsSummarySchema, recentJobSchema } from '../jobs/contracts';

const dashboardStatsSchema = z.object({
  totalUsers: z.number(),
  activeUsers24h: z.number(),
  totalMatches: z.number(),
  matchesToday: z.number(),
  totalQuestions: z.number(),
  activeCategories: z.number(),
  bannedUsers: z.number(),
  newUsersToday: z.number(),
});

const activityDataSchema = z.object({
  date: z.string(),
  matches: z.number(),
  users: z.number(),
  newUsers: z.number(),
});

const matchSummarySchema = z.object({
  matchId: z.string(),
  category: z.string(),
  player1Id: z.string(),
  player1Name: z.string(),
  player1Score: z.number(),
  player2Id: z.string(),
  player2Name: z.string(),
  player2Score: z.number(),
  winnerId: z.string().nullable(),
  completedAt: z.string(),
});

const recentAdminActionSchema = z.object({
  id: z.string(),
  actionType: z.string(),
  targetType: z.string().nullable().optional(),
  targetId: z.string().nullable().optional(),
  adminName: z.string(),
  createdAt: z.string(),
});

const healthCheckSchema = z.object({
  status: z.string(),
  timestamp: z.number(),
  version: z.string(),
});

const serverStatusSchema = z.object({
  status: z.string(),
  timestamp: z.number(),
  version: z.string(),
  metrics: z.object({
    activeMatches: z.number(),
    registeredPlayers: z.number(),
    registeredPlayersSampleLimit: z.number(),
    categories: z.number(),
  }),
  config: z.object({
    questionsPerMatch: z.number(),
    timePerQuestion: z.number(),
    rankTiers: z.number(),
  }),
});

const onlineStatsSchema = z.object({
  playersOnline: z.number(),
  activeMatches: z.number(),
  timestamp: z.number(),
});

const dashboardWarningSchema = z.object({
  id: z.string(),
  tone: z.enum(['info', 'warning', 'danger']),
  title: z.string(),
  description: z.string(),
});

export const dashboardSnapshotSchema = z.object({
  summary: dashboardStatsSchema,
  activity: z.array(activityDataSchema),
  recentMatches: z.array(matchSummarySchema),
  recentActions: z.array(recentAdminActionSchema),
  jobsSummary: jobsSummarySchema,
  recentJobs: z.array(recentJobSchema),
  healthCheck: healthCheckSchema.nullable(),
  serverStatus: serverStatusSchema.nullable(),
  onlineStats: onlineStatsSchema.nullable(),
  warnings: z.array(dashboardWarningSchema),
});

export type DashboardSnapshot = z.infer<typeof dashboardSnapshotSchema>;
export type DashboardWarning = z.infer<typeof dashboardWarningSchema>;
