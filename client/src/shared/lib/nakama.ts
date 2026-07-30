// Nakama client singleton for Beneficial Knowledge
import { Client, Session, type Socket } from '@heroiclabs/nakama-js';
import type { QuestionType } from '../types/game';

// Proxy mode: when enabled, connect to same origin (for tunnel/reverse proxy setups)
const USE_PROXY = import.meta.env.VITE_USE_PROXY === 'true';

const NAKAMA_HOST = USE_PROXY ? window.location.hostname : (import.meta.env.VITE_NAKAMA_HOST || 'localhost');
const NAKAMA_PORT = USE_PROXY ? (window.location.port || (window.location.protocol === 'https:' ? '443' : '80')) : (import.meta.env.VITE_NAKAMA_PORT || '7350');
const NAKAMA_KEY = import.meta.env.VITE_NAKAMA_KEY || '';
const NAKAMA_SSL = USE_PROXY ? window.location.protocol === 'https:' : import.meta.env.VITE_NAKAMA_SSL === 'true';

if (!NAKAMA_KEY) {
  throw new Error('VITE_NAKAMA_KEY environment variable is required.');
}

type TelegramInitUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
};

const parseTelegramUser = (initData: string): TelegramInitUser | null => {
  if (!initData) return null;
  const params = new URLSearchParams(initData);
  const userJson = params.get('user');
  if (!userJson) return null;
  try {
    // URLSearchParams already decodes values; decoding again can throw on valid '%' chars.
    const user = JSON.parse(userJson) as TelegramInitUser;
    return user && typeof user.id === 'number' ? user : null;
  } catch {
    return null;
  }
};

const safeParseJson = <T>(value: string, context: string): T => {
  try {
    return JSON.parse(value) as T;
  } catch {
    throw new Error(`${context} JSON parse failed`);
  }
};

// WebSocket OpCodes (must match server)
export const OpCode = {
  // Server -> Client
  PLAYER_JOINED: 1,
  MATCH_STARTING: 2,
  PLAYER_LEFT: 3,
  QUESTION: 20,
  ANSWER_REVEAL: 21,
  MATCH_END: 30,
  OPPONENT_ANSWERED: 11,
  TIME_SYNC_RESPONSE: 13,
  REMATCH_REQUESTED: 41,
  REMATCH_MATCH_CREATED: 42,
  REMATCH_FAILED: 43,

  // Client -> Server
  SUBMIT_ANSWER: 10,
  TIME_SYNC_REQUEST: 12,
  SURRENDER: 14,
  REMATCH_REQUEST: 40,
} as const;

export interface MatchData {
  matchId: string;
  category: string;
  players: Array<{
    userId?: string;
    username?: string;
    oderId?: string;
    odername?: string;
    mmr: number;
  }>;
}

export interface QuestionData {
  questionNumber: number;
  totalQuestions: number;
  category?: string;
  matchPacing?: MatchPacingData | null;
  question: {
    id: string;
    text: string;
    options: string[];
    difficulty: string;
    type?: QuestionType;
    passage?: string;
  };
  timeLimit: number;
  timeLimitMs: number;
  questionStartTimeMs: number;
  serverTimeMs: number;
  scores: Record<string, number>;
  answeredBy?: Record<string, boolean>;
}

export interface TimeSyncData {
  clientTimeMs: number;
  serverReceiveTimeMs: number;
  serverSendTimeMs: number;
}

export interface AnswerRevealData {
  matchId?: string;
  questionNumber?: number;
  category?: string;
  matchPacing?: MatchPacingData | null;
  correctIndex: number;
  explanation: string;
  playerResults: Record<string, {
    answerIndex: number | null;
    correct: boolean;
    scoreGained: number;
    totalScore: number;
    streak: number;
    timeMs: number | null;
  }>;
}

export interface MatchPacingData {
  preset?: string;
  countdownSeconds?: number;
  revealDelayMs?: number;
  revealSuspenseMs?: number;
  revealRevealMs?: number;
  revealEffectsMs?: number;
  revealScoresMs?: number;
  roundPulseEnabled?: boolean;
  roundPulseStartDelayMs?: number;
  roundPulseCompleteDelayMs?: number;
}

export interface MatchEndData {
  winnerId: string | null;
  finalScores: Record<string, number>;
  mmrChanges: Record<string, {
    oldMmr: number;
    newMmr: number;
    change: number;
    newRankTier: string;
  }>;
  playerStats: Record<string, {
    correctAnswers: number;
    totalAnswers: number;
    averageTime: number;
  }>;
  category?: string;
  reason?: string;
  mode?: 'ranked' | 'practice';
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

export interface TelegramAuthResponse {
  userId: string;
  username: string;
  created: boolean;
  telegramId: number;
  displayName: string;
  photoUrl: string;
  profile: {
    mmr: number;
    rd?: number;
    volatility?: number;
    gamesPlayed: number;
    wins: number;
    losses?: number;
    draws?: number;
    rankTier: string;
    peakMmr?: number;
  };
}

export interface TelegramLoginPayload {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

interface TelegramWebLoginResponse {
  success: boolean;
  authToken?: string;
  sessionToken?: string;
  sessionExpiresAt?: string;
  telegramId?: number;
  error?: string;
}

export interface WebAuthResponse {
  success: boolean;
  userId?: string;
  username?: string;
  displayName?: string;
  authToken?: string;
  sessionToken?: string;
  sessionExpiresAt?: string;
  globalMmr?: {
    mmr: number;
    gamesPlayed: number;
    wins: number;
    losses: number;
    draws: number;
    rankTier: string;
    peakMmr: number;
    rd?: number;
    volatility?: number;
  };
  referralCode?: string;
  error?: string;
}

export interface BridgeAuthPayload {
  bridgeUserId: string;
  displayName?: string;
  bridgeDisplayName?: string;
}

export interface ReferralCodeInfo {
  code: string;
  maxUses: number;
  currentUses: number;
  isActive: boolean;
  createdAt: string;
}

type ProfileResponse = {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  globalMmr: {
    mmr: number;
    gamesPlayed: number;
    wins: number;
    losses: number;
    draws: number;
    rankTier: string;
    peakMmr: number;
  };
};

export interface MatchmakerTicket {
  ticket: string;
}

export interface MatchmakerMatched {
  matchId: string;
  token: string;
  users: Array<{
    presence: {
      userId: string;
      sessionId: string;
      username: string;
    };
    partyId?: string;
    stringProperties?: Record<string, string>;
    numericProperties?: Record<string, number>;
  }>;
}

type MatchEventCallback = {
  onPlayerJoined?: (data: { players: Array<{ userId?: string; oderId?: string; username: string; mmr: number; rankTier: string; connected?: boolean }> }) => void;
  onMatchStarting?: (data: { countdown: number; category: string; parentCategory?: string | null; matchPacing?: MatchPacingData | null }) => void;
  onPlayerLeft?: (data: { userId: string }) => void;
  onQuestion?: (data: QuestionData) => void;
  onOpponentAnswered?: (data: { userId: string; answerIndex?: number }) => void;
  onAnswerReveal?: (data: AnswerRevealData) => void;
  onMatchEnd?: (data: MatchEndData) => void;
  onMatchmakerMatched?: (data: MatchmakerMatched) => void;
  onTimeSync?: (data: TimeSyncData) => void;
  onRematchRequested?: (data: { requesterId: string; requesterUsername: string }) => void;
  onRematchMatchCreated?: (data: { matchId: string; category: string }) => void;
  onRematchFailed?: (data: { error: string }) => void;
  onDisconnect?: () => void;
  onReconnecting?: (attempt: number, maxAttempts: number) => void;
  onReconnected?: () => void;
  onReconnectFailed?: () => void;
  onError?: (error: Error) => void;
};

// Presence update for friend status
export interface PresenceUpdate {
  userId: string;
  username: string;
  online: boolean;
  statusMessage?: string;
}

// Challenge notification from a friend
export interface ChallengeNotification {
  challengeId: string;
  fromUserId: string;
  fromUsername: string;
  fromDisplayName: string;
  fromAvatarUrl?: string;
  category?: string;
  expiresAt: number;
}

type SocialEventCallback = {
  onPresenceUpdate?: (updates: PresenceUpdate[]) => void;
  onChallenge?: (challenge: ChallengeNotification) => void;
  onChallengeAccepted?: (data: { challengeId: string; matchId: string }) => void;
  onChallengeDeclined?: (data: { challengeId: string }) => void;
  onChallengeExpired?: (data: { challengeId: string }) => void;
  onNotification?: (notification: { id: string; type: string; content: Record<string, unknown> }) => void;
};

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

class NakamaClient {
  private static instance: NakamaClient;
  private client: Client;
  private socket: Socket | null = null;
  private session: Session | null = null;
  private currentMatchId: string | null = null;
  private currentMatchToken: string | null = null;
  private currentMatchMetadata: Record<string, unknown> | null = null;
  private currentMatchmakerTicket: string | null = null;
  private eventCallbacks: MatchEventCallback = {};
  private socialCallbacks: SocialEventCallback = {};
  private reconnecting = false;
  private connectionState: ConnectionState = 'disconnected';
  private connectionStateListeners: Array<(state: ConnectionState) => void> = [];
  private maxReconnectAttempts = 5;
  private reconnectBaseDelay = 1000;
  private followedUserIds: Set<string> = new Set();
  private suppressDisconnectHandler = false;

  private constructor() {
    this.client = new Client(
      NAKAMA_KEY,
      NAKAMA_HOST,
      NAKAMA_PORT,
      NAKAMA_SSL
    );
  }

  static getInstance(): NakamaClient {
    if (!NakamaClient.instance) {
      NakamaClient.instance = new NakamaClient();
    }
    return NakamaClient.instance;
  }

  private disposeSocketSilently(): void {
    if (!this.socket) {
      return;
    }

    try {
      this.suppressDisconnectHandler = true;
      this.socket.ondisconnect = () => undefined;
      this.socket.onerror = () => undefined;
      this.socket.onmatchdata = () => undefined;
      this.socket.onmatchpresence = () => undefined;
      this.socket.onstatuspresence = () => undefined;
      this.socket.onnotification = () => undefined;
      this.socket.onmatchmakermatched = () => undefined;
      this.socket.disconnect(false);
    } catch {
      // Ignore best-effort socket disposal errors.
    } finally {
      this.socket = null;
      this.suppressDisconnectHandler = false;
    }
  }

  getClient(): Client {
    return this.client;
  }

  getSession(): Session | null {
    return this.session;
  }

  getSocket(): Socket | null {
    return this.socket;
  }

  isAuthenticated(): boolean {
    return !!this.session && !this.session.isexpired(Date.now() / 1000);
  }

  // Response from telegram_auth RPC
  private authResponse: TelegramAuthResponse | null = null;

  async authenticateWithTelegram(initData: string): Promise<TelegramAuthResponse> {
    const telegramUser = parseTelegramUser(initData);
    if (!telegramUser?.id) {
      throw new Error('Invalid Telegram initData');
    }

    const telegramId = 'telegram_' + telegramUser.id.toString();
    this.session = await this.client.authenticateCustom(telegramId, true, undefined, { initData });

    let profile: ProfileResponse;

    try {
      profile = await this.rpc<ProfileResponse>('get_profile');
    } catch (error) {
      this.session = null;
      throw error;
    }

    const authResult: TelegramAuthResponse = {
      userId: profile.userId || this.session.user_id || '',
      username: profile.username || this.session.username || '',
      created: this.session.created,
      telegramId: telegramUser.id,
      displayName: profile.displayName || profile.username || this.session.username || '',
      photoUrl: profile.avatarUrl || '',
      profile: {
        mmr: profile.globalMmr.mmr,
        gamesPlayed: profile.globalMmr.gamesPlayed,
        wins: profile.globalMmr.wins,
        losses: profile.globalMmr.losses || 0,
        draws: profile.globalMmr.draws || 0,
        rankTier: profile.globalMmr.rankTier,
        peakMmr: profile.globalMmr.peakMmr || profile.globalMmr.mmr,
      },
    };

    this.saveTelegramWebSession(telegramUser.id);
    this.authResponse = authResult;
    return authResult;
  }

  async authenticateWithTelegramLogin(payload: TelegramLoginPayload): Promise<TelegramAuthResponse> {
    let response;
    try {
      response = await this.client.rpc(
        await this.getOrCreateAnonSession(),
        'telegram_web_login',
        payload
      );
    } catch (error) {
      throw await this.toRpcError(error, 'telegram_web_login');
    }

    let result: TelegramWebLoginResponse;
    if (typeof response.payload === 'string') {
      result = safeParseJson<TelegramWebLoginResponse>(response.payload, 'rpc:telegram_web_login');
    } else {
      result = response.payload as TelegramWebLoginResponse;
    }

    if (!result.success) {
      throw new Error(result.error || 'Telegram login failed');
    }

    if (!result.authToken || !result.sessionToken || !result.telegramId) {
      throw new Error('Telegram login failed');
    }

    this.session = await this.client.authenticateCustom(
      result.authToken,
      true,
      undefined,
      { telegramSessionToken: result.sessionToken }
    );

    let profile: ProfileResponse;
    try {
      profile = await this.rpc<ProfileResponse>('get_profile');
    } catch (error) {
      this.session = null;
      throw error;
    }

    this.saveTelegramWebSession(result.telegramId);

    const authResult: TelegramAuthResponse = {
      userId: profile.userId || this.session.user_id || '',
      username: profile.username || this.session.username || '',
      created: this.session.created,
      telegramId: result.telegramId,
      displayName: profile.displayName || profile.username || this.session.username || '',
      photoUrl: profile.avatarUrl || '',
      profile: {
        mmr: profile.globalMmr.mmr,
        gamesPlayed: profile.globalMmr.gamesPlayed,
        wins: profile.globalMmr.wins,
        losses: profile.globalMmr.losses || 0,
        draws: profile.globalMmr.draws || 0,
        rankTier: profile.globalMmr.rankTier,
        peakMmr: profile.globalMmr.peakMmr || profile.globalMmr.mmr,
      },
    };

    this.authResponse = authResult;
    return authResult;
  }

  private async toRpcError(error: unknown, rpcId: string): Promise<Error> {
    if (error instanceof Response) {
      let message = `RPC ${rpcId} failed (${error.status})`;
      try {
        const text = await error.text();
        if (text) {
          const parsed = safeParseJson<{ message?: string; error?: string }>(text, `rpc:${rpcId}:error`);
          message = parsed.message || parsed.error || text || message;
        }
      } catch {
        // Keep fallback message
      }
      return new Error(message);
    }

    if (error instanceof Error) {
      return error;
    }

    if (error && typeof error === 'object' && 'message' in error && typeof (error as { message?: unknown }).message === 'string') {
      return new Error((error as { message: string }).message);
    }

    return new Error(`RPC ${rpcId} failed`);
  }

  getAuthResponse(): TelegramAuthResponse | null {
    return this.authResponse;
  }

  async connect(): Promise<Socket> {
    if (!this.session) {
      throw new Error('Must authenticate before connecting socket');
    }

    if (this.socket) {
      this.disposeSocketSilently();
    }

    this.setConnectionState('connecting');
    this.socket = this.client.createSocket(NAKAMA_SSL, false);

    try {
      await this.socket.connect(this.session, true);
      this.setConnectionState('connected');
    } catch (error) {
      this.setConnectionState('disconnected');
      throw error;
    }

    // Set up event handlers
    this.socket.ondisconnect = () => {
      if (this.suppressDisconnectHandler) {
        return;
      }
      this.eventCallbacks.onDisconnect?.();
      this.handleDisconnect();
    };

    this.socket.onerror = (error) => {
      this.eventCallbacks.onError?.(new Error(String(error)));
    };

    this.socket.onmatchdata = (matchData) => {
      this.handleMatchData(matchData);
    };

    this.socket.onmatchpresence = () => {
      // Match presence update handled
    };

    // Handle status presence updates (friend online/offline)
    this.socket.onstatuspresence = (statusPresence) => {
      const updates: PresenceUpdate[] = [];

      // Process joins (users coming online)
      if (statusPresence.joins) {
        for (const join of statusPresence.joins) {
          updates.push({
            userId: join.user_id,
            username: join.username,
            online: true,
          });
        }
      }

      // Process leaves (users going offline)
      if (statusPresence.leaves) {
        for (const leave of statusPresence.leaves) {
          updates.push({
            userId: leave.user_id,
            username: leave.username,
            online: false,
          });
        }
      }

      if (updates.length > 0) {
        this.socialCallbacks.onPresenceUpdate?.(updates);
      }
    };

    // Handle notifications (friend challenges, etc.)
    this.socket.onnotification = (notification) => {

      // Parse notification content
      let content: Record<string, unknown> = {};
      try {
        content = typeof notification.content === 'string'
          ? JSON.parse(notification.content)
          : notification.content as Record<string, unknown>;
      } catch {
        content = {};
      }

      // Handle friend challenge notification
      if (notification.code === 100) { // Custom code for challenges
        const rawChallengeId = (content.challengeId as string | number | undefined) ?? notification.id ?? '';
        const challengeId = typeof rawChallengeId === 'string' ? rawChallengeId : String(rawChallengeId);
        // Calculate expiresAt - use server value if valid, otherwise calculate from now
        let expiresAtMs = Date.now() + 60000; // Default: 60 seconds from now
        const serverExpiresAt = content.expiresAt as number;
        if (serverExpiresAt && serverExpiresAt > Date.now()) {
          expiresAtMs = serverExpiresAt;
        }

        const challenge: ChallengeNotification = {
          challengeId,
          fromUserId: (content.fromUserId as string) || '',
          fromUsername: (content.fromUsername as string) || '',
          fromDisplayName: (content.fromDisplayName as string) || (content.fromUsername as string) || '',
          fromAvatarUrl: content.fromAvatarUrl as string | undefined,
          category: content.category as string | undefined,
          expiresAt: expiresAtMs,
        };
        this.socialCallbacks.onChallenge?.(challenge);
      } else if (notification.code === 101) { // Challenge accepted
        this.socialCallbacks.onChallengeAccepted?.({
          challengeId: content.challengeId as string,
          matchId: content.matchId as string,
        });
      } else if (notification.code === 102) { // Challenge declined
        this.socialCallbacks.onChallengeDeclined?.({
          challengeId: content.challengeId as string,
        });
      } else if (notification.code === 103) { // Challenge expired
        this.socialCallbacks.onChallengeExpired?.({
          challengeId: content.challengeId as string,
        });
      }

      const notificationType = (content.type as string) || notification.subject || 'unknown';
      // General notification callback
      this.socialCallbacks.onNotification?.({
        id: notification.id || '',
        type: notificationType,
        content,
      });
    };

    // Handle matchmaker matched event
    this.socket.onmatchmakermatched = (matched) => {
      this.currentMatchmakerTicket = null;

      const matchData: MatchmakerMatched = {
        matchId: matched.match_id || '',
        token: matched.token || '',
        users: (matched.users || []).map((u: { presence: { user_id: string; session_id: string; username: string }; party_id?: string; string_properties?: Record<string, string>; numeric_properties?: Record<string, number> }) => ({
          presence: {
            userId: u.presence.user_id,
            sessionId: u.presence.session_id,
            username: u.presence.username,
          },
          partyId: u.party_id,
          stringProperties: u.string_properties,
          numericProperties: u.numeric_properties,
        })),
      };

      this.eventCallbacks.onMatchmakerMatched?.(matchData);
    };

    return this.socket;
  }

  private handleMatchData(matchData: { match_id: string; op_code: number; data: Uint8Array }) {
    try {
      const dataString = new TextDecoder().decode(matchData.data);
      const data = JSON.parse(dataString);

      switch (matchData.op_code) {
        case OpCode.PLAYER_JOINED:
          this.eventCallbacks.onPlayerJoined?.(data);
          break;
        case OpCode.MATCH_STARTING:
          this.eventCallbacks.onMatchStarting?.(data);
          break;
        case OpCode.PLAYER_LEFT:
          this.eventCallbacks.onPlayerLeft?.(data);
          break;
        case OpCode.QUESTION:
          this.eventCallbacks.onQuestion?.(data);
          break;
        case OpCode.OPPONENT_ANSWERED:
          this.eventCallbacks.onOpponentAnswered?.(data);
          break;
        case OpCode.ANSWER_REVEAL:
          this.eventCallbacks.onAnswerReveal?.(data);
          break;
        case OpCode.TIME_SYNC_RESPONSE:
          this.eventCallbacks.onTimeSync?.(data);
          break;
        case OpCode.MATCH_END:
          this.eventCallbacks.onMatchEnd?.(data);
          break;
        case OpCode.REMATCH_REQUESTED:
          this.eventCallbacks.onRematchRequested?.(data);
          break;
        case OpCode.REMATCH_MATCH_CREATED:
          this.eventCallbacks.onRematchMatchCreated?.(data);
          break;
        case OpCode.REMATCH_FAILED:
          this.eventCallbacks.onRematchFailed?.(data);
          break;
        default:
          // Unknown op code - ignore
          break;
      }
    } catch {
      // Error processing match data - ignore
    }
  }

  private async handleDisconnect(): Promise<void> {
    if (this.reconnecting) return;
    this.reconnecting = true;
    this.setConnectionState('reconnecting');

    let retryCount = 0;
    let delay = this.reconnectBaseDelay;

    while (this.reconnecting && retryCount < this.maxReconnectAttempts) {
      retryCount++;
      this.eventCallbacks.onReconnecting?.(retryCount, this.maxReconnectAttempts);

      try {
        await new Promise(resolve => setTimeout(resolve, delay));
        if (!this.reconnecting) {
          return;
        }

        if (this.session && !this.session.isexpired(Date.now() / 1000)) {
          await this.connect();

          // Rejoin match if we were in one
          if (this.currentMatchId) {
            try {
              await this.socket?.joinMatch(
                this.currentMatchId,
                this.currentMatchToken || undefined,
                this.currentMatchMetadata || undefined
              );
            } catch {
              this.currentMatchId = null;
              this.currentMatchToken = null;
            }
          }

          this.reconnecting = false;
          this.setConnectionState('connected');

          // Re-follow users for presence updates
          await this.reFollowUsers();

          this.eventCallbacks.onReconnected?.();
          return;
        } else {
          this.reconnecting = false;
          this.setConnectionState('disconnected');
          this.eventCallbacks.onReconnectFailed?.();
          return;
        }
      } catch {
        delay = Math.min(delay * 2, 30000); // Cap at 30 seconds
      }
    }
    this.reconnecting = false;
    this.setConnectionState('disconnected');
    this.eventCallbacks.onReconnectFailed?.();
  }

  private setConnectionState(state: ConnectionState): void {
    if (this.connectionState !== state) {
      this.connectionState = state;
      this.connectionStateListeners.forEach(listener => listener(state));
    }
  }

  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  onConnectionStateChange(listener: (state: ConnectionState) => void): () => void {
    this.connectionStateListeners.push(listener);
    return () => {
      const index = this.connectionStateListeners.indexOf(listener);
      if (index > -1) {
        this.connectionStateListeners.splice(index, 1);
      }
    };
  }

  setMatchEventCallbacks(callbacks: MatchEventCallback): void {
    this.eventCallbacks = callbacks;
  }

  clearMatchEventCallbacks(): void {
    this.eventCallbacks = {};
  }

  // Social event callbacks
  setSocialEventCallbacks(callbacks: SocialEventCallback): void {
    // Merge to avoid one feature overwriting another's callbacks.
    this.socialCallbacks = { ...this.socialCallbacks, ...callbacks };
  }

  clearSocialEventCallbacks(): void {
    this.socialCallbacks = {};
  }

  // Follow users for presence updates
  async followUsers(userIds: string[]): Promise<void> {
    if (!this.socket) {
      throw new Error('Socket not connected');
    }

    if (userIds.length === 0) return;

    await this.socket.followUsers(userIds);
    userIds.forEach(id => this.followedUserIds.add(id));
  }

  // Unfollow users (stop receiving presence updates)
  async unfollowUsers(userIds: string[]): Promise<void> {
    if (userIds.length === 0) return;

    // Always remove from local tracking even if socket call fails
    // This prevents memory leaks in the followedUserIds Set
    userIds.forEach(id => this.followedUserIds.delete(id));

    if (!this.socket) {
      // Socket not connected - just clean up local state
      return;
    }

    try {
      await this.socket.unfollowUsers(userIds);
    } catch (error) {
      // Socket call failed but local state is already cleaned up
      console.warn('Failed to unfollow users on socket:', error);
    }
  }

  // Get currently followed user IDs
  getFollowedUserIds(): string[] {
    return Array.from(this.followedUserIds);
  }

  // Re-follow all users after reconnection
  private async reFollowUsers(): Promise<void> {
    if (this.followedUserIds.size > 0 && this.socket) {
      try {
        await this.socket.followUsers(Array.from(this.followedUserIds));
      } catch {
        // Failed to re-follow users - ignore
      }
    }
  }

  // Accept a friend challenge
  async acceptChallenge(challengeId: string): Promise<{ matchId?: string; success?: boolean; reason?: string }> {
    const response = await this.rpc<{ matchId?: string; success?: boolean; reason?: string }>('accept_challenge', { challengeId });
    return response;
  }

  // Decline a friend challenge
  async declineChallenge(challengeId: string): Promise<void> {
    await this.rpc('decline_challenge', { challengeId });
  }

  async findMatch(
    parentCategory: string,
    mmr: number = 1000,
    range: number = 200,
    region?: string,
    subcategories?: string[],
    allInCategory: boolean = true
  ): Promise<MatchmakerTicket> {
    if (!this.socket) {
      throw new Error('Socket not connected');
    }

    // Cancel any existing matchmaking first
    if (this.currentMatchmakerTicket) {
      await this.cancelMatchmaking();
    }

    // Join matchmaker queue with MMR-based matching
    // Query matches players in same category with similar MMR (within range)
    const minMmr = Math.max(0, Math.floor(mmr - range));
    const maxMmr = Math.floor(mmr + range);
    const normalizedSubcategories = Array.from(
      new Set((subcategories || []).map((sub) => sub.trim()).filter((sub) => sub.length > 0))
    );
    const isAllInCategory = allInCategory || normalizedSubcategories.length === 0;
    let query = `+properties.category:${parentCategory} +properties.mmr:>=${minMmr} +properties.mmr:<=${maxMmr}`;
    if (!isAllInCategory && normalizedSubcategories.length === 1) {
      // Keep exact filter for single-selection queues to reduce unnecessary match attempts.
      query += ` +properties.subcategory:${normalizedSubcategories[0]}`;
    }
    if (region) {
      query += ` +properties.region:${region}`;
    }

    const stringProperties: Record<string, string> = { category: parentCategory };
    if (isAllInCategory) {
      stringProperties.all_in_category = '1';
    } else {
      const serializedSubcategories = normalizedSubcategories.slice().sort().join(',');
      stringProperties.subcategories = serializedSubcategories;
      if (normalizedSubcategories.length === 1) {
        // Keep legacy single subcategory property for compatibility.
        stringProperties.subcategory = normalizedSubcategories[0];
      }
    }
    if (region) {
      stringProperties.region = region;
    }

    const ticket = await this.socket.addMatchmaker(
      query, // Query - must match category and MMR range
      2, // Min count
      2, // Max count
      stringProperties, // String properties
      { mmr } // Numeric properties for MMR-based matching
    );

    this.currentMatchmakerTicket = ticket.ticket;

    return { ticket: ticket.ticket };
  }

  async startBotMatch(parentCategory: string, subcategories?: string[], allInCategory: boolean = true): Promise<string> {
    const normalizedSubcategories = Array.from(
      new Set((subcategories || []).map((sub) => sub.trim()).filter((sub) => sub.length > 0))
    );
    const isAllInCategory = allInCategory || normalizedSubcategories.length === 0;
    const payload: Record<string, unknown> = {
      parentCategory,
      allInCategory: isAllInCategory,
      subcategories: isAllInCategory ? [] : normalizedSubcategories,
    };
    if (!isAllInCategory && normalizedSubcategories.length === 1) {
      payload.subcategory = normalizedSubcategories[0];
    }
    const response = await this.rpc<{ matchId: string }>('start_bot_match', payload);
    if (!response.matchId) {
      throw new Error('Failed to start bot match');
    }
    return response.matchId;
  }

  async startPracticeMatch(parentCategory: string, subcategories?: string[], allInCategory: boolean = true): Promise<string> {
    const normalizedSubcategories = Array.from(
      new Set((subcategories || []).map((sub) => sub.trim()).filter((sub) => sub.length > 0))
    );
    const isAllInCategory = allInCategory || normalizedSubcategories.length === 0;
    const payload: Record<string, unknown> = {
      parentCategory,
      allInCategory: isAllInCategory,
      subcategories: isAllInCategory ? [] : normalizedSubcategories,
    };
    if (!isAllInCategory && normalizedSubcategories.length === 1) {
      payload.subcategory = normalizedSubcategories[0];
    }
    const response = await this.rpc<{ matchId: string }>('start_practice_match', payload);
    if (!response.matchId) {
      throw new Error('Failed to start practice match');
    }
    return response.matchId;
  }

  async cancelMatchmaking(): Promise<void> {
    if (!this.socket || !this.currentMatchmakerTicket) {
      return;
    }

    try {
      await this.socket.removeMatchmaker(this.currentMatchmakerTicket);
    } catch {
      // Error cancelling matchmaking - ignore
    } finally {
      this.currentMatchmakerTicket = null;
    }
  }

  isInMatchmaking(): boolean {
    return this.currentMatchmakerTicket !== null;
  }

  getCurrentMatchId(): string | null {
    return this.currentMatchId;
  }

  async joinMatch(matchId: string, token?: string, metadata?: Record<string, unknown>): Promise<void> {
    if (!this.socket) {
      throw new Error('Socket not connected');
    }

    await this.socket.joinMatch(matchId, token, metadata);
    this.currentMatchId = matchId;
    this.currentMatchToken = token || null;
    this.currentMatchMetadata = metadata || null;
  }

  async leaveMatch(): Promise<void> {
    if (!this.socket || !this.currentMatchId) return;

    await this.socket.leaveMatch(this.currentMatchId);
    this.currentMatchId = null;
    this.currentMatchToken = null;
    this.currentMatchMetadata = null;
  }

  async surrender(): Promise<void> {
    if (!this.socket || !this.currentMatchId) return;

    // Send surrender message to trigger immediate forfeit
    // Don't leave match - wait for server to send MATCH_END with results
    await this.socket.sendMatchState(
      this.currentMatchId,
      OpCode.SURRENDER,
      new TextEncoder().encode('{}')
    );
  }

  async requestRematch(): Promise<void> {
    if (!this.socket || !this.currentMatchId) {
      throw new Error('Not in a match');
    }

    await this.socket.sendMatchState(
      this.currentMatchId,
      OpCode.REMATCH_REQUEST,
      new TextEncoder().encode('{}')
    );
  }

  async submitAnswer(answerIndex: number): Promise<void> {
    if (!this.socket || !this.currentMatchId) {
      throw new Error('Not in a match');
    }

    const data = JSON.stringify({ answerIndex });
    await this.socket.sendMatchState(
      this.currentMatchId,
      OpCode.SUBMIT_ANSWER,
      new TextEncoder().encode(data)
    );
  }

  async requestTimeSync(): Promise<void> {
    if (!this.socket || !this.currentMatchId) {
      throw new Error('Not in a match');
    }

    const data = JSON.stringify({ clientTimeMs: Date.now() });
    await this.socket.sendMatchState(
      this.currentMatchId,
      OpCode.TIME_SYNC_REQUEST,
      new TextEncoder().encode(data)
    );
  }

  async rpc<T>(rpcId: string, payload?: object, timeoutMs: number = 30000): Promise<T> {
    if (!this.session) {
      throw new Error('Not authenticated');
    }
    if (this.session.isexpired(Date.now() / 1000)) {
      const refreshed = await this.tryRefreshSession();
      if (!refreshed || !this.session) {
        throw new Error('Session expired. Please login again.');
      }
    }

    // Create a timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`RPC ${rpcId} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    try {
      // Race between RPC call and timeout
      const response = await Promise.race([
        this.client.rpc(this.session, rpcId, payload || {}),
        timeoutPromise,
      ]);

      if (typeof response.payload === 'string') {
        if (!response.payload) {
          throw new Error(`RPC ${rpcId} returned empty response`);
        }
        return safeParseJson<T>(response.payload, `rpc:${rpcId}`);
      }
      if (response.payload && typeof response.payload === 'object') {
        return response.payload as T;
      }
      throw new Error(`RPC ${rpcId} returned unexpected response`);
    } catch (error) {
      throw await this.toRpcError(error, rpcId);
    }
  }

  // ============================================================================
  // WEB AUTHENTICATION METHODS
  // ============================================================================

  // Validate a referral code before registration
  async validateReferralCode(code: string): Promise<{ valid: boolean; error?: string }> {
    let response;
    try {
      response = await this.client.rpc(
        await this.getOrCreateAnonSession(),
        'validate_referral_code',
        { code }
      );
    } catch (error) {
      throw await this.toRpcError(error, 'validate_referral_code');
    }

    if (typeof response.payload === 'string') {
      return safeParseJson(response.payload, 'rpc:validate_referral_code');
    }
    return response.payload as { valid: boolean; error?: string };
  }

  // Register a new web user with nickname, password, and referral code
  async registerWeb(nickname: string, password: string, referralCode: string): Promise<WebAuthResponse> {
    let response;
    try {
      response = await this.client.rpc(
        await this.getOrCreateAnonSession(),
        'web_register',
        { nickname, password, referralCode }
      );
    } catch (error) {
      throw await this.toRpcError(error, 'web_register');
    }

    let result: WebAuthResponse;
    if (typeof response.payload === 'string') {
      result = safeParseJson<WebAuthResponse>(response.payload, 'rpc:web_register');
    } else {
      result = response.payload as WebAuthResponse;
    }

    if (!result.success) {
      throw new Error(result.error || 'Registration failed');
    }

    if (!result.authToken || !result.sessionToken) {
      throw new Error('Registration failed');
    }

    // Authenticate with Nakama using the web session token
    this.session = await this.client.authenticateCustom(
      result.authToken,
      false,
      undefined,
      { webSessionToken: result.sessionToken }
    );

    // Save session for persistence
    this.saveWebSession(result.authToken, nickname);

    return result;
  }

  // Login an existing web user
  async loginWeb(nickname: string, password: string): Promise<WebAuthResponse> {
    let response;
    try {
      response = await this.client.rpc(
        await this.getOrCreateAnonSession(),
        'web_login',
        { nickname, password }
      );
    } catch (error) {
      throw await this.toRpcError(error, 'web_login');
    }

    let result: WebAuthResponse;
    if (typeof response.payload === 'string') {
      result = safeParseJson<WebAuthResponse>(response.payload, 'rpc:web_login');
    } else {
      result = response.payload as WebAuthResponse;
    }

    if (!result.success) {
      throw new Error(result.error || 'Login failed');
    }

    if (!result.authToken || !result.sessionToken) {
      throw new Error('Login failed');
    }

    // Authenticate with Nakama using the web session token
    this.session = await this.client.authenticateCustom(
      result.authToken,
      false,
      undefined,
      { webSessionToken: result.sessionToken }
    );

    // Save session for persistence
    this.saveWebSession(result.authToken, nickname);

    return result;
  }

  // Auto-login for trusted host app handoff
  async loginBridge(payload: BridgeAuthPayload): Promise<WebAuthResponse> {
    const bridgeUserId = payload.bridgeUserId?.trim();
    if (!bridgeUserId) {
      throw new Error('Bridge user id is required');
    }
    const bridgeDisplayName = (payload.bridgeDisplayName || payload.displayName || '').trim();

    const customId = bridgeUserId.startsWith('quizzy_')
      ? bridgeUserId
      : `quizzy_${bridgeUserId}`;

    const authVars: Record<string, string> = { source: 'quizzy_bridge' };
    if (bridgeDisplayName) {
      authVars.bridgeDisplayName = bridgeDisplayName;
      authVars.displayName = bridgeDisplayName;
    }

    this.session = await this.client.authenticateCustom(
      customId,
      true,
      undefined,
      authVars
    );

    const profile = await this.rpc<ProfileResponse>('get_profile');
    const resolvedDisplayName = (
      profile.displayName ||
      bridgeDisplayName ||
      profile.username ||
      this.session.username ||
      customId
    ).trim();
    const nickname = resolvedDisplayName || customId;

    // Persist as web session so refresh/reopen works without re-bridge.
    this.saveWebSession(customId, nickname);

    return {
      success: true,
      userId: profile.userId || this.session.user_id || '',
      username: profile.username || this.session.username || nickname,
      displayName: nickname,
      authToken: customId,
      sessionToken: this.session.token,
      globalMmr: {
        mmr: profile.globalMmr.mmr,
        gamesPlayed: profile.globalMmr.gamesPlayed,
        wins: profile.globalMmr.wins,
        losses: profile.globalMmr.losses || 0,
        draws: profile.globalMmr.draws || 0,
        rankTier: profile.globalMmr.rankTier,
        peakMmr: profile.globalMmr.peakMmr || profile.globalMmr.mmr,
      },
    };
  }

  // Get user's own referral code
  async getMyReferralCode(): Promise<ReferralCodeInfo> {
    if (!this.session) {
      throw new Error('Not authenticated');
    }
    return await this.rpc<ReferralCodeInfo>('get_my_referral_code');
  }

  // Create or get an anonymous session for unauthenticated RPCs
  private anonSession: Session | null = null;
  private getPublicDeviceId(): string {
    try {
      const stored = localStorage.getItem('public_device_id');
      if (stored) {
        return stored;
      }
      const randomPart = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const deviceId = `web_public_${randomPart}`;
      localStorage.setItem('public_device_id', deviceId);
      return deviceId;
    } catch {
      return `web_public_fallback_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    }
  }

  private async getOrCreateAnonSession(): Promise<Session> {
    if (this.anonSession && !this.anonSession.isexpired(Date.now() / 1000)) {
      return this.anonSession;
    }
    // Use a persistent per-browser device ID to avoid global shared anonymous sessions.
    const deviceId = this.getPublicDeviceId();
    this.anonSession = await this.client.authenticateDevice(deviceId, true);
    return this.anonSession;
  }

  private async tryRefreshSession(): Promise<boolean> {
    if (!this.session) return false;
    try {
      this.session = await this.client.sessionRefresh(this.session);
      try {
        const authToken = localStorage.getItem('web_auth_token');
        if (authToken) {
          this.saveWebSession(authToken, localStorage.getItem('web_nickname') || '');
        } else {
          this.saveTelegramWebSession(this.getStoredTelegramId() || 0);
        }
      } catch {
        // Session refresh succeeded; storage sync best-effort only.
      }
      return true;
    } catch {
      return false;
    }
  }

  // Save web session to localStorage for persistence
  private saveWebSession(authToken: string, nickname: string): void {
    try {
      localStorage.setItem('web_auth_token', authToken);
      localStorage.setItem('web_nickname', nickname);
      if (this.session) {
        localStorage.setItem('web_session_token', this.session.token);
        localStorage.setItem('web_session_refresh', this.session.refresh_token);
      }
    } catch (error) {
      console.warn('Failed to save web session:', error);
    }
  }

  private saveTelegramWebSession(telegramId: number): void {
    try {
      if (this.session) {
        localStorage.setItem('telegram_session_token', this.session.token);
        localStorage.setItem('telegram_session_refresh', this.session.refresh_token);
      }
      localStorage.setItem('telegram_login_id', telegramId.toString());
    } catch (error) {
      console.warn('Failed to save Telegram session:', error);
    }
  }

  // Restore web session from localStorage
  async restoreWebSession(): Promise<boolean> {
    try {
      const authToken = localStorage.getItem('web_auth_token');
      const sessionToken = localStorage.getItem('web_session_token');
      const refreshToken = localStorage.getItem('web_session_refresh');

      if (!authToken || !sessionToken) {
        return false;
      }

      // Try to restore the session
      const session = Session.restore(sessionToken, refreshToken || '');

      if (session.isexpired(Date.now() / 1000)) {
        // Session expired, try to refresh
        if (refreshToken) {
          try {
            this.session = await this.client.sessionRefresh(session);
            this.saveWebSession(authToken, localStorage.getItem('web_nickname') || '');
            return true;
          } catch {
            // Refresh failed, clear session
            this.clearWebSession();
            return false;
          }
        }
        this.clearWebSession();
        return false;
      }

      this.session = session;
      return true;
    } catch (error) {
      console.warn('Failed to restore web session:', error);
      return false;
    }
  }

  async restoreTelegramWebSession(): Promise<boolean> {
    try {
      const sessionToken = localStorage.getItem('telegram_session_token');
      const refreshToken = localStorage.getItem('telegram_session_refresh');

      if (!sessionToken) {
        return false;
      }

      const session = Session.restore(sessionToken, refreshToken || '');

      if (session.isexpired(Date.now() / 1000)) {
        if (refreshToken) {
          try {
            this.session = await this.client.sessionRefresh(session);
            this.saveTelegramWebSession(this.getStoredTelegramId() || 0);
            return true;
          } catch {
            this.clearTelegramWebSession();
            return false;
          }
        }
        this.clearTelegramWebSession();
        return false;
      }

      this.session = session;
      return true;
    } catch (error) {
      console.warn('Failed to restore Telegram session:', error);
      return false;
    }
  }

  // Clear web session from localStorage
  clearWebSession(): void {
    try {
      localStorage.removeItem('web_auth_token');
      localStorage.removeItem('web_nickname');
      localStorage.removeItem('web_session_token');
      localStorage.removeItem('web_session_refresh');
    } catch (error) {
      console.warn('Failed to clear web session:', error);
    }
  }

  clearTelegramWebSession(): void {
    try {
      localStorage.removeItem('telegram_session_token');
      localStorage.removeItem('telegram_session_refresh');
      localStorage.removeItem('telegram_login_id');
    } catch (error) {
      console.warn('Failed to clear Telegram session:', error);
    }
  }

  // Revoke web session on server
  async logoutWeb(): Promise<void> {
    if (!this.session) {
      return;
    }
    try {
      await this.rpc('web_logout');
    } catch (error) {
      console.warn('Failed to revoke web session:', error);
    }
  }

  // Check if there's a stored web session
  hasStoredWebSession(): boolean {
    try {
      return !!localStorage.getItem('web_auth_token');
    } catch {
      return false;
    }
  }

  hasStoredTelegramSession(): boolean {
    try {
      return !!localStorage.getItem('telegram_session_token');
    } catch {
      return false;
    }
  }

  getStoredTelegramId(): number | null {
    try {
      const raw = localStorage.getItem('telegram_login_id');
      if (!raw) return null;
      const parsed = parseInt(raw, 10);
      return Number.isFinite(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  // Get stored web nickname
  getStoredWebNickname(): string | null {
    try {
      return localStorage.getItem('web_nickname');
    } catch {
      return null;
    }
  }

  disconnect(): void {
    this.reconnecting = false;
    this.disposeSocketSilently();
    this.session = null;
    this.currentMatchId = null;
    this.currentMatchToken = null;
    this.currentMatchMetadata = null;
    this.currentMatchmakerTicket = null;
    this.eventCallbacks = {};
    this.socialCallbacks = {};
    this.followedUserIds.clear();
    this.setConnectionState('disconnected');
  }

  // Check if connection is healthy
  isConnected(): boolean {
    return this.connectionState === 'connected' && this.socket !== null;
  }
}

export const nakama = NakamaClient.getInstance();
export default nakama;
