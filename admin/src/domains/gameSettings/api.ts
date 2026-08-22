import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import rpcWithSchema from '../../lib/rpc';
import {
  gameSettingsMutationSuccessSchema,
  gameSettingsResponseSchema,
  type GameSettingsResponseContract,
} from './contracts';

export const GAME_SETTINGS_QUERY_KEY = ['admin', 'game-settings'] as const;

export async function fetchGameSettings(): Promise<GameSettingsResponseContract> {
  return rpcWithSchema(
    'get_game_settings',
    {},
    gameSettingsResponseSchema,
  );
}

export async function updateGameSettings(payload: Record<string, unknown>) {
  return rpcWithSchema(
    'admin_update_game_settings',
    payload,
    gameSettingsMutationSuccessSchema,
  );
}

export function useGameSettingsQuery() {
  return useQuery<GameSettingsResponseContract, Error>({
    queryKey: GAME_SETTINGS_QUERY_KEY,
    queryFn: fetchGameSettings,
  });
}

export function useUpdateGameSettingsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateGameSettings,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: GAME_SETTINGS_QUERY_KEY });
    },
  });
}
