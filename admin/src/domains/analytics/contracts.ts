import { z } from 'zod';

export const analyticsDashboardStatsSchema = z.object({
  dau: z.coerce.number().optional().default(0),
  wau: z.coerce.number().optional().default(0),
  mau: z.coerce.number().optional().default(0),
  totalUsers: z.coerce.number().optional().default(0),
  matchesToday: z.coerce.number().optional().default(0),
  totalDonationsCents: z.coerce.number().optional().default(0),
  activeTournaments: z.coerce.number().optional().default(0),
});

export const engagementDataSchema = z.object({
  date: z.string(),
  activeUsers: z.coerce.number().optional().default(0),
  totalMatches: z.coerce.number().optional().default(0),
  totalSessions: z.coerce.number().optional().default(0),
  avgSessionSeconds: z.coerce.number().optional().default(0),
});

export const engagementResponseSchema = z.object({
  data: z.array(engagementDataSchema).optional().default([]),
});

export const questionAnalyticsSchema = z.object({
  id: z.string(),
  category: z.string(),
  difficulty: z.string(),
  questionText: z.string(),
  timesShown: z.coerce.number().optional().default(0),
  timesCorrect: z.coerce.number().optional().default(0),
  accuracyPct: z.coerce.number().optional().default(0),
  avgAnswerTimeMs: z.coerce.number().optional().default(0),
});

export const questionAnalyticsResponseSchema = z.object({
  questions: z.array(questionAnalyticsSchema).optional().default([]),
});

export const questionStatsSchema = z.object({
  total: z.coerce.number().optional().default(0),
  easy: z.coerce.number().optional().default(0),
  medium: z.coerce.number().optional().default(0),
  hard: z.coerce.number().optional().default(0),
});

export const questionStatsResponseSchema = z.object({
  categories: z.record(z.string(), questionStatsSchema).optional().default({}),
});

export const retentionCohortSchema = z.object({
  cohortDate: z.string(),
  cohortSize: z.coerce.number().optional().default(0),
  day1Pct: z.coerce.number().optional().default(0),
  day7Pct: z.coerce.number().optional().default(0),
  day30Pct: z.coerce.number().optional().default(0),
});

export const retentionCohortsResponseSchema = z.object({
  cohorts: z.array(retentionCohortSchema).optional().default([]),
});

export const tournamentAnalyticsSchema = z.object({
  uniqueParticipants: z.coerce.number().optional().default(0),
  totalParticipations: z.coerce.number().optional().default(0),
  avgParticipantsPerTournament: z.coerce.number().optional().default(0),
  completionRate: z.coerce.number().optional().default(0),
  byStatus: z.record(z.string(), z.coerce.number()).optional().default({}),
});

export interface AnalyticsSnapshotContract {
  stats: z.infer<typeof analyticsDashboardStatsSchema> | null;
  engagement: z.infer<typeof engagementDataSchema>[];
  questionAnalytics: z.infer<typeof questionAnalyticsSchema>[];
  questionStats: Record<string, z.infer<typeof questionStatsSchema>>;
  retentionCohorts: z.infer<typeof retentionCohortSchema>[];
  warnings: string[];
}

export type DashboardStatsContract = z.infer<typeof analyticsDashboardStatsSchema>;
export type EngagementDataContract = z.infer<typeof engagementDataSchema>;
export type QuestionAnalyticsContract = z.infer<typeof questionAnalyticsSchema>;
export type QuestionStatsContract = z.infer<typeof questionStatsSchema>;
export type RetentionCohortContract = z.infer<typeof retentionCohortSchema>;
export type TournamentAnalyticsContract = z.infer<typeof tournamentAnalyticsSchema>;
