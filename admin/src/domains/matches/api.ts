import { keepPreviousData, useQuery } from '@tanstack/react-query';
import rpcWithSchema from '../../lib/rpc';
import {
  matchDetailResponseSchema,
  matchesListResponseSchema,
  type MatchDetailResponse,
  type MatchesListResponse,
} from './contracts';

export interface MatchesListParams {
  page?: number;
  pageSize?: number;
  limit?: number;
  offset?: number;
  category?: string;
  userId?: string;
}

export const MATCHES_QUERY_KEY = ['admin', 'matches'] as const;

function buildMatchesListPayload(params: MatchesListParams) {
  const limit = params.limit ?? params.pageSize ?? 20;
  const offset = params.offset ?? Math.max(0, ((params.page ?? 1) - 1) * limit);

  return {
    category: params.category,
    userId: params.userId,
    limit,
    offset,
  };
}

export function getMatchesListQueryKey(params: MatchesListParams) {
  return [
    ...MATCHES_QUERY_KEY,
    'list',
    {
      page: params.page ?? 1,
      pageSize: params.pageSize ?? params.limit ?? 20,
      category: params.category ?? '',
      userId: params.userId ?? '',
    },
  ] as const;
}

export function getMatchDetailQueryKey(matchId: string) {
  return [...MATCHES_QUERY_KEY, 'detail', matchId] as const;
}

export async function fetchMatches(params: MatchesListParams): Promise<MatchesListResponse> {
  return rpcWithSchema(
    'admin_list_matches',
    buildMatchesListPayload(params),
    matchesListResponseSchema,
  );
}

export async function fetchMatchDetail(matchId: string): Promise<MatchDetailResponse> {
  return rpcWithSchema(
    'admin_get_match',
    { matchId },
    matchDetailResponseSchema,
  );
}

export function useMatchesQuery(params: MatchesListParams) {
  return useQuery<MatchesListResponse, Error>({
    queryKey: getMatchesListQueryKey(params),
    queryFn: () => fetchMatches(params),
    placeholderData: keepPreviousData,
  });
}

export function useMatchDetailQuery(matchId: string | undefined) {
  return useQuery<MatchDetailResponse, Error>({
    queryKey: getMatchDetailQueryKey(matchId || ''),
    queryFn: () => fetchMatchDetail(matchId || ''),
    enabled: Boolean(matchId),
  });
}
