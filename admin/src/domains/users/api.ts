import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import rpcWithSchema from '../../lib/rpc';
import {
  banMutationSuccessSchema,
  bansListResponseSchema,
  mutationSuccessSchema,
  userDetailResponseSchema,
  usersListResponseSchema,
  type BansListResponse,
  type UserContract,
  type UserDetailResponse,
  type UsersListResponse,
} from './contracts';

export interface UsersListParams {
  page?: number;
  pageSize?: number;
  limit?: number;
  offset?: number;
  search?: string;
  banStatus?: 'all' | 'active' | 'banned';
  activityBucket?: 'all' | 'active_24h' | 'active_7d' | 'active_30d' | 'dormant_30d';
  rankTier?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface BansListParams {
  page?: number;
  pageSize?: number;
  limit?: number;
  offset?: number;
  active?: boolean;
}

export interface UpdateUserMmrInput {
  userId: string;
  newMmr: number;
  reason: string;
}

export interface BanUserInput {
  userId: string;
  reason: string;
  permanent: boolean;
  duration?: number;
}

export const USERS_QUERY_KEY = ['admin', 'users'] as const;
export const BANS_QUERY_KEY = ['admin', 'bans'] as const;

function buildUsersListPayload(params: UsersListParams) {
  const limit = params.limit ?? params.pageSize ?? 20;
  const offset = params.offset ?? Math.max(0, ((params.page ?? 1) - 1) * limit);

  return {
    search: params.search,
    banStatus: params.banStatus && params.banStatus !== 'all' ? params.banStatus : undefined,
    activityBucket: params.activityBucket && params.activityBucket !== 'all' ? params.activityBucket : undefined,
    rankTier: params.rankTier && params.rankTier !== 'all' ? params.rankTier : undefined,
    sortBy: params.sortBy ?? 'lastActiveAt',
    sortOrder: params.sortOrder ?? 'desc',
    limit,
    offset,
  };
}

function buildBansListPayload(params: BansListParams) {
  const limit = params.limit ?? params.pageSize ?? 20;
  const offset = params.offset ?? Math.max(0, ((params.page ?? 1) - 1) * limit);

  return {
    active: params.active ? true : undefined,
    limit,
    offset,
  };
}

export function getUsersListQueryKey(params: UsersListParams) {
  return [
    ...USERS_QUERY_KEY,
    'list',
    {
      page: params.page ?? 1,
      pageSize: params.pageSize ?? params.limit ?? 20,
      search: params.search ?? '',
      banStatus: params.banStatus ?? 'all',
      activityBucket: params.activityBucket ?? 'all',
      rankTier: params.rankTier ?? 'all',
      sortBy: params.sortBy ?? 'lastActiveAt',
      sortOrder: params.sortOrder ?? 'desc',
    },
  ] as const;
}

export function getUserDetailQueryKey(userId: string) {
  return [...USERS_QUERY_KEY, 'detail', userId] as const;
}

export function getBansListQueryKey(params: BansListParams) {
  return [
    ...BANS_QUERY_KEY,
    'list',
    {
      page: params.page ?? 1,
      pageSize: params.pageSize ?? params.limit ?? 20,
      active: Boolean(params.active),
    },
  ] as const;
}

async function invalidateSupportQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  userId?: string,
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY }),
    queryClient.invalidateQueries({ queryKey: BANS_QUERY_KEY }),
    userId
      ? queryClient.invalidateQueries({ queryKey: getUserDetailQueryKey(userId) })
      : Promise.resolve(),
  ]);
}

export async function fetchUsers(params: UsersListParams): Promise<UsersListResponse> {
  return rpcWithSchema(
    'admin_list_users',
    buildUsersListPayload(params),
    usersListResponseSchema,
  );
}

export async function fetchUserDetail(userId: string): Promise<UserDetailResponse> {
  return rpcWithSchema(
    'admin_get_user',
    { userId },
    userDetailResponseSchema,
  );
}

export async function updateUserMmr(input: UpdateUserMmrInput): Promise<void> {
  await rpcWithSchema(
    'admin_update_user_mmr',
    {
      userId: input.userId,
      newMmr: input.newMmr,
      reason: input.reason,
    },
    mutationSuccessSchema,
  );
}

export async function banUser(input: BanUserInput): Promise<void> {
  await rpcWithSchema(
    'admin_ban_user',
    {
      userId: input.userId,
      reason: input.reason,
      permanent: input.permanent,
      duration: input.duration,
    },
    banMutationSuccessSchema,
  );
}

export async function unbanUser(userId: string): Promise<void> {
  await rpcWithSchema(
    'admin_unban_user',
    { userId },
    mutationSuccessSchema,
  );
}

export async function fetchBans(params: BansListParams): Promise<BansListResponse> {
  return rpcWithSchema(
    'admin_list_bans',
    buildBansListPayload(params),
    bansListResponseSchema,
  );
}

export async function searchUsers(search: string, limit = 10): Promise<UserContract[]> {
  const response = await fetchUsers({
    search,
    limit,
    offset: 0,
    sortBy: 'lastActiveAt',
    sortOrder: 'desc',
  });

  return response.items || [];
}

export function useUsersQuery(params: UsersListParams) {
  return useQuery<UsersListResponse, Error>({
    queryKey: getUsersListQueryKey(params),
    queryFn: () => fetchUsers(params),
    placeholderData: keepPreviousData,
  });
}

export function useUserDetailQuery(userId: string | undefined) {
  return useQuery<UserDetailResponse, Error>({
    queryKey: getUserDetailQueryKey(userId || ''),
    queryFn: () => fetchUserDetail(userId || ''),
    enabled: Boolean(userId),
  });
}

export function useBansQuery(params: BansListParams) {
  return useQuery<BansListResponse, Error>({
    queryKey: getBansListQueryKey(params),
    queryFn: () => fetchBans(params),
    placeholderData: keepPreviousData,
  });
}

export function useUpdateUserMmrMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateUserMmr,
    onSuccess: async (_data, variables) => {
      await invalidateSupportQueries(queryClient, variables.userId);
    },
  });
}

export function useBanUserMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: banUser,
    onSuccess: async (_data, variables) => {
      await invalidateSupportQueries(queryClient, variables.userId);
    },
  });
}

export function useUnbanUserMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: unbanUser,
    onSuccess: async (_data, userId) => {
      await invalidateSupportQueries(queryClient, userId);
    },
  });
}

export function useSearchUsersMutation() {
  return useMutation({
    mutationFn: (search: string) => searchUsers(search),
  });
}
