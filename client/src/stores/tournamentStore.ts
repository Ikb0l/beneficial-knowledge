// Tournament Store
import { create } from 'zustand';
import nakama from '../shared/lib/nakama';

export type TournamentStatus =
  | 'upcoming'
  | 'registration'
  | 'in_progress'
  | 'paused'
  | 'completed'
  | 'cancelled';

export type TournamentParticipantStatus =
  | 'registered'
  | 'checked_in'
  | 'active'
  | 'eliminated'
  | 'winner'
  | 'forfeited'
  | 'disqualified';

export type TournamentMatchStatus =
  | 'pending'
  | 'ready'
  | 'in_progress'
  | 'completed'
  | 'bye'
  | 'forfeit';

export interface TournamentBotDifficultyProfile {
  baseAccuracy: number;
  minAccuracy: number;
  maxAccuracy: number;
  roundAccuracyBonus: number;
  minDelayMs: number;
  maxDelayMs: number;
  roundDelayReductionMs: number;
  nearMissChance: number;
}

export interface TournamentBotPolicy {
  enabled: boolean;
  fillOnStart: boolean;
  replaceMissingBeforeMatch: boolean;
  botMmr: number;
  skipMmrBonusWhenBotInfluenced: boolean;
  difficulty: TournamentBotDifficultyProfile;
}

export interface Tournament {
  id: string;
  name: string;
  description?: string;
  format: string;
  bracketSize: number;
  category: string | null;
  minMmr: number;
  maxMmr: number;
  questionCount: number;
  registrationStart: string;
  registrationEnd: string;
  tournamentStart: string;
  status: TournamentStatus;
  currentRound: number;
  rewards: Record<string, unknown>;
  allowSpectators: boolean;
  registeredCount?: number;
  participantCount: number;
  seedingMode?: string;
  bestOfByRound?: Record<string, unknown>;
  grandFinalReset?: boolean;
  isRegistered?: boolean;
  participantStatus?: TournamentParticipantStatus;
  finalPlacement?: number | null;
  eligibilityMmr?: number;
  eligibilityMmrBasis?: 'global' | 'category' | string;
  isEligible?: boolean;
  questionPoolIds?: string[];
  botPolicy?: TournamentBotPolicy;
}

export interface TournamentParticipant {
  id: string;
  userId: string | null;
  displayName: string;
  seedNumber: number;
  mmrAtRegistration: number;
  status: TournamentParticipantStatus | string;
  isBot?: boolean;
  botProfileId?: string | null;
  botInfluenced?: boolean;
  finalPlacement: number | null;
  matchesPlayed: number;
  matchesWon: number;
  totalScore: number;
}

export interface TournamentMatch {
  id: string;
  roundNumber: number;
  matchNumber: number;
  bracketType: string;
  player1Id: string | null;
  player2Id: string | null;
  winnerId: string | null;
  player1UserId?: string | null;
  player2UserId?: string | null;
  winnerUserId?: string | null;
  player1IsBot?: boolean;
  player2IsBot?: boolean;
  winnerIsBot?: boolean;
  player1Score: number | null;
  player2Score: number | null;
  status: TournamentMatchStatus;
  scheduledTime: string | null;
  startedAt: string | null;
  completedAt: string | null;
  spectatorCount: number;
  nakamaMatchId?: string | null;
  bestOf?: number;
  seriesWinsPlayer1?: number;
  seriesWinsPlayer2?: number;
  seriesGameCount?: number;
}

export interface SpectatorMatch {
  matchId: string;
  nakamaMatchId: string | null;
  tournamentId: string;
  tournamentName: string;
  roundNumber: number;
  player1: { id: string | null; name: string };
  player2: { id: string | null; name: string };
  spectatorCount: number;
}

interface TournamentDetail {
  tournament: Tournament;
  participants: TournamentParticipant[];
  matches: TournamentMatch[];
  isRegistered: boolean;
  userParticipant: { id: string; status: string } | null;
}

// Ready check state for tournament matches
export interface ReadyCheckState {
  matchId: string;
  tournamentId: string;
  opponentName: string;
  userReady: boolean;
  opponentReady: boolean;
  nakamaMatchId?: string | null;
  startedAt: number;
  timeoutMs: number;
}

export interface CurrentTournamentAction {
  kind:
    | 'none'
    | 'ready_up'
    | 'play_match'
    | 'rejoin_match'
    | 'waiting_for_opponent'
    | 'waiting_next_round'
    | 'view_results'
    | 'registered'
    | 'waiting_start'
    | 'view';
  label: string;
  tournamentId?: string;
  tournamentName?: string;
  tournamentStatus?: TournamentStatus | string;
  participantStatus?: TournamentParticipantStatus | string | null;
  finalPlacement?: number | null;
  matchId?: string | null;
  nakamaMatchId?: string | null;
  opponentName?: string;
  roundNumber?: number | null;
  matchNumber?: number | null;
  bracketType?: string | null;
  totalRounds?: number | null;
  userReady?: boolean;
  opponentReady?: boolean;
}

interface TournamentState {
  tournaments: Tournament[];
  currentTournament: TournamentDetail | null;
  myTournaments: Tournament[];
  spectatorMatches: SpectatorMatch[];
  lastStatusFilter: string | null;
  isLoading: boolean;
  isRefreshing: boolean; // Separate state for background refresh (no spinner)
  isSpectatorLoading: boolean;
  isActionLoading: boolean; // Register/withdraw/start/ready check actions
  error: string | null;
  spectatorError: string | null;
  actionError: string | null;
  myTournamentsError: string | null;

  // Ready check state
  readyCheck: ReadyCheckState | null;
  currentTournamentAction: CurrentTournamentAction | null;

  // Actions
  fetchTournaments: (status?: string, options?: { background?: boolean }) => Promise<void>;
  fetchTournamentDetails: (tournamentId: string, isRefresh?: boolean) => Promise<void>;
  fetchMyTournaments: (options?: { background?: boolean }) => Promise<void>;
  fetchCurrentTournamentAction: (options?: { background?: boolean }) => Promise<CurrentTournamentAction | null>;
  fetchSpectatorMatches: (options?: { background?: boolean }) => Promise<void>;
  registerForTournament: (tournamentId: string) => Promise<boolean>;
  withdrawFromTournament: (tournamentId: string) => Promise<boolean>;
  startTournamentMatch: (tournamentId: string, matchId: string) => Promise<string | null>;
  initiateReadyCheck: (tournamentId: string, matchId: string, opponentName: string) => void;
  confirmReady: () => Promise<boolean>;
  cancelReadyCheck: (skipServer?: boolean) => void;
  handleOpponentReady: (nakamaMatchId?: string | null) => void;
  handleOpponentCancelled: () => void;
  clearActionError: () => void;
  reset: () => void;
}

// Ready check timeout - 60 seconds
const READY_CHECK_TIMEOUT_MS = 60 * 1000;
const ACTIVE_MATCH_RECOVERY_ATTEMPTS = 18;
const ACTIVE_MATCH_RECOVERY_DELAY_MS = 500;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const hasMatchStartRaceError = (message: string): boolean => {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('currently being started') ||
    normalized.includes('currently being initialized') ||
    normalized.includes('match is not ready to start') ||
    normalized.includes('match is not in ready state') ||
    normalized.includes('both players must be ready')
  );
};

const recoverActiveTournamentMatchId = async (
  expectedMatchId: string,
  attempts = ACTIVE_MATCH_RECOVERY_ATTEMPTS
): Promise<string | null> => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const data = await nakama.rpc<{
        hasActiveMatch: boolean;
        initializing?: boolean;
        matchId?: string;
        nakamaMatchId?: string;
      }>('check_active_tournament_match', {});
      if (
        data.hasActiveMatch &&
        data.matchId === expectedMatchId &&
        data.nakamaMatchId &&
        !String(data.nakamaMatchId).startsWith('__starting__:')
      ) {
        return data.nakamaMatchId;
      }
    } catch {
      // Ignore transient polling errors; continue retry loop.
    }
    if (attempt < attempts - 1) {
      await sleep(ACTIVE_MATCH_RECOVERY_DELAY_MS);
    }
  }
  return null;
};

export const useTournamentStore = create<TournamentState>((set, get) => ({
  tournaments: [],
  currentTournament: null,
  myTournaments: [],
  spectatorMatches: [],
  lastStatusFilter: null,
  isLoading: false,
  isRefreshing: false,
  isSpectatorLoading: false,
  isActionLoading: false,
  error: null,
  spectatorError: null,
  actionError: null,
  myTournamentsError: null,
  readyCheck: null,
  currentTournamentAction: null,

  fetchTournaments: async (status?: string, options?: { background?: boolean }) => {
    const isBackground = options?.background === true;
    const normalizedStatus = status && status.length > 0 ? status : null;
    try {
      if (!isBackground) {
        set({ isLoading: true, error: null, lastStatusFilter: normalizedStatus });
      } else {
        set({ lastStatusFilter: normalizedStatus });
      }
      const data = await nakama.rpc<{ tournaments: Tournament[] }>('get_tournaments', {
        status: normalizedStatus || undefined,
        limit: 50,
      });
      set({ tournaments: data.tournaments || [], isLoading: false });
    } catch (error) {
      console.error('Error fetching tournaments:', error);
      if (!isBackground) {
        set({ error: 'Failed to load tournaments', isLoading: false });
      } else {
        set({ isLoading: false });
      }
    }
  },

  fetchTournamentDetails: async (tournamentId: string, isRefresh = false) => {
    try {
      // Use isRefreshing for background refresh (no spinner), isLoading for initial load
      if (isRefresh) {
        set({ isRefreshing: true });
      } else {
        set((state) => ({
          isLoading: true,
          error: null,
          currentTournament:
            state.currentTournament?.tournament.id === tournamentId
              ? state.currentTournament
              : null,
        }));
      }
      const data = await nakama.rpc<TournamentDetail>('get_tournament_details', { tournamentId });
      set({ currentTournament: data, isLoading: false, isRefreshing: false });
    } catch (error) {
      console.error('Error fetching tournament details:', error);
      if (isRefresh) {
        // Silent fail on refresh - don't show error
        set({ isRefreshing: false });
      } else {
        set({ error: 'Failed to load tournament', isLoading: false });
      }
    }
  },

  fetchMyTournaments: async (options?: { background?: boolean }) => {
    const isBackground = options?.background === true;
    try {
      if (!isBackground) {
        set({ myTournamentsError: null });
      }
      const data = await nakama.rpc<{ tournaments: Tournament[] }>('get_my_tournaments', {});
      set({ myTournaments: data.tournaments || [] });
    } catch (error) {
      console.error('Error fetching my tournaments:', error);
      if (!isBackground) {
        set({
          myTournamentsError: error instanceof Error ? error.message : 'Failed to load your tournaments',
        });
      }
    }
  },

  fetchCurrentTournamentAction: async (options?: { background?: boolean }) => {
    const isBackground = options?.background === true;
    try {
      const data = await nakama.rpc<{ action?: CurrentTournamentAction }>('get_current_tournament_action', {});
      const action = data.action || null;
      set({ currentTournamentAction: action });
      return action;
    } catch (error) {
      if (!isBackground) {
        console.error('Error fetching current tournament action:', error);
      }
      set({ currentTournamentAction: null });
      return null;
    }
  },

  fetchSpectatorMatches: async (options?: { background?: boolean }) => {
    const isBackground = options?.background === true;
    try {
      if (!isBackground) {
        set({ isSpectatorLoading: true, spectatorError: null });
      }
      const data = await nakama.rpc<{ matches: SpectatorMatch[] }>('get_spectator_matches', {});
      set({ spectatorMatches: data.matches || [], isSpectatorLoading: false });
    } catch (error) {
      console.error('Error fetching spectator matches:', error);
      if (!isBackground) {
        set({
          spectatorMatches: [],
          isSpectatorLoading: false,
          spectatorError: error instanceof Error ? error.message : 'Failed to load live matches',
        });
      } else {
        set({ isSpectatorLoading: false });
      }
    }
  },

  registerForTournament: async (tournamentId: string) => {
    // Capture previous state for rollback
    const prevState = get();
    const prevCurrentTournament = prevState.currentTournament;
    const prevTournaments = prevState.tournaments;
    const prevMyTournaments = prevState.myTournaments;

    try {
      set({ isActionLoading: true, actionError: null });

      // Optimistic update BEFORE RPC for responsive UI
      set((state) => {
        const markRegistered = (tournament: Tournament) => {
          if (tournament.id !== tournamentId || tournament.isRegistered) return tournament;
          const nextRegisteredCount =
            typeof tournament.registeredCount === 'number' && Number.isFinite(tournament.registeredCount)
              ? tournament.registeredCount + 1
              : tournament.participantCount + 1;
          return {
            ...tournament,
            isRegistered: true,
            participantCount: tournament.participantCount + 1,
            registeredCount: nextRegisteredCount,
          };
        };

        const updatedTournaments = state.tournaments.map(markRegistered);
        const updatedMyTournaments = state.myTournaments.map(markRegistered);

        const hasInMyTournaments = state.myTournaments.some(t => t.id === tournamentId);
        let nextMyTournaments = updatedMyTournaments;
        if (!hasInMyTournaments) {
          const sourceTournament =
            state.tournaments.find(t => t.id === tournamentId) ||
            state.currentTournament?.tournament ||
            null;
          if (sourceTournament) {
            nextMyTournaments = [
              markRegistered(sourceTournament),
              ...updatedMyTournaments,
            ];
          }
        }

        let nextCurrentTournament = state.currentTournament;
        if (state.currentTournament?.tournament.id === tournamentId) {
          const currentTournament = state.currentTournament.tournament;
          nextCurrentTournament = {
            ...state.currentTournament,
            isRegistered: true,
            tournament: markRegistered(currentTournament),
          };
        }

        return {
          tournaments: updatedTournaments,
          myTournaments: nextMyTournaments,
          currentTournament: nextCurrentTournament,
        };
      });

      await nakama.rpc('register_for_tournament', { tournamentId });
      set({ isActionLoading: false });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to register';
      console.error('Error registering for tournament:', error);
      // Rollback optimistic update on failure
      set({
        actionError: message,
        isActionLoading: false,
        currentTournament: prevCurrentTournament,
        tournaments: prevTournaments,
        myTournaments: prevMyTournaments,
      });
      return false;
    }
  },

  withdrawFromTournament: async (tournamentId: string) => {
    try {
      set({ isActionLoading: true, actionError: null });
      await nakama.rpc('withdraw_from_tournament', { tournamentId });

      // Update local state immediately for responsive UI
      set((state) => {
        const markWithdrawn = (tournament: Tournament) => {
          if (tournament.id !== tournamentId || !tournament.isRegistered) return tournament;
          const nextRegisteredCount =
            typeof tournament.registeredCount === 'number' && Number.isFinite(tournament.registeredCount)
              ? Math.max(0, tournament.registeredCount - 1)
              : Math.max(0, tournament.participantCount - 1);
          return {
            ...tournament,
            isRegistered: false,
            participantCount: Math.max(0, tournament.participantCount - 1),
            registeredCount: nextRegisteredCount,
          };
        };

        let nextCurrentTournament = state.currentTournament;
        if (state.currentTournament?.tournament.id === tournamentId) {
          nextCurrentTournament = {
            ...state.currentTournament,
            isRegistered: false,
            userParticipant: null,
            tournament: markWithdrawn(state.currentTournament.tournament),
          };
        }

        return {
          tournaments: state.tournaments.map(markWithdrawn),
          myTournaments: state.myTournaments.filter(t => t.id !== tournamentId),
          currentTournament: nextCurrentTournament,
          isActionLoading: false,
        };
      });

      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to withdraw';
      console.error('Error withdrawing from tournament:', error);
      set({ actionError: message, isActionLoading: false });
      return false;
    }
  },

  startTournamentMatch: async (tournamentId: string, matchId: string) => {
    try {
      set({ isActionLoading: true, actionError: null });
      const data = await nakama.rpc<{
        matchId: string;
        startedAt?: string | null;
        alreadyInProgress?: boolean;
      }>('start_tournament_match', {
        tournamentId,
        matchId,
      });

      // Update match status in local state
      set((state) => {
        if (state.currentTournament?.tournament.id === tournamentId) {
          const updatedMatches = state.currentTournament.matches.map((m) =>
            m.id === matchId
              ? {
                  ...m,
                  status: 'in_progress' as TournamentMatchStatus,
                  startedAt: data.startedAt ?? m.startedAt ?? null,
                  nakamaMatchId: data.matchId || null,
                }
              : m
          );
          return {
            currentTournament: {
              ...state.currentTournament,
              matches: updatedMatches,
            },
            isActionLoading: false,
          };
        }
        return { isActionLoading: false };
      });

      return data.matchId || null;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start match';
      console.error('Error starting tournament match:', error);

      if (hasMatchStartRaceError(message)) {
        const recoveredMatchId = await recoverActiveTournamentMatchId(matchId);
        if (recoveredMatchId) {
          set((state) => {
            if (state.currentTournament?.tournament.id === tournamentId) {
              const updatedMatches = state.currentTournament.matches.map((m) =>
                m.id === matchId
                  ? {
                      ...m,
                      status: 'in_progress' as TournamentMatchStatus,
                      nakamaMatchId: recoveredMatchId,
                      startedAt: m.startedAt ?? new Date().toISOString(),
                    }
                  : m
              );
              return {
                currentTournament: {
                  ...state.currentTournament,
                  matches: updatedMatches,
                },
                isActionLoading: false,
                actionError: null,
              };
            }
            return { isActionLoading: false, actionError: null };
          });
          return recoveredMatchId;
        }
      }

      set({ actionError: message, isActionLoading: false });
      return null;
    }
  },

  // Ready check actions
  initiateReadyCheck: (tournamentId: string, matchId: string, opponentName: string) => {
    set({
      readyCheck: {
        matchId,
        tournamentId,
        opponentName,
        userReady: false,
        opponentReady: false,
        startedAt: Date.now(),
        timeoutMs: READY_CHECK_TIMEOUT_MS,
      },
    });
  },

  confirmReady: async () => {
    const { readyCheck } = get();
    if (!readyCheck) return false;

    try {
      set({ actionError: null });
      const result = await nakama.rpc<{
        bothReady?: boolean;
        nakamaMatchId?: string | null;
      }>('tournament_ready_check', {
        tournamentId: readyCheck.tournamentId,
        matchId: readyCheck.matchId,
        ready: true,
      });

      set({
        readyCheck: {
          ...readyCheck,
          userReady: true,
          opponentReady: result?.bothReady ? true : readyCheck.opponentReady,
          nakamaMatchId: result?.nakamaMatchId || readyCheck.nakamaMatchId || null,
        },
      });

      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to confirm ready';
      console.error('Error confirming ready:', error);

      if (hasMatchStartRaceError(message)) {
        const recoveredMatchId = await recoverActiveTournamentMatchId(readyCheck.matchId, 10);
        if (recoveredMatchId) {
          set({
            actionError: null,
            readyCheck: {
              ...readyCheck,
              userReady: true,
              opponentReady: true,
            },
          });
          return true;
        }
      }

      set({ actionError: message });
      return false;
    }
  },

  cancelReadyCheck: (skipServer = false) => {
    const { readyCheck } = get();
    if (readyCheck && !skipServer) {
      // Notify server that user cancelled
      nakama.rpc('tournament_ready_check', {
        tournamentId: readyCheck.tournamentId,
        matchId: readyCheck.matchId,
        ready: false,
      }).catch(console.error);
    }
    set({ readyCheck: null });
  },

  handleOpponentReady: (nakamaMatchId?: string | null) => {
    const { readyCheck } = get();
    if (readyCheck) {
      set({
        readyCheck: {
          ...readyCheck,
          opponentReady: true,
          nakamaMatchId: nakamaMatchId || readyCheck.nakamaMatchId || null,
        },
      });
    }
  },

  handleOpponentCancelled: () => {
    const { readyCheck } = get();
    if (readyCheck) {
      set({
        readyCheck: {
          ...readyCheck,
          opponentReady: false,
          nakamaMatchId: null,
        },
      });
    }
  },

  clearActionError: () => {
    set({ actionError: null });
  },

  reset: () => {
    set({
      tournaments: [],
      currentTournament: null,
      myTournaments: [],
      spectatorMatches: [],
      lastStatusFilter: null,
      isLoading: false,
      isRefreshing: false,
      isSpectatorLoading: false,
      isActionLoading: false,
      error: null,
      spectatorError: null,
      actionError: null,
      myTournamentsError: null,
      readyCheck: null,
      currentTournamentAction: null,
    });
  },
}));
