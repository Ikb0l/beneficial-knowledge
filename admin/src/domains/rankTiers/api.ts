import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import rpcWithSchema from '../../lib/rpc';
import {
  rankTierMutationSuccessSchema,
  rankTiersListResponseSchema,
  type RankTiersListResponse,
} from './contracts';

export interface RankTierInput {
  tierKey: string;
  name: string;
  minMmr: number;
  maxMmr: number;
  iconUrl?: string;
  color?: string;
  displayOrder?: number;
  isActive?: boolean;
}

export interface UpdateRankTierInput {
  tierId: string;
  updates: Partial<RankTierInput>;
}

export const RANK_TIERS_QUERY_KEY = ['admin', 'rankTiers'] as const;

export function getRankTiersQueryKey(includeInactive: boolean) {
  return [...RANK_TIERS_QUERY_KEY, 'list', { includeInactive }] as const;
}

export async function fetchRankTiers(includeInactive: boolean): Promise<RankTiersListResponse> {
  return rpcWithSchema(
    'admin_list_rank_tiers',
    { includeInactive },
    rankTiersListResponseSchema,
  );
}

export async function createRankTier(tier: RankTierInput): Promise<void> {
  await rpcWithSchema(
    'admin_create_rank_tier',
    { tier },
    rankTierMutationSuccessSchema,
  );
}

export async function updateRankTier(input: UpdateRankTierInput): Promise<void> {
  await rpcWithSchema(
    'admin_update_rank_tier',
    { tierId: input.tierId, updates: input.updates },
    rankTierMutationSuccessSchema,
  );
}

export async function deleteRankTier(tierId: string): Promise<void> {
  await rpcWithSchema(
    'admin_delete_rank_tier',
    { tierId },
    rankTierMutationSuccessSchema,
  );
}

export function useRankTiersQuery(includeInactive: boolean) {
  return useQuery<RankTiersListResponse, Error>({
    queryKey: getRankTiersQueryKey(includeInactive),
    queryFn: () => fetchRankTiers(includeInactive),
  });
}

export function useCreateRankTierMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createRankTier,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: RANK_TIERS_QUERY_KEY });
    },
  });
}

export function useUpdateRankTierMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateRankTier,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: RANK_TIERS_QUERY_KEY });
    },
  });
}

export function useDeleteRankTierMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteRankTier,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: RANK_TIERS_QUERY_KEY });
    },
  });
}
