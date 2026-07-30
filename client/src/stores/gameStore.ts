// Game and Matchmaking Store
import { create } from 'zustand';
import nakama, {
  type MatchmakerMatched,
  type QuestionData,
  type AnswerRevealData,
  type MatchEndData,
  type ConnectionState,
  type MatchPacingData,
} from '../shared/lib/nakama';
import { gameSounds } from '../lib/audio';
import { notifyIfAllowed } from '../lib/notifications';
import { formatQuizDisplayName } from '../lib/utils/quizDisplayName';
import { useSettingsStore } from './settingsStore';
import { useProfileStore } from './profileStore';
import { useLeaderboardStore } from './leaderboardStore';
import { useCategoryStore } from './categoryStore';

const MATCHMAKING_BASE_RANGE = 100;
const MATCHMAKING_EXPANSION = [
  { afterMs: 10000, range: 200, useRegion: true },
  { afterMs: 20000, range: 400, useRegion: true },
  { afterMs: 30000, range: 800, useRegion: false },
  { afterMs: 45000, range: 1200, useRegion: false },
];
const STRICT_SELECTION_BROADEN_TIMEOUT_MS = 30000;
const STRICT_SELECTION_BROADEN_RANGE = 800;
const BOT_MATCH_TIMEOUT_MS = 60000;
export const DISCONNECT_GRACE_MS = 60000;
const MANUAL_RECONNECT_COOLDOWN_MS = 2000;
const MANUAL_RECONNECT_WINDOW_MS = DISCONNECT_GRACE_MS;
const MATCH_RESUME_TTL_MS = MANUAL_RECONNECT_WINDOW_MS;
const SURRENDER_SEND_TIMEOUT_MS = 1200;

const MATCH_STORAGE_KEY = 'iqb:active_match';
const TOURNAMENT_REJOIN_SUPPRESS_KEY = 'iqb:tournament_rejoin_suppress';
const TOURNAMENT_REJOIN_SUPPRESS_MS = 10 * 60 * 1000;

export interface GameMatchPacing {
  preset: string;
  countdownSeconds: number;
  revealDelayMs: number;
  revealSuspenseMs: number;
  revealRevealMs: number;
  revealEffectsMs: number;
  revealScoresMs: number;
  roundPulseEnabled: boolean;
  roundPulseStartDelayMs: number;
  roundPulseCompleteDelayMs: number;
}

export const DEFAULT_MATCH_PACING: GameMatchPacing = {
  preset: 'classic',
  countdownSeconds: 3,
  revealDelayMs: 5000,
  revealSuspenseMs: 500,
  revealRevealMs: 1300,
  revealEffectsMs: 2000,
  revealScoresMs: 2000,
  roundPulseEnabled: true,
  roundPulseStartDelayMs: 300,
  roundPulseCompleteDelayMs: 1200,
};

const clampWhole = (value: unknown, fallback: number, minValue: number, maxValue: number): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const rounded = Math.floor(parsed);
  if (rounded < minValue) return minValue;
  if (rounded > maxValue) return maxValue;
  return rounded;
};

const normalizeMatchPacing = (
  incoming?: MatchPacingData | null,
  fallback: GameMatchPacing = DEFAULT_MATCH_PACING
): GameMatchPacing => {
  const source = incoming && typeof incoming === 'object' ? incoming : {};
  return {
    preset: typeof source.preset === 'string' && source.preset.trim().length > 0
      ? source.preset.trim().toLowerCase()
      : fallback.preset,
    countdownSeconds: clampWhole(source.countdownSeconds, fallback.countdownSeconds, 0, 15),
    revealDelayMs: clampWhole(source.revealDelayMs, fallback.revealDelayMs, 0, 60000),
    revealSuspenseMs: clampWhole(source.revealSuspenseMs, fallback.revealSuspenseMs, 0, 60000),
    revealRevealMs: clampWhole(source.revealRevealMs, fallback.revealRevealMs, 0, 60000),
    revealEffectsMs: clampWhole(source.revealEffectsMs, fallback.revealEffectsMs, 0, 60000),
    revealScoresMs: clampWhole(source.revealScoresMs, fallback.revealScoresMs, 0, 60000),
    roundPulseEnabled: typeof source.roundPulseEnabled === 'boolean'
      ? source.roundPulseEnabled
      : fallback.roundPulseEnabled,
    roundPulseStartDelayMs: clampWhole(source.roundPulseStartDelayMs, fallback.roundPulseStartDelayMs, 0, 60000),
    roundPulseCompleteDelayMs: clampWhole(source.roundPulseCompleteDelayMs, fallback.roundPulseCompleteDelayMs, 0, 60000),
  };
};

type SuppressedTournamentRejoin = {
  matchId: string;
  suppressedAt: number;
  suppressUntil: number;
};

export type StoredMatchInfo = {
  matchId: string;
  token?: string | null;
  metadata?: Record<string, unknown> | null;
  userId?: string | null;
  savedAt: number;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const getSessionUserId = (): string | null => {
  const session = nakama.getSession();
  return session?.user_id || null;
};

export const loadStoredMatch = (expectedUserId?: string | null): StoredMatchInfo | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(MATCH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredMatchInfo;
    const normalizedToken = parsed?.token == null
      ? null
      : (typeof parsed.token === 'string' ? parsed.token : null);
    const normalizedMetadata = parsed?.metadata == null
      ? null
      : (isPlainObject(parsed.metadata) ? parsed.metadata : null);
    const normalizedUserId = typeof parsed?.userId === 'string' && parsed.userId.length > 0
      ? parsed.userId
      : null;

    const isValid =
      !!parsed
      && typeof parsed.matchId === 'string'
      && parsed.matchId.length > 0
      && typeof parsed.savedAt === 'number'
      && Number.isFinite(parsed.savedAt);

    if (!isValid) {
      clearStoredMatch();
      return null;
    }

    if ((Date.now() - parsed.savedAt) > MATCH_RESUME_TTL_MS) {
      clearStoredMatch();
      return null;
    }

    if (parsed.token != null && normalizedToken === null) {
      clearStoredMatch();
      return null;
    }

    if (parsed.metadata != null && normalizedMetadata === null) {
      clearStoredMatch();
      return null;
    }

    if (expectedUserId && normalizedUserId !== expectedUserId) {
      clearStoredMatch();
      return null;
    }

    return {
      matchId: parsed.matchId,
      token: normalizedToken,
      metadata: normalizedMetadata,
      userId: normalizedUserId,
      savedAt: parsed.savedAt,
    };
  } catch {
    clearStoredMatch();
    return null;
  }
};

const saveStoredMatch = (matchId: string, token?: string | null, metadata?: Record<string, unknown> | null) => {
  if (typeof window === 'undefined') return;
  try {
    const userId = getSessionUserId();
    const payload: StoredMatchInfo = {
      matchId,
      token: token || null,
      metadata: metadata || null,
      userId,
      savedAt: Date.now(),
    };
    window.localStorage.setItem(MATCH_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore persistence errors
  }
};

export const clearStoredMatch = () => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(MATCH_STORAGE_KEY);
  } catch {
    // Ignore persistence errors
  }
};

const loadSuppressedTournamentRejoin = (): SuppressedTournamentRejoin | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(TOURNAMENT_REJOIN_SUPPRESS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SuppressedTournamentRejoin>;
    if (!parsed || typeof parsed !== 'object') {
      window.localStorage.removeItem(TOURNAMENT_REJOIN_SUPPRESS_KEY);
      return null;
    }
    if (typeof parsed.matchId !== 'string' || !parsed.matchId) {
      window.localStorage.removeItem(TOURNAMENT_REJOIN_SUPPRESS_KEY);
      return null;
    }
    const suppressUntil = Number(parsed.suppressUntil);
    const suppressedAt = Number(parsed.suppressedAt);
    if (!Number.isFinite(suppressUntil) || !Number.isFinite(suppressedAt)) {
      window.localStorage.removeItem(TOURNAMENT_REJOIN_SUPPRESS_KEY);
      return null;
    }
    if (suppressUntil <= Date.now()) {
      window.localStorage.removeItem(TOURNAMENT_REJOIN_SUPPRESS_KEY);
      return null;
    }
    return {
      matchId: parsed.matchId,
      suppressedAt,
      suppressUntil,
    };
  } catch {
    try {
      window.localStorage.removeItem(TOURNAMENT_REJOIN_SUPPRESS_KEY);
    } catch {
      // Ignore persistence errors
    }
    return null;
  }
};

export const suppressTournamentRejoinPrompt = (matchId: string, durationMs = TOURNAMENT_REJOIN_SUPPRESS_MS) => {
  if (typeof window === 'undefined') return;
  if (!matchId) return;
  const now = Date.now();
  const payload: SuppressedTournamentRejoin = {
    matchId,
    suppressedAt: now,
    suppressUntil: now + Math.max(1000, durationMs),
  };
  try {
    window.localStorage.setItem(TOURNAMENT_REJOIN_SUPPRESS_KEY, JSON.stringify(payload));
  } catch {
    // Ignore persistence errors
  }
};

export const shouldSuppressTournamentRejoinPrompt = (matchId?: string | null): boolean => {
  const suppressed = loadSuppressedTournamentRejoin();
  if (!suppressed) return false;
  if (!matchId) return true;
  return suppressed.matchId === matchId;
};

const storedMatch = loadStoredMatch(getSessionUserId());

const getReconnectErrorMessage = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  if (normalized.includes('match') && normalized.includes('not')) {
    return 'Match is no longer active.';
  }
  if (normalized.includes('forbidden') || normalized.includes('unauthorized')) {
    return 'You cannot rejoin this match.';
  }
  if (normalized.includes('connect') || normalized.includes('network') || normalized.includes('socket')) {
    return 'Network error. Please try again.';
  }
  return 'Failed to reconnect. Please try again.';
};

const isTerminalReconnectError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  return (
    (normalized.includes('match') && normalized.includes('not'))
    || normalized.includes('forbidden')
    || normalized.includes('unauthorized')
    || normalized.includes('permission denied')
  );
};

const getRegionBucket = (): string | undefined => {
  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    const parts = timeZone.split('/');
    if (!parts[0]) return undefined;
    return parts[0].toLowerCase();
  } catch {
    return undefined;
  }
};

let matchmakingTimers: Array<ReturnType<typeof setTimeout>> = [];

const clearMatchmakingTimers = () => {
  matchmakingTimers.forEach(clearTimeout);
  matchmakingTimers = [];
};

const requestTimeSyncSafe = () => {
  nakama.requestTimeSync().catch((error) => {
    console.warn('Time sync failed:', error);
  });
};

export type GamePhase =
  | 'idle'           // Not in queue or match
  | 'selecting'      // Selecting category
  | 'searching'      // In matchmaking queue
  | 'matched'        // Match found, joining
  | 'countdown'      // Match starting countdown
  | 'question'       // Answering a question
  | 'reveal'         // Answer revealed
  | 'ended'          // Match ended
  | 'error';         // Error state

export type QueueMode = 'ranked' | 'practice';

export interface Player {
  userId: string;
  username: string;
  mmr: number;
  rankTier: string;
  score: number;
  hasAnswered: boolean;
  connected: boolean;
  avatarUrl?: string;
}

export interface MmrChange {
  // Category MMR (for the specific category played)
  oldMmr: number;
  newMmr: number;
  change: number;
  // Global MMR (shown on global leaderboard)
  globalOldMmr?: number;
  globalNewMmr?: number;
  globalChange?: number;
  // Rank tier based on global MMR
  newRankTier: string;
}

export interface MatchResult {
  winnerId: string | null;
  isDraw: boolean;
  finalScores: Record<string, number>;
  mmrChanges: Record<string, MmrChange>;
  playerStats: Record<string, {
    correctAnswers: number;
    totalAnswers: number;
    averageTime: number;
  }>;
  reason?: string;
  mode?: QueueMode;
  practiceSummary?: {
    session: {
      score: number;
      correctAnswers: number;
      totalQuestions: number;
      accuracy: number;
    };
    overall: {
      sessionsPlayed: number;
      averageAccuracy: number;
    };
    category: {
      categoryKey: string;
      bestScore: number;
      sessionsPlayed: number;
      averageAccuracy: number;
    };
  };
}

export interface QuestionReviewItem {
  questionNumber: number;
  questionText: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  myAnswerIndex: number | null;
  myCorrect: boolean;
  myTimeMs: number | null;
  opponentAnswerIndex: number | null;
  opponentCorrect: boolean;
}

interface GameState {
  // Matchmaking state
  phase: GamePhase;
  queueParentCategory: string | null;
  queueSubcategories: string[]; // empty when all subcategories are allowed
  queueAllInCategory: boolean;
  queueMode: QueueMode;
  matchmakingRequested: boolean;
  searchStartTime: number | null;
  searchBroadenedToAllInCategory: boolean;
  matchmakerTicket: string | null;
  matchJoinInProgress: boolean;

  // Match state
  matchId: string | null;
  matchCategory: string | null; // Server-authoritative categoryKey used for questions/MMR
  matchMode: QueueMode | null;
  players: Player[];
  opponentId: string | null;
  countdown: number;
  matchPacing: GameMatchPacing;
  isSpectator: boolean;

  // Question state
  currentQuestion: QuestionData | null;
  selectedAnswer: number | null;
  answerSubmitted: boolean;
  questionTimeRemaining: number;
  questionStartServerMs: number | null;
  serverTimeOffsetMs: number | null;
  timeLimitMs: number;
  estimatedRttMs: number | null;

  // Reveal state
  lastReveal: AnswerRevealData | null;

  // Pending question (queued during reveal phase for smooth countdown transition)
  pendingQuestion: QuestionData | null;

  // Real-time opponent answer (for Beneficial Knowledge-style highlighting)
  opponentAnswerIndex: number | null;
  opponentAnswered: boolean;

  // Results state
  matchResult: MatchResult | null;
  questionHistory: QuestionReviewItem[];

  // Rematch state
  rematchRequested: boolean;
  opponentRematchRequested: boolean;
  rematchMatchId: string | null;
  rematchFailed: boolean;

  // Error state
  error: string | null;
  connectionState: ConnectionState;
  reconnectAttempt: number | null;
  reconnectMax: number | null;
  lastDisconnectAt: number | null;
  lastMatchId: string | null;
  lastMatchToken: string | null;
  lastMatchMetadata: Record<string, unknown> | null;
  lastMatchUserId: string | null;
  leftIntentionally: boolean;
  manualReconnectInProgress: boolean;
  manualReconnectError: string | null;
  lastManualReconnectAt: number | null;
  leavePromptOpen: boolean;

  // Actions
  selectCategory: (parentCategory: string, subcategories?: string[] | null, allInCategory?: boolean) => void;
  setQueueMode: (mode: QueueMode) => void;
  startSearching: () => Promise<void>;
  startPractice: () => Promise<void>;
  cancelSearching: () => Promise<void>;
  joinDirectMatch: (matchId: string, token?: string, options?: { spectator?: boolean }) => Promise<void>;
  submitAnswer: (answerIndex: number) => Promise<void>;
  playAgain: () => void;
  returnToHome: () => void;
  openLeavePrompt: () => void;
  closeLeavePrompt: () => void;
  confirmLeaveMatch: () => void;
  resetGame: () => void;
  manualReconnect: () => Promise<void>;
  autoRejoinMatch: () => Promise<void>;
  registerMatchCallbacks: () => void;
  requestRematch: () => Promise<void>;
  joinRematch: () => Promise<void>;
  consumePendingQuestion: () => void;
  _processQuestion: (data: QuestionData) => void;

  // Internal handlers (called by nakama event listeners)
  handleMatchFound: (data: MatchmakerMatched) => Promise<void>;
  handlePlayersJoined: (data: { players: Array<{ userId?: string; oderId?: string; username: string; mmr: number; rankTier: string; connected?: boolean; avatarUrl?: string }> }) => void;
  handleCountdown: (data: { countdown: number; category: string; parentCategory?: string | null; matchPacing?: MatchPacingData | null }) => void;
  handleQuestion: (data: QuestionData) => void;
  handlePlayerLeft: (data: { userId: string }) => void;
  handleOpponentAnswered: (data: { userId: string; answerIndex?: number }) => void;
  handleReveal: (data: AnswerRevealData) => void;
  handleMatchEnd: (data: MatchEndData) => void;
  handleDisconnect: () => void;
  handleReconnecting: (attempt: number, maxAttempts: number) => void;
  handleReconnected: () => void;
  handleReconnectFailed: () => void;
  handleTimeSync: (data: { clientTimeMs: number; serverReceiveTimeMs: number; serverSendTimeMs: number }) => void;
  handleError: (error: Error) => void;
  handleRematchRequested: (data: { requesterId: string; requesterUsername: string }) => void;
  handleRematchMatchCreated: (data: { matchId: string; category: string }) => void;
  handleRematchFailed: (data: { error: string }) => void;
}

export const useGameStore = create<GameState>((set, get) => ({
  // Initial state
  phase: 'idle',
  queueParentCategory: null,
  queueSubcategories: [],
  queueAllInCategory: true,
  queueMode: 'ranked',
  matchmakingRequested: false,
  searchStartTime: null,
  searchBroadenedToAllInCategory: false,
  matchmakerTicket: null,
  matchJoinInProgress: false,

  matchId: null,
  matchCategory: null,
  matchMode: null,
  players: [],
  opponentId: null,
  countdown: 3,
  matchPacing: DEFAULT_MATCH_PACING,
  isSpectator: false,

  currentQuestion: null,
  selectedAnswer: null,
  answerSubmitted: false,
  questionTimeRemaining: 15,
  questionStartServerMs: null,
  serverTimeOffsetMs: null,
  timeLimitMs: 15000,
  estimatedRttMs: null,

  lastReveal: null,
  pendingQuestion: null,
  opponentAnswerIndex: null,
  opponentAnswered: false,
  matchResult: null,
  questionHistory: [],
  rematchRequested: false,
  opponentRematchRequested: false,
  rematchMatchId: null,
  rematchFailed: false,
  error: null,
  connectionState: 'disconnected',
  reconnectAttempt: null,
  reconnectMax: null,
  lastDisconnectAt: null,
  lastMatchId: storedMatch?.matchId || null,
  lastMatchToken: storedMatch?.token || null,
  lastMatchMetadata: storedMatch?.metadata || null,
  lastMatchUserId: storedMatch?.userId || null,
  leftIntentionally: false,
  manualReconnectInProgress: false,
  manualReconnectError: null,
  lastManualReconnectAt: null,
  leavePromptOpen: false,

  // Actions
  selectCategory: (parentCategory: string, subcategories?: string[] | null, allInCategory?: boolean) => {
    const normalizedSubcategories = Array.from(
      new Set(
        (subcategories || [])
          .map((sub) => (typeof sub === 'string' ? sub.trim() : ''))
          .filter((sub) => sub.length > 0)
      )
    );
    const useAllInCategory = allInCategory === true || normalizedSubcategories.length === 0;
    set({
      queueParentCategory: parentCategory,
      queueSubcategories: useAllInCategory ? [] : normalizedSubcategories,
      queueAllInCategory: useAllInCategory,
      matchmakingRequested: false,
      searchBroadenedToAllInCategory: false,
      phase: 'selecting',
      matchCategory: null,
      matchPacing: DEFAULT_MATCH_PACING,
      error: null,
    });
  },

  setQueueMode: (mode: QueueMode) => {
    set({ queueMode: mode });
  },

  registerMatchCallbacks: () => {
    const state = get();
    nakama.setMatchEventCallbacks({
      onMatchmakerMatched: state.handleMatchFound,
      onPlayerJoined: state.handlePlayersJoined,
      onMatchStarting: state.handleCountdown,
      onPlayerLeft: state.handlePlayerLeft,
      onQuestion: state.handleQuestion,
      onOpponentAnswered: state.handleOpponentAnswered,
      onAnswerReveal: state.handleReveal,
      onMatchEnd: state.handleMatchEnd,
      onTimeSync: state.handleTimeSync,
      onRematchRequested: state.handleRematchRequested,
      onRematchMatchCreated: state.handleRematchMatchCreated,
      onRematchFailed: state.handleRematchFailed,
      onDisconnect: state.handleDisconnect,
      onReconnecting: state.handleReconnecting,
      onReconnected: state.handleReconnected,
      onReconnectFailed: state.handleReconnectFailed,
      onError: state.handleError,
    });
  },

  startSearching: async () => {
    const state = get();
    const queueParentCategory = state.queueParentCategory;
    let queueSubcategories = state.queueSubcategories.slice();
    let queueAllInCategory = state.queueAllInCategory;

    if (!queueParentCategory) {
      set({ error: 'Please select a category first', phase: 'error' });
      return;
    }

    try {
      // Revalidate queue selection against the latest active categories from server.
      try {
        await useCategoryStore.getState().fetchCategories({ force: true });
      } catch {
        // Continue with cached categories if refresh fails.
      }

      const availableCategories = useCategoryStore.getState().categories;
      if (availableCategories.length === 0) {
        set({
          phase: 'error',
          error: 'No active categories available. Please create categories in admin panel.',
          matchmakingRequested: false,
          matchJoinInProgress: false,
        });
        return;
      }

      const availableParents = availableCategories.filter((category) => category.parentId == null);
      const validParent = availableCategories.some((category) => category.id === queueParentCategory && category.parentId == null);
      if (!validParent) {
        const fallbackParent = (availableParents[0]?.id ?? availableCategories[0].id);
        set({
          queueParentCategory: fallbackParent,
          queueSubcategories: [],
          queueAllInCategory: true,
          phase: 'error',
          error: 'Selected category is no longer available. Please choose a category again.',
          matchmakingRequested: false,
          matchJoinInProgress: false,
        });
        return;
      }

      if (!queueAllInCategory) {
        const validSubcategories = queueSubcategories.filter((subId) => (
          availableCategories.some((category) => category.id === subId && category.parentId === queueParentCategory)
        ));
        queueSubcategories = validSubcategories;
        queueAllInCategory = validSubcategories.length === 0;
      }

      clearMatchmakingTimers();

      // Make sure socket is connected
      if (!nakama.getSocket() || nakama.getConnectionState() !== 'connected') {
        await nakama.connect();
      }
      set({ connectionState: nakama.getConnectionState() });

      // Set up event callbacks
      get().registerMatchCallbacks();

      // Enter searching immediately to avoid dropping a fast match-found event.
      set({
        phase: 'searching',
        queueParentCategory,
        queueSubcategories,
        queueAllInCategory,
        queueMode: 'ranked',
        matchmakingRequested: true,
        searchStartTime: Date.now(),
        searchBroadenedToAllInCategory: false,
        matchmakerTicket: null,
        matchJoinInProgress: false,
        error: null,
        leftIntentionally: false,
        lastDisconnectAt: null,
        manualReconnectError: null,
        leavePromptOpen: false,
        isSpectator: false,
        lastMatchMetadata: null,
        matchCategory: null,
        matchPacing: DEFAULT_MATCH_PACING,
        matchMode: 'ranked',
      });

      // Get user's MMR for the selected category
      let mmr = 1000;
      const authResponse = nakama.getAuthResponse();
      if (authResponse?.profile?.mmr) {
        mmr = authResponse.profile.mmr;
      }

      if (!queueAllInCategory && queueSubcategories.length > 0) {
        const mmrCategory = queueSubcategories[0];
        try {
          const categoryMmr = await nakama.rpc<{ mmr: number }>('get_category_mmr', {
            category: mmrCategory,
          });
          if (typeof categoryMmr.mmr === 'number') {
            mmr = categoryMmr.mmr;
          }
        } catch (mmrError) {
          console.warn('Falling back to global MMR for matchmaking:', mmrError);
        }
      }

      const region = getRegionBucket();
      const startedWithStrictSelection = !queueAllInCategory && queueSubcategories.length > 0;

      const findMatchForCurrentQueue = async (range: number, regionOverride?: string) => {
        const latest = get();
        if (!latest.matchmakingRequested || latest.phase !== 'searching' || !latest.queueParentCategory) {
          return null;
        }
        return nakama.findMatch(
          latest.queueParentCategory,
          mmr,
          range,
          regionOverride,
          latest.queueSubcategories,
          latest.queueAllInCategory
        );
      };

      // Start matchmaking
      const ticket = await findMatchForCurrentQueue(MATCHMAKING_BASE_RANGE, region);
      if (!ticket) return;

      // User may have canceled while request was in flight.
      const latest = get();
      if (!latest.matchmakingRequested || latest.phase !== 'searching') {
        await nakama.cancelMatchmaking();
        return;
      }

      set({
        matchmakerTicket: ticket.ticket,
      });

      MATCHMAKING_EXPANSION.forEach((step) => {
        const timer = setTimeout(() => {
          if (get().phase !== 'searching') return;
          (async () => {
            try {
              const expandedRegion = step.useRegion ? region : undefined;
              const expandedTicket = await findMatchForCurrentQueue(step.range, expandedRegion);
              if (!expandedTicket) return;
              set({ matchmakerTicket: expandedTicket.ticket });
            } catch (expandError) {
              console.warn('Error expanding matchmaking:', expandError);
            }
          })();
        }, step.afterMs);

        matchmakingTimers.push(timer);
      });

      if (startedWithStrictSelection) {
        const broadenTimer = setTimeout(() => {
          const latest = get();
          if (
            latest.phase !== 'searching'
            || !latest.matchmakingRequested
            || !latest.queueParentCategory
            || latest.queueAllInCategory
          ) {
            return;
          }

          set({
            queueSubcategories: [],
            queueAllInCategory: true,
            searchBroadenedToAllInCategory: true,
          });

          (async () => {
            try {
              const broadenedTicket = await findMatchForCurrentQueue(STRICT_SELECTION_BROADEN_RANGE);
              if (!broadenedTicket) return;
              set({ matchmakerTicket: broadenedTicket.ticket });
            } catch (broadenError) {
              console.warn('Error broadening strict matchmaking search:', broadenError);
            }
          })();
        }, STRICT_SELECTION_BROADEN_TIMEOUT_MS);

        matchmakingTimers.push(broadenTimer);
      }

      const botTimer = setTimeout(() => {
        const state = get();
        if (state.phase !== 'searching' || state.matchJoinInProgress || !state.queueParentCategory) return;
        (async () => {
          try {
            const botParentCategory = state.queueParentCategory;
            if (!botParentCategory) return;
            const botSubcategories = state.queueSubcategories.slice();
            const botAllInCategory = state.queueAllInCategory;
            set({ matchJoinInProgress: true, matchmakerTicket: null, matchmakingRequested: false });
            clearMatchmakingTimers();
            await nakama.cancelMatchmaking();
            const matchId = await nakama.startBotMatch(botParentCategory, botSubcategories, botAllInCategory);
            set({
              phase: 'matched',
              matchmakerTicket: null,
              matchmakingRequested: false,
              queueMode: 'ranked',
              matchMode: 'ranked',
            });
            set({
              lastMatchId: matchId,
              lastMatchToken: null,
              lastMatchMetadata: null,
              lastMatchUserId: getSessionUserId(),
              leftIntentionally: false,
              manualReconnectError: null,
              lastDisconnectAt: null,
              leavePromptOpen: false,
              isSpectator: false,
            });
            await nakama.joinMatch(matchId);
            set({ matchId, matchJoinInProgress: false });
            requestTimeSyncSafe();
          } catch (botError) {
            console.error('Error starting bot match:', botError);
            set({
              phase: 'error',
              error: botError instanceof Error ? botError.message : 'Failed to start bot match',
              matchJoinInProgress: false,
              matchmakingRequested: false,
            });
          }
        })();
      }, BOT_MATCH_TIMEOUT_MS);

      matchmakingTimers.push(botTimer);
    } catch (error) {
      console.error('Error starting matchmaking:', error);
      clearMatchmakingTimers();
      set({
        phase: 'error',
        error: error instanceof Error ? error.message : 'Failed to start matchmaking',
        matchJoinInProgress: false,
        matchmakingRequested: false,
      });
    }
  },

  startPractice: async () => {
    const state = get();
    const queueParentCategory = state.queueParentCategory;
    let queueSubcategories = state.queueSubcategories.slice();
    let queueAllInCategory = state.queueAllInCategory;

    if (!queueParentCategory) {
      set({ error: 'Please select a category first', phase: 'error' });
      return;
    }

    try {
      try {
        await useCategoryStore.getState().fetchCategories({ force: true });
      } catch {
        // Continue with cached categories if refresh fails.
      }

      const availableCategories = useCategoryStore.getState().categories;
      if (availableCategories.length === 0) {
        set({
          phase: 'error',
          error: 'No active categories available. Please create categories in admin panel.',
          matchmakingRequested: false,
          matchJoinInProgress: false,
        });
        return;
      }

      const availableParents = availableCategories.filter((category) => category.parentId == null);
      const validParent = availableCategories.some((category) => category.id === queueParentCategory && category.parentId == null);
      if (!validParent) {
        const fallbackParent = (availableParents[0]?.id ?? availableCategories[0].id);
        set({
          queueParentCategory: fallbackParent,
          queueSubcategories: [],
          queueAllInCategory: true,
          phase: 'error',
          error: 'Selected category is no longer available. Please choose a category again.',
          matchmakingRequested: false,
          matchJoinInProgress: false,
        });
        return;
      }

      if (!queueAllInCategory) {
        const validSubcategories = queueSubcategories.filter((subId) => (
          availableCategories.some((category) => category.id === subId && category.parentId === queueParentCategory)
        ));
        queueSubcategories = validSubcategories;
        queueAllInCategory = validSubcategories.length === 0;
      }

      clearMatchmakingTimers();
      await nakama.cancelMatchmaking();

      if (!nakama.getSocket() || nakama.getConnectionState() !== 'connected') {
        await nakama.connect();
      }
      set({ connectionState: nakama.getConnectionState() });

      get().registerMatchCallbacks();

      set({
        phase: 'matched',
        queueParentCategory,
        queueSubcategories,
        queueAllInCategory,
        queueMode: 'practice',
        matchmakingRequested: false,
        matchmakerTicket: null,
        searchStartTime: null,
        searchBroadenedToAllInCategory: false,
        matchJoinInProgress: true,
        error: null,
        leftIntentionally: false,
        lastDisconnectAt: null,
        manualReconnectError: null,
        leavePromptOpen: false,
        isSpectator: false,
        lastMatchMetadata: null,
        matchCategory: null,
        matchPacing: DEFAULT_MATCH_PACING,
        matchMode: 'practice',
      });

      const matchId = await nakama.startPracticeMatch(queueParentCategory, queueSubcategories, queueAllInCategory);
      set({
        lastMatchId: matchId,
        lastMatchToken: null,
        lastMatchMetadata: null,
        lastMatchUserId: getSessionUserId(),
        leftIntentionally: false,
        manualReconnectError: null,
        lastDisconnectAt: null,
        leavePromptOpen: false,
        isSpectator: false,
      });

      await nakama.joinMatch(matchId);
      set({ matchId, matchJoinInProgress: false });
      saveStoredMatch(matchId, null, null);
      requestTimeSyncSafe();
    } catch (error) {
      console.error('Error starting practice match:', error);
      clearStoredMatch();
      set({
        phase: 'error',
        error: error instanceof Error ? error.message : 'Failed to start practice match',
        matchJoinInProgress: false,
        matchmakingRequested: false,
      });
    }
  },

  cancelSearching: async () => {
    try {
      clearMatchmakingTimers();
      await nakama.cancelMatchmaking();
      set({
        phase: 'idle',
        matchmakingRequested: false,
        searchStartTime: null,
        searchBroadenedToAllInCategory: false,
        matchmakerTicket: null,
        matchCategory: null,
        matchId: null,
        matchMode: null,
        matchPacing: DEFAULT_MATCH_PACING,
        players: [],
        opponentId: null,
        matchJoinInProgress: false,
        leftIntentionally: true,
        lastMatchId: null,
        lastMatchToken: null,
        lastMatchMetadata: null,
        lastMatchUserId: null,
        isSpectator: false,
        lastDisconnectAt: null,
        manualReconnectError: null,
        manualReconnectInProgress: false,
        lastManualReconnectAt: null,
        leavePromptOpen: false,
      });
    } catch (error) {
      console.error('Error cancelling matchmaking:', error);
    }
  },

  joinDirectMatch: async (matchId: string, token?: string, options?: { spectator?: boolean }) => {
    const state = get();
    if (state.matchJoinInProgress) {
      return;
    }
    if (state.matchId === matchId) {
      if (state.isSpectator && options?.spectator !== true) {
        set({
          isSpectator: false,
          lastMatchMetadata: null,
        });
        saveStoredMatch(matchId, token || state.lastMatchToken || null, null);
      }
      return;
    }

    try {
      const isSpectatorJoin = options?.spectator === true;
      const metadata = isSpectatorJoin ? { role: 'spectator' } : undefined;

      // Make sure socket is connected (reconnect if needed)
      if (!nakama.getSocket() || nakama.getConnectionState() !== 'connected') {
        await nakama.connect();
      }
      set({ connectionState: nakama.getConnectionState() });

      // Set up event callbacks
      get().registerMatchCallbacks();

      set({
        phase: 'matched',
        matchmakingRequested: false,
        matchmakerTicket: null,
        matchJoinInProgress: true,
        lastMatchId: matchId,
        lastMatchToken: token || null,
        lastMatchMetadata: metadata || null,
        lastMatchUserId: getSessionUserId(),
        leftIntentionally: false,
        lastDisconnectAt: null,
        manualReconnectError: null,
        leavePromptOpen: false,
        isSpectator: isSpectatorJoin,
        matchMode: 'ranked',
      });

      await nakama.joinMatch(matchId, token, metadata);
      set({
        matchId,
        matchJoinInProgress: false,
        lastMatchId: matchId,
        lastMatchToken: token || null,
        lastMatchMetadata: metadata || null,
        lastMatchUserId: getSessionUserId(),
        leftIntentionally: false,
        manualReconnectError: null,
        lastDisconnectAt: null,
        leavePromptOpen: false,
        isSpectator: isSpectatorJoin,
        matchMode: 'ranked',
      });
      saveStoredMatch(matchId, token || null, metadata || null);
      requestTimeSyncSafe();
    } catch (error) {
      console.error('Error joining match:', error);
      clearStoredMatch();
      set({
        phase: 'error',
        error: error instanceof Error ? error.message : 'Failed to join match',
        matchJoinInProgress: false,
      });
      throw error;
    }
  },

  submitAnswer: async (answerIndex: number) => {
    const state = get();
    const { answerSubmitted, phase, currentQuestion, isSpectator } = state;

    // Prevent double submission with synchronous check
    if (isSpectator) return;
    if (answerSubmitted || phase !== 'question') return;

    const optionsCount = currentQuestion?.question.options?.length || 0;
    if (answerIndex < 0 || answerIndex >= optionsCount) {
      console.warn('Invalid answer index:', answerIndex);
      set({ error: 'Invalid answer selection' });
      return;
    }

    // Immediately lock to prevent race condition from rapid taps
    // Set selectedAnswer first for immediate visual feedback
    set({ selectedAnswer: answerIndex, answerSubmitted: true });
    gameSounds.onAnswerSelect();

    try {
      await nakama.submitAnswer(answerIndex);
    } catch (error) {
      console.error('Error submitting answer:', error);
      // On failure, allow retry by resetting answerSubmitted
      // Keep selectedAnswer so user can see what they tried to select
      set({
        answerSubmitted: false,
        error: 'Failed to submit answer. Tap again to retry.'
      });
    }
  },

  playAgain: () => {
    const { queueParentCategory, queueMode } = get();
    set({
      phase: 'selecting',
      matchmakingRequested: false,
      matchId: null,
      matchCategory: null,
      matchMode: null,
      matchPacing: DEFAULT_MATCH_PACING,
      players: [],
      opponentId: null,
      countdown: 3,
      currentQuestion: null,
      selectedAnswer: null,
      answerSubmitted: false,
      questionTimeRemaining: 15,
      questionStartServerMs: null,
      serverTimeOffsetMs: null,
      timeLimitMs: 15000,
      estimatedRttMs: null,
      lastReveal: null,
      pendingQuestion: null,
      opponentAnswerIndex: null,
      opponentAnswered: false,
      matchResult: null,
      questionHistory: [],
      rematchRequested: false,
      opponentRematchRequested: false,
      rematchMatchId: null,
      rematchFailed: false,
      error: null,
      connectionState: nakama.getConnectionState(),
      reconnectAttempt: null,
      reconnectMax: null,
      matchJoinInProgress: false,
      leavePromptOpen: false,
      isSpectator: false,
      lastMatchMetadata: null,
    });
    // Keep queued selection so user can quickly queue again
    if (queueParentCategory) {
      if (queueMode === 'practice') {
        void get().startPractice();
      } else {
        void get().startSearching();
      }
    }
  },

  returnToHome: () => {
    clearMatchmakingTimers();
    nakama.clearMatchEventCallbacks();
    void nakama.leaveMatch();
    clearStoredMatch();
    set({
      phase: 'idle',
      matchmakingRequested: false,
      matchCategory: null,
      searchStartTime: null,
      searchBroadenedToAllInCategory: false,
      matchmakerTicket: null,
      matchId: null,
      players: [],
      matchMode: null,
      matchPacing: DEFAULT_MATCH_PACING,
      opponentId: null,
      countdown: 3,
      currentQuestion: null,
      selectedAnswer: null,
      answerSubmitted: false,
      questionTimeRemaining: 15,
      questionStartServerMs: null,
      serverTimeOffsetMs: null,
      timeLimitMs: 15000,
      estimatedRttMs: null,
      lastReveal: null,
      pendingQuestion: null,
      opponentAnswerIndex: null,
      opponentAnswered: false,
      matchResult: null,
      questionHistory: [],
      error: null,
      connectionState: nakama.getConnectionState(),
      reconnectAttempt: null,
      reconnectMax: null,
      matchJoinInProgress: false,
      leftIntentionally: true,
      lastMatchId: null,
      lastMatchToken: null,
      lastMatchMetadata: null,
      lastMatchUserId: null,
      isSpectator: false,
      lastDisconnectAt: null,
      manualReconnectError: null,
      manualReconnectInProgress: false,
      lastManualReconnectAt: null,
      leavePromptOpen: false,
    });
  },

  openLeavePrompt: () => {
    set({ leavePromptOpen: true, manualReconnectError: null });
  },

  closeLeavePrompt: () => {
    set({ leavePromptOpen: false, manualReconnectError: null });
  },

  confirmLeaveMatch: () => {
    const { connectionState, matchId, isSpectator } = get();
    set({ leavePromptOpen: false, manualReconnectError: null, leftIntentionally: true });
    if (matchId && !isSpectator) {
      suppressTournamentRejoinPrompt(matchId);
    }

    const finalizeLeave = () => {
      clearStoredMatch();
      get().returnToHome();
    };

    if (connectionState === 'connected' && matchId && !isSpectator) {
      const surrenderTask = Promise.race([
        nakama.surrender(),
        new Promise<void>((_resolve, reject) => {
          setTimeout(() => reject(new Error('surrender_send_timeout')), SURRENDER_SEND_TIMEOUT_MS);
        }),
      ]);
      void surrenderTask
        .catch((error) => {
          console.warn('Surrender failed:', error);
        })
        .finally(finalizeLeave);
      return;
    }

    finalizeLeave();
  },

  resetGame: () => {
    clearMatchmakingTimers();
    nakama.clearMatchEventCallbacks();
    void nakama.leaveMatch();
    clearStoredMatch();
    if (nakama.isInMatchmaking()) {
      nakama.cancelMatchmaking();
    }
    set({
      phase: 'idle',
      queueParentCategory: null,
      queueSubcategories: [],
      queueAllInCategory: true,
      queueMode: 'ranked',
      matchmakingRequested: false,
      searchStartTime: null,
      searchBroadenedToAllInCategory: false,
      matchmakerTicket: null,
      matchId: null,
      matchCategory: null,
      matchMode: null,
      matchPacing: DEFAULT_MATCH_PACING,
      players: [],
      opponentId: null,
      countdown: 3,
      currentQuestion: null,
      selectedAnswer: null,
      answerSubmitted: false,
      questionTimeRemaining: 15,
      questionStartServerMs: null,
      serverTimeOffsetMs: null,
      timeLimitMs: 15000,
      estimatedRttMs: null,
      lastReveal: null,
      pendingQuestion: null,
      opponentAnswerIndex: null,
      opponentAnswered: false,
      matchResult: null,
      questionHistory: [],
      rematchRequested: false,
      opponentRematchRequested: false,
      rematchMatchId: null,
      rematchFailed: false,
      error: null,
      connectionState: nakama.getConnectionState(),
      reconnectAttempt: null,
      reconnectMax: null,
      matchJoinInProgress: false,
      leftIntentionally: true,
      lastMatchId: null,
      lastMatchToken: null,
      lastMatchMetadata: null,
      lastMatchUserId: null,
      isSpectator: false,
      lastDisconnectAt: null,
      manualReconnectError: null,
      manualReconnectInProgress: false,
      lastManualReconnectAt: null,
      leavePromptOpen: false,
    });
  },

  autoRejoinMatch: async () => {
    const state = get();
    if (state.matchJoinInProgress || state.manualReconnectInProgress) return;
    const matchId = state.matchId || state.lastMatchId;
    if (!matchId) return;
    if (state.leftIntentionally) return;
    if (!nakama.isAuthenticated()) {
      set({ manualReconnectError: 'Session expired. Please reopen the app.' });
      return;
    }
    const sessionUserId = getSessionUserId();
    if (sessionUserId && state.lastMatchUserId !== sessionUserId) {
      clearStoredMatch();
      set({
        lastMatchId: null,
        lastMatchToken: null,
        lastMatchMetadata: null,
        lastMatchUserId: null,
        leftIntentionally: true,
        manualReconnectError: 'Stored match belongs to another account.',
      });
      return;
    }

    const currentMatchId = nakama.getCurrentMatchId();
    if (currentMatchId && currentMatchId === matchId) {
      set({
        matchId,
        lastMatchId: matchId,
        lastMatchUserId: sessionUserId,
        matchJoinInProgress: false,
        manualReconnectError: null,
        connectionState: nakama.getConnectionState(),
        leftIntentionally: false,
        lastDisconnectAt: null,
        leavePromptOpen: false,
      });
      requestTimeSyncSafe();
      return;
    }

    set({
      matchJoinInProgress: true,
      manualReconnectError: null,
      connectionState: nakama.getConnectionState(),
    });

    try {
      if (!nakama.getSocket() || nakama.getConnectionState() !== 'connected') {
        await nakama.connect();
      }
    } catch (error) {
      set({
        matchJoinInProgress: false,
        connectionState: 'disconnected',
        manualReconnectError: getReconnectErrorMessage(error),
      });
      return;
    }

    get().registerMatchCallbacks();

    try {
      await nakama.joinMatch(matchId, state.lastMatchToken || undefined, state.lastMatchMetadata || undefined);
      set({
        matchId,
        lastMatchId: matchId,
        lastMatchUserId: getSessionUserId(),
        matchJoinInProgress: false,
        manualReconnectError: null,
        connectionState: nakama.getConnectionState(),
        leftIntentionally: false,
        lastDisconnectAt: null,
        leavePromptOpen: false,
      });
      saveStoredMatch(matchId, state.lastMatchToken || null, state.lastMatchMetadata || null);
      requestTimeSyncSafe();
    } catch (error) {
      const reconnectError = getReconnectErrorMessage(error);
      const terminal = isTerminalReconnectError(error);
      if (terminal) {
        clearStoredMatch();
      }
      set({
        matchJoinInProgress: false,
        manualReconnectError: reconnectError,
        connectionState: nakama.getConnectionState() === 'connected' ? 'connected' : 'disconnected',
        ...(terminal ? {
          lastMatchId: null,
          lastMatchToken: null,
          lastMatchMetadata: null,
          lastMatchUserId: null,
          leftIntentionally: true,
          lastDisconnectAt: null,
          leavePromptOpen: false,
        } : {}),
      });
    }
  },

  manualReconnect: async () => {
    const state = get();
    if (state.manualReconnectInProgress) return;
    if (state.matchJoinInProgress) {
      set({ manualReconnectError: 'Match join already in progress.' });
      return;
    }

    const now = Date.now();
    if (state.lastManualReconnectAt && now - state.lastManualReconnectAt < MANUAL_RECONNECT_COOLDOWN_MS) {
      set({ manualReconnectError: 'Please wait a moment and try again.' });
      return;
    }

    const matchId = state.matchId || state.lastMatchId;
    if (!matchId) {
      set({ manualReconnectError: 'No active match to reconnect to.' });
      return;
    }

    if (state.leftIntentionally) {
      set({ manualReconnectError: 'Match was left intentionally.' });
      return;
    }

    if (!state.lastDisconnectAt || (now - state.lastDisconnectAt) > MANUAL_RECONNECT_WINDOW_MS) {
      set({ manualReconnectError: 'Disconnect was too long ago. Start a new match.' });
      return;
    }

    if (!nakama.isAuthenticated()) {
      set({ manualReconnectError: 'Session expired. Please reopen the app.' });
      return;
    }
    const sessionUserId = getSessionUserId();
    if (sessionUserId && state.lastMatchUserId !== sessionUserId) {
      clearStoredMatch();
      set({
        lastMatchId: null,
        lastMatchToken: null,
        lastMatchMetadata: null,
        lastMatchUserId: null,
        leftIntentionally: true,
        manualReconnectError: 'Stored match belongs to another account.',
      });
      return;
    }

    const currentMatchId = nakama.getCurrentMatchId();
    if (currentMatchId && currentMatchId === matchId) {
      set({
        matchId,
        lastMatchId: matchId,
        lastMatchUserId: sessionUserId,
        manualReconnectInProgress: false,
        matchJoinInProgress: false,
        manualReconnectError: null,
        connectionState: nakama.getConnectionState(),
        leftIntentionally: false,
        lastDisconnectAt: null,
        leavePromptOpen: false,
      });
      requestTimeSyncSafe();
      return;
    }

    if (nakama.getConnectionState() === 'reconnecting') {
      set({ manualReconnectError: 'Automatic reconnect is in progress.' });
      return;
    }

    set({
      manualReconnectInProgress: true,
      manualReconnectError: null,
      matchJoinInProgress: true,
      lastManualReconnectAt: now,
      connectionState: 'connecting',
    });

    try {
      if (!nakama.getSocket() || nakama.getConnectionState() !== 'connected') {
        await nakama.connect();
      }
    } catch (error) {
      set({
        manualReconnectInProgress: false,
        matchJoinInProgress: false,
        connectionState: 'disconnected',
        manualReconnectError: getReconnectErrorMessage(error),
      });
      return;
    }

    get().registerMatchCallbacks();

    try {
      await nakama.joinMatch(matchId, state.lastMatchToken || undefined, state.lastMatchMetadata || undefined);
      set({
        matchId,
        lastMatchId: matchId,
        lastMatchUserId: getSessionUserId(),
        manualReconnectInProgress: false,
        matchJoinInProgress: false,
        manualReconnectError: null,
        connectionState: nakama.getConnectionState(),
        leftIntentionally: false,
        lastDisconnectAt: null,
        leavePromptOpen: false,
      });
      saveStoredMatch(matchId, state.lastMatchToken || null, state.lastMatchMetadata || null);
      requestTimeSyncSafe();
    } catch (error) {
      const reconnectError = getReconnectErrorMessage(error);
      const terminal = isTerminalReconnectError(error);
      if (terminal) {
        clearStoredMatch();
      }
      set({
        manualReconnectInProgress: false,
        matchJoinInProgress: false,
        manualReconnectError: reconnectError,
        connectionState: nakama.getConnectionState() === 'connected' ? 'connected' : 'disconnected',
        ...(terminal ? {
          lastMatchId: null,
          lastMatchToken: null,
          lastMatchMetadata: null,
          lastMatchUserId: null,
          leftIntentionally: true,
          lastDisconnectAt: null,
          leavePromptOpen: false,
        } : {}),
      });
    }
  },

  requestRematch: async () => {
    const { phase, rematchRequested } = get();
    if (phase !== 'ended' || rematchRequested) return;

    try {
      await nakama.requestRematch();
      set({ rematchRequested: true });
      gameSounds.onClick();
    } catch (error) {
      console.error('Error requesting rematch:', error);
      set({ rematchFailed: true });
    }
  },

  joinRematch: async () => {
    const { rematchMatchId, matchJoinInProgress } = get();
    if (!rematchMatchId || matchJoinInProgress) return;

    try {
      set({ matchJoinInProgress: true });
      // Leave current match and join the rematch
      await nakama.leaveMatch();
      await nakama.joinMatch(rematchMatchId);
      set({
        matchId: rematchMatchId,
        phase: 'matched',
        matchmakingRequested: false,
        queueMode: 'ranked',
        matchMode: 'ranked',
        rematchRequested: false,
        opponentRematchRequested: false,
        rematchMatchId: null,
        rematchFailed: false,
        matchPacing: DEFAULT_MATCH_PACING,
        currentQuestion: null,
        selectedAnswer: null,
        answerSubmitted: false,
        lastReveal: null,
        pendingQuestion: null,
        matchResult: null,
        questionHistory: [],
        lastMatchId: rematchMatchId,
        lastMatchToken: null,
        lastMatchMetadata: null,
        lastMatchUserId: getSessionUserId(),
        isSpectator: false,
        leftIntentionally: false,
        manualReconnectError: null,
        lastDisconnectAt: null,
        leavePromptOpen: false,
        // Reset timing state for fresh time sync
        questionTimeRemaining: 15,
        questionStartServerMs: null,
        timeLimitMs: 15000,
        // Keep serverTimeOffsetMs and estimatedRttMs as they're still valid
        // Reset player answer states
        players: get().players.map(p => ({ ...p, score: 0, hasAnswered: false })),
        countdown: 3,
        error: null,
        matchJoinInProgress: false,
      });
      saveStoredMatch(rematchMatchId, null, null);
      requestTimeSyncSafe();
    } catch (error) {
      console.error('Error joining rematch:', error);
      set({ rematchFailed: true, matchJoinInProgress: false });
    }
  },

  // Event handlers
  handleMatchFound: async (data: MatchmakerMatched) => {
    const state = get();
    if (state.matchJoinInProgress) {
      return;
    }
    if (!state.matchmakingRequested && state.phase !== 'searching') {
      return;
    }
    clearMatchmakingTimers();
    gameSounds.onMatchFound();
    const { settings } = useSettingsStore.getState();
    if (settings.matchFoundNotification) {
      const categoryLabel = state.queueParentCategory
        ? (() => {
            if (state.queueAllInCategory || state.queueSubcategories.length === 0) {
              return `Topic: ${state.queueParentCategory} (All subcategories)`;
            }
            if (state.queueSubcategories.length === 1) {
              return `Topic: ${state.queueParentCategory} / ${state.queueSubcategories[0]}`;
            }
            return `Topic: ${state.queueParentCategory} (${state.queueSubcategories.length} subcategories)`;
          })()
        : 'A match is ready.';
      notifyIfAllowed('Match found', {
        body: categoryLabel,
        tag: 'match-found',
        // Avoid overlapping the OS notification sound with our custom match-found audio.
        silent: settings.soundEffectsEnabled,
        onlyWhenHidden: true,
      });
    }
    set({
      phase: 'matched',
      matchmakingRequested: false,
      matchmakerTicket: null,
      matchJoinInProgress: true,
      lastMatchId: data.matchId,
      lastMatchToken: data.token,
      lastMatchUserId: getSessionUserId(),
      leftIntentionally: false,
      lastDisconnectAt: null,
      manualReconnectError: null,
      leavePromptOpen: false,
      isSpectator: false,
      lastMatchMetadata: null,
      matchCategory: null,
      matchPacing: DEFAULT_MATCH_PACING,
      queueMode: 'ranked',
      matchMode: 'ranked',
    });

    try {
      // Join the match
      await nakama.joinMatch(data.matchId, data.token);
      set({ matchId: data.matchId, matchJoinInProgress: false });
      saveStoredMatch(data.matchId, data.token || null, null);
      requestTimeSyncSafe();
    } catch (error) {
      console.error('Error joining match:', error);
      clearStoredMatch();
      set({
        phase: 'error',
        error: 'Failed to join match',
        matchJoinInProgress: false,
        matchmakingRequested: false,
      });
    }
  },

  handlePlayersJoined: (data: { players: Array<{ userId?: string; oderId?: string; username: string; mmr: number; rankTier: string; connected?: boolean; avatarUrl?: string }> }) => {
    const session = nakama.getSession();
    const myUserId = session?.user_id;
    const existingPlayers = new Map(get().players.map(p => [p.userId, p]));

    // Map server format (userId/oderId) to client format (userId)
    const mappedPlayers: Player[] = data.players.map(p => {
      const resolvedUserId = p.userId || p.oderId || '';
      const existing = existingPlayers.get(resolvedUserId);
      return {
        userId: resolvedUserId,
        username: formatQuizDisplayName(p.username, 'Player'),
        mmr: p.mmr,
        rankTier: p.rankTier,
        score: existing?.score ?? 0,
        hasAnswered: existing?.hasAnswered ?? false,
        connected: typeof p.connected === 'boolean' ? p.connected : (existing?.connected ?? true),
        avatarUrl: p.avatarUrl || existing?.avatarUrl || '',
      };
    });

    const currentUserIsPlayer = Boolean(myUserId && mappedPlayers.some(p => p.userId === myUserId));
    const wasSpectator = get().isSpectator;
    const isSpectator = wasSpectator && !currentUserIsPlayer;
    const opponent = isSpectator ? null : mappedPlayers.find(p => p.userId !== myUserId);
    const matchState = get();

    if (wasSpectator && currentUserIsPlayer) {
      const storedMatchId = matchState.matchId || matchState.lastMatchId;
      if (storedMatchId) {
        saveStoredMatch(storedMatchId, matchState.lastMatchToken || null, null);
      }
    }

    set({
      players: mappedPlayers,
      opponentId: opponent?.userId || null,
      isSpectator,
      ...(wasSpectator && currentUserIsPlayer ? { lastMatchMetadata: null } : {}),
    });
  },

  handleCountdown: (data: { countdown: number; category: string; parentCategory?: string | null; matchPacing?: MatchPacingData | null }) => {
    void data.parentCategory;
    gameSounds.onCountdown();
    const previous = get().matchPacing;
    const resolvedPacing = normalizeMatchPacing(data.matchPacing, previous);
    set({
      phase: 'countdown',
      countdown: clampWhole(
        typeof data.countdown === 'number' ? data.countdown : resolvedPacing.countdownSeconds,
        resolvedPacing.countdownSeconds,
        0,
        15
      ),
      matchCategory: typeof data.category === 'string' ? data.category : get().matchCategory,
      matchPacing: resolvedPacing,
    });
  },

  handleQuestion: (data: QuestionData) => {
    const state = get();
    const resolvedPacing = normalizeMatchPacing(data.matchPacing, state.matchPacing);
    const currentQuestionNumber = state.currentQuestion?.questionNumber ?? 0;
    const incomingQuestionNumber = Number.isFinite(data.questionNumber)
      ? data.questionNumber
      : currentQuestionNumber + 1;

    if (currentQuestionNumber > 0 && incomingQuestionNumber < currentQuestionNumber) {
      return;
    }

    // If we're in reveal phase, queue the question instead of transitioning immediately
    // This allows the countdown animation to complete
    if (state.phase === 'reveal') {
      const pendingNumber = state.pendingQuestion?.questionNumber ?? 0;
      if (pendingNumber === 0 || incomingQuestionNumber >= pendingNumber) {
        set({ pendingQuestion: data, matchPacing: resolvedPacing });
      }
      return;
    }

    if (state.phase === 'question') {
      if (incomingQuestionNumber === currentQuestionNumber) {
        return;
      }
      if (incomingQuestionNumber > currentQuestionNumber) {
        const offsetMs = Number.isFinite(state.serverTimeOffsetMs ?? NaN)
          ? (state.serverTimeOffsetMs as number)
          : 0;
        const questionStartMs = Number(state.questionStartServerMs);
        const questionLimitMs = Number(state.timeLimitMs);
        const hasTimingData = Number.isFinite(questionStartMs) && Number.isFinite(questionLimitMs) && questionLimitMs > 0;
        const serverNowMs = Date.now() - offsetMs;
        const isCurrentQuestionExpired = hasTimingData
          ? serverNowMs >= (questionStartMs + questionLimitMs + 300)
          : (state.questionTimeRemaining <= 0);
        const gapTooLarge = incomingQuestionNumber > (currentQuestionNumber + 1);

        if (isCurrentQuestionExpired || gapTooLarge) {
          // Recover from out-of-order/missed reveal packets to avoid 0s lockups.
          console.warn(
            'Question stream desync detected, recovering to question #' +
            incomingQuestionNumber +
            ' (current #' +
            currentQuestionNumber +
            ')'
          );
          get()._processQuestion(data);
        } else {
          set({ pendingQuestion: data, matchPacing: resolvedPacing });
        }
      }
      return;
    }

    // Process the question immediately (not in reveal phase)
    get()._processQuestion(data);
  },

  // Internal method to process a question (either immediately or after countdown)
  _processQuestion: (data: QuestionData) => {
    gameSounds.onQuestionReveal();
    const state = get();
    const resolvedPacing = normalizeMatchPacing(data.matchPacing, state.matchPacing);
    const currentQuestionNumber = state.currentQuestion?.questionNumber ?? 0;
    if (currentQuestionNumber > 0 && Number.isFinite(data.questionNumber) && data.questionNumber < currentQuestionNumber) {
      return;
    }

    const answeredBy = data.answeredBy || {};
    const myUserId = nakama.getSession()?.user_id;
    const isSpectator = state.isSpectator;
    const alreadyAnswered = !isSpectator && myUserId ? answeredBy[myUserId] === true : false;
    const serverTimeMs = Number.isFinite(data.serverTimeMs) ? data.serverTimeMs : Date.now();
    const questionStartTimeMs = Number.isFinite(data.questionStartTimeMs) ? data.questionStartTimeMs : serverTimeMs;
    const timeLimitMs = Number.isFinite(data.timeLimitMs)
      ? data.timeLimitMs
      : (typeof data.timeLimit === 'number' ? data.timeLimit * 1000 : 15000);
    const safetyMs = 50;
    const estimatedRtt = state.estimatedRttMs ?? 0;
    const rttAdjustMs = Number.isFinite(estimatedRtt) ? estimatedRtt / 2 : 0;
    const fallbackOffsetMs = (Date.now() - serverTimeMs) - rttAdjustMs - safetyMs;
    const currentOffset = state.serverTimeOffsetMs ?? fallbackOffsetMs;
    const serverTimeOffsetMs = Number.isFinite(currentOffset)
      ? currentOffset
      : fallbackOffsetMs;
    let remainingMs = Math.max(0, (questionStartTimeMs + timeLimitMs) - (Date.now() - serverTimeOffsetMs));

    // SAFEGUARD: If this is a new question and remainingMs is suspiciously low (< 2 seconds),
    // it's likely a time sync issue - use full time limit to avoid locking user out
    const isNewQuestion = !state.currentQuestion ||
      state.currentQuestion.questionNumber !== data.questionNumber;
    if (isNewQuestion && remainingMs < 2000) {
      console.warn('Time sync issue detected: remainingMs too low for new question, using full time limit');
      remainingMs = timeLimitMs;
    }

    // Reset answer state for new question
    set({
      phase: 'question',
      currentQuestion: data,
      matchCategory: typeof data.category === 'string' && data.category.length > 0 ? data.category : state.matchCategory,
      matchPacing: resolvedPacing,
      selectedAnswer: null,
      answerSubmitted: alreadyAnswered,
      questionTimeRemaining: Math.ceil(remainingMs / 1000),
      questionStartServerMs: questionStartTimeMs,
      // Reset serverTimeOffsetMs to recalculate from fresh data for new questions
      serverTimeOffsetMs: isNewQuestion ? fallbackOffsetMs : serverTimeOffsetMs,
      timeLimitMs: timeLimitMs,
      // Reset opponent answer state for new question
      opponentAnswerIndex: null,
      opponentAnswered: false,
      // Clear pending question since we're processing it
      pendingQuestion: null,
      players: state.players.map(p => ({
        ...p,
        score: data.scores[p.userId] || p.score,
        hasAnswered: typeof answeredBy[p.userId] === 'boolean' ? answeredBy[p.userId] : false,
      })),
    });
  },

  // Called by RevealScreen when countdown completes - transitions to the pending question
  consumePendingQuestion: () => {
    const { pendingQuestion } = get();
    if (pendingQuestion) {
      get()._processQuestion(pendingQuestion);
    }
  },

  handlePlayerLeft: (data: { userId: string }) => {
    set({
      players: get().players.map(p =>
        p.userId === data.userId ? { ...p, connected: false } : p
      ),
    });
  },

  handleOpponentAnswered: (data: { userId: string; answerIndex?: number }) => {
    const session = nakama.getSession();
    const myUserId = session?.user_id;
    const isOpponent = data.userId !== myUserId;
    const isSpectator = get().isSpectator;

    set({
      players: get().players.map(p =>
        p.userId === data.userId ? { ...p, hasAnswered: true } : p
      ),
      // Store opponent's answer index for real-time Beneficial Knowledge-style highlighting
      ...(!isSpectator && isOpponent && typeof data.answerIndex === 'number' ? {
        opponentAnswerIndex: data.answerIndex,
        opponentAnswered: true,
      } : {}),
    });
  },

  handleReveal: (data: AnswerRevealData) => {
    const state = get();
    const resolvedPacing = normalizeMatchPacing(data.matchPacing, state.matchPacing);
    const currentQuestion = state.currentQuestion;
    const players = state.players;
    const isSpectator = state.isSpectator;
    const revealQuestionNumber = Number.isFinite(data.questionNumber) ? (data.questionNumber as number) : null;
    if (revealQuestionNumber !== null && currentQuestion?.questionNumber && revealQuestionNumber < currentQuestion.questionNumber) {
      return;
    }
    if (revealQuestionNumber !== null && currentQuestion?.questionNumber && revealQuestionNumber > currentQuestion.questionNumber) {
      set({ lastReveal: data, matchPacing: resolvedPacing });
      return;
    }
    if (!currentQuestion) {
      set({
        lastReveal: data,
        matchCategory: typeof data.category === 'string' && data.category.length > 0 ? data.category : state.matchCategory,
        matchPacing: resolvedPacing,
      });
      return;
    }

    // Find my userId and opponent
    const sessionUserId = nakama.getSession()?.user_id || '';
    const myUserId = sessionUserId || players[0]?.userId || '';
    const opponentId = state.opponentId || players.find(p => p.userId !== myUserId)?.userId || '';

    const myResult = data.playerResults[myUserId];
    const opponentResult = data.playerResults[opponentId];

    const resolveScore = (player: Player) => {
      const result = data.playerResults[player.userId];
      const baseScore = player.score ?? 0;
      const gained = result?.scoreGained ?? 0;
      const reportedTotal = result?.totalScore;
      if (typeof reportedTotal === 'number') {
        return Math.max(baseScore, baseScore + gained, reportedTotal);
      }
      return baseScore + gained;
    };

    if (isSpectator) {
      set({
        phase: 'reveal',
        lastReveal: data,
        matchCategory: typeof data.category === 'string' && data.category.length > 0 ? data.category : state.matchCategory,
        matchPacing: resolvedPacing,
        players: players.map(p => ({
          ...p,
          score: resolveScore(p),
        })),
      });
      return;
    }

    // Play sound based on answer correctness
    if (myResult?.correct) {
      gameSounds.onAnswerCorrect();
    } else {
      gameSounds.onAnswerWrong();
    }

    // Build review item for question history
    const reviewItem: QuestionReviewItem = {
      questionNumber: currentQuestion?.questionNumber || 0,
      questionText: currentQuestion?.question.text || '',
      options: currentQuestion?.question.options || [],
      correctIndex: data.correctIndex,
      explanation: data.explanation || '',
      myAnswerIndex: myResult?.answerIndex ?? null,
      myCorrect: myResult?.correct || false,
      myTimeMs: myResult?.timeMs ?? null,
      opponentAnswerIndex: opponentResult?.answerIndex ?? null,
      opponentCorrect: opponentResult?.correct || false,
    };

    set({
      phase: 'reveal',
      lastReveal: data,
      matchCategory: typeof data.category === 'string' && data.category.length > 0 ? data.category : state.matchCategory,
      matchPacing: resolvedPacing,
      questionHistory: [...state.questionHistory, reviewItem],
      players: players.map(p => ({
        ...p,
        score: resolveScore(p),
      })),
    });
  },

  handleMatchEnd: (data: MatchEndData) => {
    const isSpectator = get().isSpectator;
    const resolvedMode: QueueMode = data.mode === 'practice' ? 'practice' : 'ranked';
    // Play victory or defeat sound
    const session = nakama.getSession();
    const myUserId = session?.user_id;
    if (!isSpectator) {
      if (data.winnerId === myUserId) {
        gameSounds.onVictory();
      } else if (data.winnerId === null) {
        // Draw - no special sound
      } else {
        gameSounds.onDefeat();
      }
    }

    set({
      phase: 'ended',
      matchmakingRequested: false,
      matchResult: {
        winnerId: data.winnerId,
        isDraw: data.winnerId === null,
        finalScores: data.finalScores,
        mmrChanges: data.mmrChanges,
        playerStats: data.playerStats,
        reason: data.reason,
        mode: resolvedMode,
        practiceSummary: data.practiceSummary,
      },
      matchJoinInProgress: false,
      lastMatchId: null,
      lastMatchToken: null,
      lastMatchMetadata: null,
      lastMatchUserId: null,
      matchCategory: typeof data.category === 'string' && data.category.length > 0 ? data.category : get().matchCategory,
      matchMode: resolvedMode,
      queueMode: resolvedMode,
      leftIntentionally: true,
      lastDisconnectAt: null,
      manualReconnectError: null,
      manualReconnectInProgress: false,
      lastManualReconnectAt: null,
      leavePromptOpen: false,
    });
    clearStoredMatch();

    if (!isSpectator && resolvedMode !== 'practice') {
      // Auto-refresh profile to get updated MMR from server
      // This ensures profile shows correct MMR even if match end message has stale data
      setTimeout(() => {
        useProfileStore.getState().fetchProfile();
      }, 500);

      // Auto-refresh leaderboards after match ends
      // This ensures category leaderboards show updated scores immediately
      setTimeout(() => {
        const leaderboardStore = useLeaderboardStore.getState();
        // Refresh the currently viewed leaderboard
        leaderboardStore.fetchCurrentLeaderboard();

        const currentQuery = leaderboardStore.currentQuery;
        const globalQuery = { scope: 'global' as const, timeframe: 'all' as const, categoryId: null };
        if (currentQuery.scope !== 'global' || currentQuery.timeframe !== 'all') {
          leaderboardStore.fetchLeaderboard(globalQuery);
        }

        // Refresh the category leaderboard for the match's topic in the current timeframe
        const matchCategory = get().matchCategory;
        if (matchCategory) {
          const categoryQuery = { scope: 'topic' as const, timeframe: currentQuery.timeframe, categoryId: matchCategory };
          const isCurrentCategory =
            currentQuery.scope === 'topic' &&
            currentQuery.categoryId === matchCategory &&
            currentQuery.timeframe === categoryQuery.timeframe;
          if (!isCurrentCategory) {
            leaderboardStore.fetchLeaderboard(categoryQuery);
          }
        }
      }, 1000);

    }
  },

  handleTimeSync: (data: { clientTimeMs: number; serverReceiveTimeMs: number; serverSendTimeMs: number }) => {
    const t0 = data.clientTimeMs;
    const t1 = data.serverReceiveTimeMs;
    const t2 = data.serverSendTimeMs;
    const t3 = Date.now();

    if (![t0, t1, t2].every(value => Number.isFinite(value))) {
      return;
    }

    // Validate timestamps are reasonable (within 5 minutes of current time)
    const MAX_TIME_DRIFT_MS = 5 * 60 * 1000;
    const now = Date.now();
    if (Math.abs(t0 - now) > MAX_TIME_DRIFT_MS ||
        Math.abs(t1 - now) > MAX_TIME_DRIFT_MS ||
        Math.abs(t2 - now) > MAX_TIME_DRIFT_MS) {
      console.warn('Time sync: timestamps too far from current time, ignoring');
      return;
    }

    const processingMs = Math.max(0, t2 - t1);
    // RTT calculation: ensure it's positive and reasonable (max 10 seconds)
    const rawRttMs = (t3 - t0) - processingMs;
    const rttMs = Math.max(0, Math.min(rawRttMs, 10000));

    // Offset calculation with bounds checking (max +/- 60 seconds)
    const rawOffsetMs = ((t0 - t1) + (t3 - t2)) / 2;
    const MAX_OFFSET_MS = 60000;
    const boundedOffsetMs = Math.max(-MAX_OFFSET_MS, Math.min(rawOffsetMs, MAX_OFFSET_MS));

    const safetyMs = 50;
    const conservativeOffsetMs = boundedOffsetMs - safetyMs;

    const prevOffset = get().serverTimeOffsetMs;
    const prevRtt = get().estimatedRttMs;

    // Only apply smoothing if the new value is within reasonable range of previous
    const MAX_OFFSET_JUMP_MS = 5000;
    const useSmoothing = typeof prevOffset === 'number' &&
      Math.abs(conservativeOffsetMs - prevOffset) < MAX_OFFSET_JUMP_MS;

    const smoothedOffset = useSmoothing
      ? (prevOffset * 0.8 + conservativeOffsetMs * 0.2)
      : conservativeOffsetMs;
    const smoothedRtt = typeof prevRtt === 'number'
      ? (prevRtt * 0.8 + rttMs * 0.2)
      : rttMs;

    set({
      serverTimeOffsetMs: smoothedOffset,
      estimatedRttMs: smoothedRtt,
    });
  },

  handleDisconnect: () => {
    const { phase } = get();

    if (['searching', 'matched', 'countdown', 'question', 'reveal'].includes(phase)) {
      set({
        connectionState: 'reconnecting',
        reconnectAttempt: 0,
        reconnectMax: null,
        lastDisconnectAt: Date.now(),
        manualReconnectError: null,
      });
    }
  },

  handleReconnecting: (attempt: number, maxAttempts: number) => {
    set({
      connectionState: 'reconnecting',
      reconnectAttempt: attempt,
      reconnectMax: maxAttempts,
    });
  },

  handleReconnected: () => {
    const state = get();
    const currentMatchId = nakama.getCurrentMatchId();
    const hasRecentDisconnect = !!state.lastDisconnectAt;
    const targetMatchId = state.matchId || state.lastMatchId;

    if (state.phase === 'searching' && state.matchmakingRequested) {
      set({
        connectionState: 'connected',
        reconnectAttempt: null,
        reconnectMax: null,
        lastDisconnectAt: null,
        manualReconnectInProgress: false,
        manualReconnectError: null,
        leavePromptOpen: false,
      });
      void get().startSearching();
      return;
    }

    if (hasRecentDisconnect && targetMatchId && !state.leftIntentionally) {
      if (currentMatchId && currentMatchId === targetMatchId) {
        set({
          connectionState: 'connected',
          reconnectAttempt: null,
          reconnectMax: null,
          manualReconnectInProgress: false,
          manualReconnectError: null,
          lastDisconnectAt: null,
          leavePromptOpen: false,
        });
        requestTimeSyncSafe();
        return;
      }
      set({
        connectionState: 'connected',
        reconnectAttempt: null,
        reconnectMax: null,
        manualReconnectInProgress: false,
        manualReconnectError: null,
        leavePromptOpen: false,
      });
      void get().autoRejoinMatch();
      return;
    }

    if (state.matchId && currentMatchId && state.matchId !== currentMatchId) {
      set({
        phase: 'error',
        error: 'Reconnected to a different match session. Please start a new game.',
        matchId: null,
        players: [],
        opponentId: null,
        countdown: 3,
        matchPacing: DEFAULT_MATCH_PACING,
        currentQuestion: null,
        selectedAnswer: null,
        answerSubmitted: false,
        questionTimeRemaining: 15,
        questionStartServerMs: null,
        serverTimeOffsetMs: null,
        timeLimitMs: 15000,
        estimatedRttMs: null,
        lastReveal: null,
        pendingQuestion: null,
        matchResult: null,
        connectionState: 'connected',
        reconnectAttempt: null,
        reconnectMax: null,
        matchJoinInProgress: false,
        lastMatchId: null,
        lastMatchToken: null,
        lastMatchMetadata: null,
        lastMatchUserId: null,
        leftIntentionally: true,
        lastDisconnectAt: null,
        manualReconnectInProgress: false,
        manualReconnectError: null,
        lastManualReconnectAt: null,
        leavePromptOpen: false,
      });
      return;
    }

    set({
      connectionState: 'connected',
      reconnectAttempt: null,
      reconnectMax: null,
      lastDisconnectAt: null,
      manualReconnectInProgress: false,
      manualReconnectError: null,
      leftIntentionally: false,
      leavePromptOpen: false,
    });
    requestTimeSyncSafe();
  },

  handleReconnectFailed: () => {
    const { phase } = get();
    if (phase === 'searching') {
      clearMatchmakingTimers();
      set({
        phase: 'error',
        matchmakingRequested: false,
        matchmakerTicket: null,
        connectionState: 'disconnected',
        reconnectAttempt: null,
        reconnectMax: null,
        matchJoinInProgress: false,
        manualReconnectInProgress: false,
        manualReconnectError: null,
        error: 'Connection lost while searching. Please try again.',
      });
      return;
    }

    if (['matched', 'countdown', 'question', 'reveal'].includes(phase)) {
      set({
        connectionState: 'disconnected',
        reconnectAttempt: null,
        reconnectMax: null,
        matchJoinInProgress: false,
        manualReconnectInProgress: false,
        manualReconnectError: 'Connection lost. Reconnect or leave.',
      });
      return;
    }

    set({
      connectionState: 'disconnected',
      reconnectAttempt: null,
      reconnectMax: null,
      matchJoinInProgress: false,
      manualReconnectInProgress: false,
    });
  },

  handleError: (error: Error) => {
    console.error('Game error:', error);
    set({
      phase: 'error',
      matchmakingRequested: false,
      error: error.message,
      matchJoinInProgress: false,
      manualReconnectInProgress: false,
    });
  },

  handleRematchRequested: (data: { requesterId: string; requesterUsername: string }) => {
    void data;
    set({ opponentRematchRequested: true });
    gameSounds.onMatchFound();
  },

  handleRematchMatchCreated: (data: { matchId: string; category: string }) => {
    const state = get();
    set({
      rematchMatchId: data.matchId,
      matchCategory: data.category || state.matchCategory,
    });

    if (state.phase === 'ended' && !state.isSpectator && state.rematchRequested) {
      void get().joinRematch();
    }
  },

  handleRematchFailed: (data: { error: string }) => {
    console.error('Rematch failed:', data.error);
    set({ rematchFailed: true });
  },
}));
