import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import rpcWithSchema from '../../lib/rpc';
import {
  donationConfirmResponseSchema,
  donationStatsSchema,
  donorsResponseSchema,
  type DonationStatsContract,
  type DonorContract,
} from './contracts';

export const DONATIONS_QUERY_KEY = ['admin', 'donations'] as const;

export async function fetchDonationStats(): Promise<DonationStatsContract> {
  return rpcWithSchema(
    'admin_get_donation_stats',
    {},
    donationStatsSchema,
  );
}

export async function fetchDonors(limit = 20): Promise<DonorContract[]> {
  const response = await rpcWithSchema(
    'get_donor_leaderboard',
    { limit },
    donorsResponseSchema,
  );
  return response.donors || [];
}

export async function confirmDonation(donationId: string): Promise<void> {
  await rpcWithSchema(
    'confirm_donation',
    { donationId },
    donationConfirmResponseSchema,
  );
}

export function useDonationStatsQuery() {
  return useQuery<DonationStatsContract, Error>({
    queryKey: [...DONATIONS_QUERY_KEY, 'stats'],
    queryFn: () => fetchDonationStats(),
  });
}

export function useDonationDonorsQuery(limit = 20) {
  return useQuery<DonorContract[], Error>({
    queryKey: [...DONATIONS_QUERY_KEY, 'donors', limit],
    queryFn: () => fetchDonors(limit),
  });
}

export function useConfirmDonationMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: confirmDonation,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: DONATIONS_QUERY_KEY });
    },
  });
}
