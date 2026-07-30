import { useQuery } from '@tanstack/react-query';
import rpcWithSchema from '../../lib/rpc';
import {
  analyticsDashboardStatsSchema,
  engagementResponseSchema,
  questionAnalyticsResponseSchema,
  questionStatsResponseSchema,
  retentionCohortsResponseSchema,
  tournamentAnalyticsSchema,
  type AnalyticsSnapshotContract,
  type TournamentAnalyticsContract,
} from './contracts';

export interface AnalyticsSnapshotParams {
  engagementDays?: number;
  questionLimit?: number;
  questionSortBy?: 'accuracy' | 'time' | 'shown';
  questionCategory?: string;
  questionDifficulty?: string;
}

export const TOURNAMENT_ANALYTICS_QUERY_KEY = ['admin', 'analytics', 'tournaments'] as const;

export async function fetchAnalyticsSnapshot(
  params: AnalyticsSnapshotParams = {},
): Promise<AnalyticsSnapshotContract> {
  const engagementDays = Math.max(7, Math.min(params.engagementDays || 30, 180));
  const questionLimit = Math.max(10, Math.min(params.questionLimit || 20, 100));
  const questionSortBy = params.questionSortBy || 'accuracy';
  const questionCategory = params.questionCategory?.trim() || undefined;
  const questionDifficulty = params.questionDifficulty?.trim() || undefined;

  const results = await Promise.allSettled([
    rpcWithSchema('admin_get_analytics_dashboard', {}, analyticsDashboardStatsSchema),
    rpcWithSchema('admin_get_user_engagement', { days: engagementDays }, engagementResponseSchema),
    rpcWithSchema(
      'admin_get_question_analytics',
      {
        limit: questionLimit,
        sortBy: questionSortBy,
        category: questionCategory,
        difficulty: questionDifficulty,
      },
      questionAnalyticsResponseSchema,
    ),
    rpcWithSchema('get_question_stats', {}, questionStatsResponseSchema),
    rpcWithSchema('admin_get_retention_cohorts', {}, retentionCohortsResponseSchema),
  ]);

  const warnings: string[] = [];

  const stats = results[0].status === 'fulfilled' ? results[0].value : null;
  if (results[0].status === 'rejected') warnings.push('dashboard stats');

  const engagement = results[1].status === 'fulfilled' ? results[1].value.data : [];
  if (results[1].status === 'rejected') warnings.push('engagement data');

  const questionAnalytics = results[2].status === 'fulfilled' ? results[2].value.questions : [];
  if (results[2].status === 'rejected') warnings.push('question analytics');

  const questionStats = results[3].status === 'fulfilled' ? results[3].value.categories : {};
  if (results[3].status === 'rejected') warnings.push('question stats');

  const retentionCohorts = results[4].status === 'fulfilled' ? results[4].value.cohorts : [];
  if (results[4].status === 'rejected') warnings.push('retention data');

  return {
    stats,
    engagement,
    questionAnalytics,
    questionStats,
    retentionCohorts,
    warnings,
  };
}

export async function fetchTournamentAnalytics(): Promise<TournamentAnalyticsContract> {
  return rpcWithSchema(
    'admin_get_tournament_analytics',
    {},
    tournamentAnalyticsSchema,
  );
}

export function useAnalyticsSnapshotQuery(params: AnalyticsSnapshotParams = {}) {
  return useQuery<AnalyticsSnapshotContract, Error>({
    queryKey: ['admin', 'analytics', 'snapshot', params] as const,
    queryFn: () => fetchAnalyticsSnapshot(params),
  });
}

export function useTournamentAnalyticsQuery() {
  return useQuery<TournamentAnalyticsContract, Error>({
    queryKey: TOURNAMENT_ANALYTICS_QUERY_KEY,
    queryFn: fetchTournamentAnalytics,
  });
}
