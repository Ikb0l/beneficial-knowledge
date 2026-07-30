// Authentication store using Zustand
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { nakama } from '../shared/lib/nakama';
import { telegram } from '../shared/lib/telegram';
import type { ReferralCodeInfo, TelegramLoginPayload } from '../shared/lib/nakama';

export type AuthProvider = 'telegram' | 'web' | null;

export interface AuthUser {
  userId: string;
  username: string;
  telegramId: number;
  displayName: string;
  photoUrl: string;
  profile: {
    mmr: number;
    gamesPlayed: number;
    wins: number;
    losses: number;
    draws: number;
    rankTier: string;
    peakMmr: number;
  };
}

interface AuthState {
  // State
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isConnected: boolean;
  error: string | null;
  authProvider: AuthProvider;
  myReferralCode: ReferralCodeInfo | null;
  showLoginPage: boolean;

  // Actions
  authenticate: () => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
  setConnected: (connected: boolean) => void;
  refreshProfile: () => Promise<void>;

  // Web auth actions
  bridgeLogin: (bridgeUserId: string, displayName?: string) => Promise<void>;
  webLogin: (nickname: string, password: string) => Promise<void>;
  webRegister: (nickname: string, password: string, referralCode: string) => Promise<void>;
  telegramWebLogin: (payload: TelegramLoginPayload) => Promise<void>;
  checkStoredSession: () => Promise<boolean>;
  fetchMyReferralCode: () => Promise<void>;
  setShowLoginPage: (show: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      // Initial state
      user: null,
      isAuthenticated: false,
      isLoading: false,
      isConnected: false,
      error: null,
      authProvider: null,
      myReferralCode: null,
      showLoginPage: false,

      // Authenticate using Telegram initData
      authenticate: async () => {
        set({ isLoading: true, error: null });

        try {
          // Get initData from Telegram SDK
          const initData = telegram.initData;

          if (!initData) {
            console.error('[Auth] No initData. DEV:', import.meta.env.DEV);
            throw new Error('This app must be opened from Telegram');
          }

          // Authenticate with server
          const authResult = await nakama.authenticateWithTelegram(initData);

          // Transform to AuthUser
          const user: AuthUser = {
            userId: authResult.userId,
            username: authResult.username,
            telegramId: authResult.telegramId,
            displayName: authResult.displayName,
            photoUrl: authResult.photoUrl,
            profile: {
              mmr: authResult.profile.mmr,
              gamesPlayed: authResult.profile.gamesPlayed,
              wins: authResult.profile.wins,
              losses: authResult.profile.losses || 0,
              draws: authResult.profile.draws || 0,
              rankTier: authResult.profile.rankTier,
              peakMmr: authResult.profile.peakMmr || authResult.profile.mmr,
            },
          };

          // Connect socket
          await nakama.connect();

          set({
            user,
            isAuthenticated: true,
            isLoading: false,
            isConnected: true,
            error: null,
            authProvider: 'telegram',
            showLoginPage: false,
          });
          localStorage.setItem('auth_provider', 'telegram');

          // Signal Telegram that app is ready
          telegram.ready();
        } catch (error) {
          set({
            user: null,
            isAuthenticated: false,
            isLoading: false,
            isConnected: false,
            error: error instanceof Error ? error.message : 'Authentication failed',
            authProvider: null,
          });
        }
      },

      // Bridge login from external host app
      bridgeLogin: async (bridgeUserId: string, displayName?: string) => {
        set({ isLoading: true, error: null });

        try {
          const result = await nakama.loginBridge({
            bridgeUserId,
            displayName,
            bridgeDisplayName: displayName,
          });
          const fallbackName = displayName || bridgeUserId;
          const preferredName = result.displayName || result.username || fallbackName;

          const user: AuthUser = {
            userId: result.userId || '',
            username: preferredName,
            telegramId: 0,
            displayName: preferredName,
            photoUrl: '',
            profile: {
              mmr: result.globalMmr?.mmr || 1000,
              gamesPlayed: result.globalMmr?.gamesPlayed || 0,
              wins: result.globalMmr?.wins || 0,
              losses: result.globalMmr?.losses || 0,
              draws: result.globalMmr?.draws || 0,
              rankTier: result.globalMmr?.rankTier || 'bronze',
              peakMmr: result.globalMmr?.peakMmr || result.globalMmr?.mmr || 1000,
            },
          };

          await nakama.connect();

          set({
            user,
            isAuthenticated: true,
            isLoading: false,
            isConnected: true,
            error: null,
            authProvider: 'web',
            showLoginPage: false,
          });
          localStorage.setItem('auth_provider', 'web');
        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : 'Bridge login failed',
          });
          throw error;
        }
      },

      // Web login
      webLogin: async (nickname: string, password: string) => {
        set({ isLoading: true, error: null });

        try {
          const result = await nakama.loginWeb(nickname, password);

          const user: AuthUser = {
            userId: result.userId || '',
            username: result.username || nickname,
            telegramId: 0, // Web users don't have Telegram ID
            displayName: result.displayName || nickname,
            photoUrl: '', // Web users don't have avatar initially
            profile: {
              mmr: result.globalMmr?.mmr || 1000,
              gamesPlayed: result.globalMmr?.gamesPlayed || 0,
              wins: result.globalMmr?.wins || 0,
              losses: result.globalMmr?.losses || 0,
              draws: result.globalMmr?.draws || 0,
              rankTier: result.globalMmr?.rankTier || 'bronze',
              peakMmr: result.globalMmr?.peakMmr || result.globalMmr?.mmr || 1000,
            },
          };

          await nakama.connect();

          set({
            user,
            isAuthenticated: true,
            isLoading: false,
            isConnected: true,
            error: null,
            authProvider: 'web',
            showLoginPage: false,
          });
          localStorage.setItem('auth_provider', 'web');
        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : 'Login failed',
          });
          throw error;
        }
      },

      // Web registration
      webRegister: async (nickname: string, password: string, referralCode: string) => {
        set({ isLoading: true, error: null });

        try {
          const result = await nakama.registerWeb(nickname, password, referralCode);

          const user: AuthUser = {
            userId: result.userId || '',
            username: result.username || nickname,
            telegramId: 0,
            displayName: result.displayName || nickname,
            photoUrl: '',
            profile: {
              mmr: result.globalMmr?.mmr || 1000,
              gamesPlayed: result.globalMmr?.gamesPlayed || 0,
              wins: result.globalMmr?.wins || 0,
              losses: result.globalMmr?.losses || 0,
              draws: result.globalMmr?.draws || 0,
              rankTier: result.globalMmr?.rankTier || 'bronze',
              peakMmr: result.globalMmr?.peakMmr || result.globalMmr?.mmr || 1000,
            },
          };

          await nakama.connect();

          set({
            user,
            isAuthenticated: true,
            isLoading: false,
            isConnected: true,
            error: null,
            authProvider: 'web',
            showLoginPage: false,
            myReferralCode: result.referralCode ? {
              code: result.referralCode,
              maxUses: 10,
              currentUses: 0,
              isActive: true,
              createdAt: new Date().toISOString(),
            } : null,
          });
          localStorage.setItem('auth_provider', 'web');
        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : 'Registration failed',
          });
          throw error;
        }
      },

      // Telegram web login via widget
      telegramWebLogin: async (payload: TelegramLoginPayload) => {
        set({ isLoading: true, error: null });

        try {
          const authResult = await nakama.authenticateWithTelegramLogin(payload);

          const user: AuthUser = {
            userId: authResult.userId,
            username: authResult.username,
            telegramId: authResult.telegramId,
            displayName: authResult.displayName,
            photoUrl: authResult.photoUrl,
            profile: {
              mmr: authResult.profile.mmr,
              gamesPlayed: authResult.profile.gamesPlayed,
              wins: authResult.profile.wins,
              losses: authResult.profile.losses || 0,
              draws: authResult.profile.draws || 0,
              rankTier: authResult.profile.rankTier,
              peakMmr: authResult.profile.peakMmr || authResult.profile.mmr,
            },
          };

          await nakama.connect();

          set({
            user,
            isAuthenticated: true,
            isLoading: false,
            isConnected: true,
            error: null,
            authProvider: 'telegram',
            showLoginPage: false,
          });
          localStorage.setItem('auth_provider', 'telegram');
        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : 'Telegram login failed',
          });
          throw error;
        }
      },

      // Check for stored session (web or Telegram)
      checkStoredSession: async () => {
        const preferred = localStorage.getItem('auth_provider');

        const restoreTelegram = async (): Promise<boolean> => {
          if (!nakama.hasStoredTelegramSession()) {
            return false;
          }

          set({ isLoading: true, error: null });

          try {
            const restored = await nakama.restoreTelegramWebSession();
            if (!restored) {
              set({ isLoading: false });
              return false;
            }

            const profile = await nakama.rpc<{
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
            }>('get_profile');

            const telegramId = nakama.getStoredTelegramId() || 0;
            const user: AuthUser = {
              userId: profile.userId,
              username: profile.username,
              telegramId,
              displayName: profile.displayName || profile.username,
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

            await nakama.connect();

            set({
              user,
              isAuthenticated: true,
              isLoading: false,
              isConnected: true,
              error: null,
              authProvider: 'telegram',
              showLoginPage: false,
            });

            localStorage.setItem('auth_provider', 'telegram');
            return true;
          } catch (error) {
            console.error('Failed to restore Telegram session:', error);
            nakama.clearTelegramWebSession();
            set({ isLoading: false });
            return false;
          }
        };

        const restoreWeb = async (): Promise<boolean> => {
          if (!nakama.hasStoredWebSession()) {
            return false;
          }

          set({ isLoading: true, error: null });

          try {
            const restored = await nakama.restoreWebSession();
            if (!restored) {
              set({ isLoading: false });
              return false;
            }

            const profile = await nakama.rpc<{
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
            }>('get_profile');

            const user: AuthUser = {
              userId: profile.userId,
              username: profile.username,
              telegramId: 0,
              displayName: profile.displayName || profile.username,
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

            await nakama.connect();

            set({
              user,
              isAuthenticated: true,
              isLoading: false,
              isConnected: true,
              error: null,
              authProvider: 'web',
              showLoginPage: false,
            });

            localStorage.setItem('auth_provider', 'web');
            return true;
          } catch (error) {
            console.error('Failed to restore web session:', error);
            nakama.clearWebSession();
            set({ isLoading: false });
            return false;
          }
        };

        if (preferred === 'telegram') {
          if (await restoreTelegram()) return true;
          if (await restoreWeb()) return true;
          return false;
        }

        if (preferred === 'web') {
          if (await restoreWeb()) return true;
          if (await restoreTelegram()) return true;
          return false;
        }

        if (await restoreTelegram()) return true;
        if (await restoreWeb()) return true;
        return false;
      },

      // Fetch user's referral code
      fetchMyReferralCode: async () => {
        try {
          const code = await nakama.getMyReferralCode();
          set({ myReferralCode: code });
        } catch (error) {
          console.error('Failed to fetch referral code:', error);
        }
      },

      // Show/hide login page
      setShowLoginPage: (show: boolean) => {
        set({ showLoginPage: show });
      },

      // Logout
      logout: async () => {
        const { authProvider } = get();
        if (authProvider === 'web') {
          await nakama.logoutWeb();
        }
        const isTelegramApp = telegram.isAvailable && telegram.initData;
        nakama.disconnect();
        localStorage.removeItem('nakama_session');
        if (authProvider === 'web') {
          nakama.clearWebSession();
        } else if (authProvider === 'telegram') {
          nakama.clearTelegramWebSession();
        }
        localStorage.removeItem('auth_provider');
        set({
          user: null,
          isAuthenticated: false,
          isConnected: false,
          error: null,
          authProvider: null,
          myReferralCode: null,
          showLoginPage: !isTelegramApp,
        });
      },

      // Clear error
      clearError: () => {
        set({ error: null });
      },

      // Set connected state
      setConnected: (connected: boolean) => {
        set({ isConnected: connected });
      },

      // Refresh profile data from server
      refreshProfile: async () => {
        const { user } = get();
        if (!user || !nakama.isAuthenticated()) return;
        const requestUserId = user.userId;

        try {
          const profile = await nakama.rpc<{
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
          }>('get_profile');

          set((state) => {
            if (!state.user || state.user.userId !== requestUserId) {
              return state;
            }
            return {
              user: {
                ...state.user,
                displayName: profile.displayName || state.user.displayName,
                photoUrl: typeof profile.avatarUrl === 'string' ? profile.avatarUrl : state.user.photoUrl,
                profile: {
                  mmr: profile.globalMmr.mmr,
                  gamesPlayed: profile.globalMmr.gamesPlayed,
                  wins: profile.globalMmr.wins,
                  losses: profile.globalMmr.losses || 0,
                  draws: profile.globalMmr.draws || 0,
                  rankTier: profile.globalMmr.rankTier,
                  peakMmr: profile.globalMmr.peakMmr || profile.globalMmr.mmr,
                },
              },
            };
          });
        } catch (error) {
          console.error('Failed to refresh profile:', error);
        }
      },
    }),
    {
      name: 'beneficial-knowledge-auth-storage',
      partialize: (state) => ({
        user: state.user,
      }),
    }
  )
);

export default useAuthStore;
