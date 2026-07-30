import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import rpcWithSchema from '../../lib/rpc';
import {
  adminPreferencesResponseSchema,
  adminSavedViewsMutationSchema,
  type AdminPreferencesContract,
} from './contracts';

export const ADMIN_PREFERENCES_QUERY_KEY = ['admin', 'preferences'] as const;

async function fetchAdminPreferences(): Promise<AdminPreferencesContract> {
  const response = await rpcWithSchema(
    'admin_get_preferences',
    {},
    adminPreferencesResponseSchema,
  );
  return response.preferences;
}

export async function upsertAdminSavedView(
  storageKey: string,
  label: string,
  query: string,
): Promise<AdminPreferencesContract> {
  const response = await rpcWithSchema(
    'admin_upsert_saved_view',
    { storageKey, label, query },
    adminSavedViewsMutationSchema,
  );
  return response.preferences;
}

export async function deleteAdminSavedView(
  storageKey: string,
  viewId: string,
): Promise<AdminPreferencesContract> {
  const response = await rpcWithSchema(
    'admin_delete_saved_view',
    { storageKey, viewId },
    adminSavedViewsMutationSchema,
  );
  return response.preferences;
}

export function useAdminPreferencesQuery() {
  return useQuery<AdminPreferencesContract, Error>({
    queryKey: ADMIN_PREFERENCES_QUERY_KEY,
    queryFn: fetchAdminPreferences,
  });
}

export function useUpsertAdminSavedViewMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ storageKey, label, query }: { storageKey: string; label: string; query: string }) =>
      upsertAdminSavedView(storageKey, label, query),
    onSuccess: async (preferences) => {
      queryClient.setQueryData(ADMIN_PREFERENCES_QUERY_KEY, preferences);
      await queryClient.invalidateQueries({ queryKey: ADMIN_PREFERENCES_QUERY_KEY });
    },
  });
}

export function useDeleteAdminSavedViewMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ storageKey, viewId }: { storageKey: string; viewId: string }) =>
      deleteAdminSavedView(storageKey, viewId),
    onSuccess: async (preferences) => {
      queryClient.setQueryData(ADMIN_PREFERENCES_QUERY_KEY, preferences);
      await queryClient.invalidateQueries({ queryKey: ADMIN_PREFERENCES_QUERY_KEY });
    },
  });
}
