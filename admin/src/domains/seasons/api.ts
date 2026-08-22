import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import rpcWithSchema from '../../lib/rpc';
import {
  seasonMutationSuccessSchema,
  seasonsListResponseSchema,
  type SeasonsListResponse,
} from './contracts';

export interface SeasonsListParams {
  includeInactive?: boolean;
}

export interface CreateSeasonInput {
  name: string;
  startDate: string;
  endDate: string;
}

export const SEASONS_QUERY_KEY = ['admin', 'seasons'] as const;

export function getSeasonsQueryKey(params: SeasonsListParams) {
  return [
    ...SEASONS_QUERY_KEY,
    'list',
    {
      includeInactive: params.includeInactive !== false,
    },
  ] as const;
}

export async function fetchSeasons(params: SeasonsListParams): Promise<SeasonsListResponse> {
  return rpcWithSchema(
    'admin_list_seasons',
    { includeInactive: params.includeInactive !== false },
    seasonsListResponseSchema,
  );
}

export async function createSeason(input: CreateSeasonInput): Promise<void> {
  await rpcWithSchema(
    'admin_create_season',
    {
      name: input.name,
      startDate: input.startDate,
      endDate: input.endDate,
    },
    seasonMutationSuccessSchema,
  );
}

export async function endSeason(seasonId: string): Promise<void> {
  await rpcWithSchema(
    'admin_end_season',
    { seasonId },
    seasonMutationSuccessSchema,
  );
}

export function useSeasonsQuery(params: SeasonsListParams) {
  return useQuery<SeasonsListResponse, Error>({
    queryKey: getSeasonsQueryKey(params),
    queryFn: () => fetchSeasons(params),
  });
}

export function useCreateSeasonMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createSeason,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: SEASONS_QUERY_KEY });
    },
  });
}

export function useEndSeasonMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: endSeason,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: SEASONS_QUERY_KEY });
    },
  });
}
