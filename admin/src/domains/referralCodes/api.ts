import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import rpcWithSchema from '../../lib/rpc';
import {
  referralCodesResponseSchema,
  referralCodeUsageResponseSchema,
  referralMutationSuccessSchema,
  type ReferralCodesResponse,
  type ReferralCodeUsageResponse,
} from './contracts';

export interface ReferralCodesListParams {
  page?: number;
  limit?: number;
  filter?: string;
}

export interface CreateReferralCodeInput {
  code?: string;
  maxUses?: number;
  expiresAt?: string;
  notes?: string;
}

export interface ToggleReferralCodeInput {
  codeId: string;
  isActive: boolean;
}

export const REFERRAL_CODES_QUERY_KEY = ['admin', 'referralCodes'] as const;

export function getReferralCodesQueryKey(params: ReferralCodesListParams) {
  return [
    ...REFERRAL_CODES_QUERY_KEY,
    'list',
    {
      page: params.page ?? 1,
      limit: params.limit ?? 20,
      filter: params.filter ?? 'all',
    },
  ] as const;
}

export function getReferralCodeUsageQueryKey(codeId: string) {
  return [...REFERRAL_CODES_QUERY_KEY, 'usage', codeId] as const;
}

export async function fetchReferralCodes(params: ReferralCodesListParams): Promise<ReferralCodesResponse> {
  return rpcWithSchema(
    'admin_list_referral_codes',
    {
      page: params.page ?? 1,
      limit: params.limit ?? 20,
      filter: params.filter ?? 'all',
    },
    referralCodesResponseSchema,
  );
}

export async function fetchReferralCodeUsage(codeId: string): Promise<ReferralCodeUsageResponse> {
  return rpcWithSchema(
    'admin_get_referral_code_usage',
    { codeId },
    referralCodeUsageResponseSchema,
  );
}

export async function createReferralCode(input: CreateReferralCodeInput): Promise<void> {
  await rpcWithSchema(
    'admin_create_referral_code',
    {
      code: input.code,
      maxUses: input.maxUses,
      expiresAt: input.expiresAt,
      notes: input.notes,
    },
    referralMutationSuccessSchema,
  );
}

export async function toggleReferralCode(input: ToggleReferralCodeInput): Promise<void> {
  await rpcWithSchema(
    'admin_toggle_referral_code',
    {
      codeId: input.codeId,
      isActive: input.isActive,
    },
    referralMutationSuccessSchema,
  );
}

export function useReferralCodesQuery(params: ReferralCodesListParams) {
  return useQuery<ReferralCodesResponse, Error>({
    queryKey: getReferralCodesQueryKey(params),
    queryFn: () => fetchReferralCodes(params),
    placeholderData: keepPreviousData,
  });
}

export function useReferralCodeUsageQuery(codeId: string | undefined) {
  return useQuery<ReferralCodeUsageResponse, Error>({
    queryKey: getReferralCodeUsageQueryKey(codeId || ''),
    queryFn: () => fetchReferralCodeUsage(codeId || ''),
    enabled: Boolean(codeId),
  });
}

export function useCreateReferralCodeMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createReferralCode,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: REFERRAL_CODES_QUERY_KEY });
    },
  });
}

export function useToggleReferralCodeMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: toggleReferralCode,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: REFERRAL_CODES_QUERY_KEY });
    },
  });
}
