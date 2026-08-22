import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import rpcWithSchema from '../../lib/rpc';
import {
  tournamentDetailSchema,
  tournamentMutationSuccessSchema,
  tournamentsListResponseSchema,
  type TournamentDetail,
  type TournamentMutationSuccess,
  type TournamentsListResponse,
} from './contracts';

export interface TournamentListParams {
  status?: string;
  category?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface TournamentParticipantActionInput {
  tournamentId: string;
  participantId: string;
  reason?: string;
}

export interface UpdateParticipantSeedInput {
  tournamentId: string;
  participantId: string;
  newSeed: number;
}

export interface ReportTournamentMatchResultInput {
  tournamentId: string;
  tournamentMatchId: string;
  winnerId: string | null;
  player1Score: number;
  player2Score: number;
}

export const TOURNAMENTS_QUERY_KEY = ['admin', 'tournaments'] as const;

export function getTournamentsListQueryKey(params: TournamentListParams) {
  return [
    ...TOURNAMENTS_QUERY_KEY,
    'list',
    {
      status: params.status ?? '',
      category: params.category ?? '',
      search: params.search ?? '',
      limit: params.limit ?? 50,
      offset: params.offset ?? 0,
    },
  ] as const;
}

export function getTournamentDetailQueryKey(tournamentId: string) {
  return [...TOURNAMENTS_QUERY_KEY, 'detail', tournamentId] as const;
}

async function invalidateTournamentQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  tournamentId?: string | null,
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: TOURNAMENTS_QUERY_KEY }),
    tournamentId
      ? queryClient.invalidateQueries({ queryKey: getTournamentDetailQueryKey(tournamentId) })
      : Promise.resolve(),
  ]);
}

export async function fetchTournaments(params: TournamentListParams): Promise<TournamentsListResponse> {
  return rpcWithSchema(
    'get_tournaments',
    {
      status: params.status || undefined,
      category: params.category || undefined,
      search: params.search || undefined,
      limit: params.limit ?? 50,
      offset: params.offset ?? 0,
    },
    tournamentsListResponseSchema,
  );
}

export async function fetchTournamentDetail(tournamentId: string): Promise<TournamentDetail> {
  return rpcWithSchema(
    'get_tournament_details',
    { tournamentId },
    tournamentDetailSchema,
  );
}

export async function createTournament(payload: Record<string, unknown>): Promise<TournamentMutationSuccess> {
  return rpcWithSchema(
    'admin_create_tournament',
    payload,
    tournamentMutationSuccessSchema,
  );
}

export async function updateTournament(payload: Record<string, unknown>): Promise<TournamentMutationSuccess> {
  return rpcWithSchema(
    'admin_update_tournament',
    payload,
    tournamentMutationSuccessSchema,
  );
}

export async function startTournament(tournamentId: string): Promise<TournamentMutationSuccess> {
  return rpcWithSchema(
    'admin_start_tournament',
    { tournamentId },
    tournamentMutationSuccessSchema,
  );
}

export async function cancelTournament(tournamentId: string): Promise<TournamentMutationSuccess> {
  return rpcWithSchema(
    'admin_cancel_tournament',
    { tournamentId },
    tournamentMutationSuccessSchema,
  );
}

export async function deleteTournament(tournamentId: string): Promise<TournamentMutationSuccess> {
  return rpcWithSchema(
    'admin_delete_tournament',
    { tournamentId },
    tournamentMutationSuccessSchema,
  );
}

export async function pauseTournament(tournamentId: string): Promise<TournamentMutationSuccess> {
  return rpcWithSchema(
    'admin_pause_tournament',
    { tournamentId },
    tournamentMutationSuccessSchema,
  );
}

export async function resumeTournament(tournamentId: string): Promise<TournamentMutationSuccess> {
  return rpcWithSchema(
    'admin_resume_tournament',
    { tournamentId },
    tournamentMutationSuccessSchema,
  );
}

export async function shuffleTournamentSeeds(tournamentId: string): Promise<TournamentMutationSuccess> {
  return rpcWithSchema(
    'admin_shuffle_tournament_seeds',
    { tournamentId },
    tournamentMutationSuccessSchema,
  );
}

export async function repairTournamentBestOf(tournamentId: string): Promise<TournamentMutationSuccess> {
  return rpcWithSchema(
    'admin_repair_tournament_best_of',
    { tournamentId },
    tournamentMutationSuccessSchema,
  );
}

export async function disqualifyTournamentParticipant(
  input: TournamentParticipantActionInput,
): Promise<TournamentMutationSuccess> {
  return rpcWithSchema(
    'admin_disqualify_participant',
    {
      tournamentId: input.tournamentId,
      participantId: input.participantId,
      reason: input.reason,
    },
    tournamentMutationSuccessSchema,
  );
}

export async function forfeitTournamentParticipant(
  input: TournamentParticipantActionInput,
): Promise<TournamentMutationSuccess> {
  return rpcWithSchema(
    'admin_forfeit_participant',
    {
      tournamentId: input.tournamentId,
      participantId: input.participantId,
      reason: input.reason,
    },
    tournamentMutationSuccessSchema,
  );
}

export async function updateTournamentParticipantSeed(
  input: UpdateParticipantSeedInput,
): Promise<TournamentMutationSuccess> {
  return rpcWithSchema(
    'admin_update_participant_seed',
    {
      tournamentId: input.tournamentId,
      participantId: input.participantId,
      newSeed: input.newSeed,
    },
    tournamentMutationSuccessSchema,
  );
}

export async function reportTournamentMatchResult(
  input: ReportTournamentMatchResultInput,
): Promise<TournamentMutationSuccess> {
  return rpcWithSchema(
    'report_tournament_match_result',
    {
      tournamentMatchId: input.tournamentMatchId,
      winnerId: input.winnerId,
      player1Score: input.player1Score,
      player2Score: input.player2Score,
    },
    tournamentMutationSuccessSchema,
  );
}

export function useTournamentsQuery(params: TournamentListParams) {
  return useQuery<TournamentsListResponse, Error>({
    queryKey: getTournamentsListQueryKey(params),
    queryFn: () => fetchTournaments(params),
    placeholderData: keepPreviousData,
  });
}

export function useTournamentDetailQuery(tournamentId: string | undefined) {
  return useQuery<TournamentDetail, Error>({
    queryKey: getTournamentDetailQueryKey(tournamentId || ''),
    queryFn: () => fetchTournamentDetail(tournamentId || ''),
    enabled: Boolean(tournamentId),
  });
}

export function useCreateTournamentMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createTournament,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: TOURNAMENTS_QUERY_KEY });
    },
  });
}

export function useUpdateTournamentMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateTournament,
    onSuccess: async (_data, variables) => {
      await invalidateTournamentQueries(queryClient, String(variables.tournamentId || ''));
    },
  });
}

function useTournamentIdMutation(
  mutationFn: (tournamentId: string) => Promise<TournamentMutationSuccess>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async (_data, tournamentId) => {
      await invalidateTournamentQueries(queryClient, tournamentId);
    },
  });
}

export function useStartTournamentMutation() {
  return useTournamentIdMutation(startTournament);
}

export function useCancelTournamentMutation() {
  return useTournamentIdMutation(cancelTournament);
}

export function useDeleteTournamentMutation() {
  return useTournamentIdMutation(deleteTournament);
}

export function usePauseTournamentMutation() {
  return useTournamentIdMutation(pauseTournament);
}

export function useResumeTournamentMutation() {
  return useTournamentIdMutation(resumeTournament);
}

export function useShuffleTournamentSeedsMutation() {
  return useTournamentIdMutation(shuffleTournamentSeeds);
}

export function useRepairTournamentBestOfMutation() {
  return useTournamentIdMutation(repairTournamentBestOf);
}

export function useDisqualifyTournamentParticipantMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: disqualifyTournamentParticipant,
    onSuccess: async (_data, variables) => {
      await invalidateTournamentQueries(queryClient, variables.tournamentId);
    },
  });
}

export function useForfeitTournamentParticipantMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: forfeitTournamentParticipant,
    onSuccess: async (_data, variables) => {
      await invalidateTournamentQueries(queryClient, variables.tournamentId);
    },
  });
}

export function useUpdateTournamentParticipantSeedMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateTournamentParticipantSeed,
    onSuccess: async (_data, variables) => {
      await invalidateTournamentQueries(queryClient, variables.tournamentId);
    },
  });
}

export function useReportTournamentMatchResultMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: reportTournamentMatchResult,
    onSuccess: async (_data, variables) => {
      await invalidateTournamentQueries(queryClient, variables.tournamentId);
    },
  });
}
