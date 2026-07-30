// Admin authentication store using Zustand
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { adminNakama, type AdminAuthResponse } from '../lib/nakama';
import { telegram } from '../lib/telegram';

interface AdminAuthState {
  // State
  admin: AdminAuthResponse | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  isTelegramMiniApp: boolean;

  // Actions
  authenticate: (initData: string) => Promise<void>;
  authenticateWithTelegram: () => Promise<void>;
  loginWithToken: (telegramId: number, adminToken: string) => Promise<void>;
  checkSession: () => Promise<boolean>;
  logout: () => void;
  clearError: () => void;
}

let checkSessionPromise: Promise<boolean> | null = null;

export const useAdminAuthStore = create<AdminAuthState>()(
  persist(
    (set) => ({
      // Initial state
      admin: null,
      isAuthenticated: false,
      isLoading: true,
      error: null,
      isTelegramMiniApp: telegram.isAvailable,

      // Authenticate using Telegram initData (manual)
      authenticate: async (initData: string) => {
        set({ isLoading: true, error: null });

        try {
          const adminInfo = await adminNakama.authenticateAdmin(initData);
          adminNakama.saveSession();

          set({
            admin: adminInfo,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });
        } catch (error) {
          console.error('Admin authentication failed:', error);
          set({
            admin: null,
            isAuthenticated: false,
            isLoading: false,
            error: error instanceof Error ? error.message : 'Authentication failed',
          });
          throw error;
        }
      },

      // Authenticate automatically using Telegram Mini App initData
      authenticateWithTelegram: async () => {
        if (!telegram.isAvailable) {
          set({ isLoading: false, isTelegramMiniApp: false });
          return;
        }

        set({ isLoading: true, error: null, isTelegramMiniApp: true });

        try {
          const initData = telegram.initData;
          if (!initData) {
            throw new Error('No Telegram initData available');
          }

          const adminInfo = await adminNakama.authenticateAdmin(initData);
          adminNakama.saveSession();

          // Signal Telegram that the app is ready
          telegram.ready();
          telegram.expand();

          set({
            admin: adminInfo,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });
        } catch (error) {
          console.error('Telegram Mini App authentication failed:', error);
          set({
            admin: null,
            isAuthenticated: false,
            isLoading: false,
            error: error instanceof Error ? error.message : 'Authentication failed',
          });
          throw error;
        }
      },

      // Admin token login (server-validated)
      loginWithToken: async (telegramId: number, adminToken: string) => {
        set({ isLoading: true, error: null });

        try {
          const adminInfo = await adminNakama.authenticateAdminWithToken(telegramId, adminToken);
          adminNakama.saveSession();

          set({
            admin: adminInfo,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });
        } catch (error) {
          console.error('Admin token login failed:', error);
          set({
            admin: null,
            isAuthenticated: false,
            isLoading: false,
            error: error instanceof Error ? error.message : 'Login failed',
          });
          throw error;
        }
      },

      // Check if existing session is valid, or auto-authenticate via Telegram Mini App
      checkSession: async () => {
        if (checkSessionPromise) {
          return checkSessionPromise;
        }

        checkSessionPromise = (async () => {
          set({ isLoading: true, isTelegramMiniApp: telegram.isAvailable });

          // If running as Telegram Mini App, authenticate with initData
          if (telegram.isAvailable && telegram.initData) {
            try {
              const adminInfo = await adminNakama.authenticateAdmin(telegram.initData);
              adminNakama.saveSession();

              // Signal Telegram that the app is ready
              telegram.ready();
              telegram.expand();

              set({
                admin: adminInfo,
                isAuthenticated: true,
                isLoading: false,
              });
              return true;
            } catch (error) {
              console.error('Telegram Mini App auth failed:', error);
              set({
                admin: null,
                isAuthenticated: false,
                isLoading: false,
                error: error instanceof Error ? error.message : 'Not authorized as admin',
              });
              return false;
            }
          }

          // Otherwise, try to restore existing session
          try {
            const restored = await adminNakama.restoreSession();
            if (restored) {
              const adminInfo = adminNakama.getAdminInfo();
              set({
                admin: adminInfo,
                isAuthenticated: true,
                isLoading: false,
              });
              return true;
            }
          } catch (error) {
            console.error('Session check failed:', error);
          }

          set({
            admin: null,
            isAuthenticated: false,
            isLoading: false,
          });
          return false;
        })();

        try {
          return await checkSessionPromise;
        } finally {
          checkSessionPromise = null;
        }
      },

      // Logout
      logout: () => {
        adminNakama.logout();
        set({
          admin: null,
          isAuthenticated: false,
          error: null,
        });

        // If in Telegram Mini App, close the app
        if (telegram.isAvailable) {
          telegram.close();
        }
      },

      // Clear error
      clearError: () => {
        set({ error: null });
      },
    }),
    {
      name: 'admin-auth-storage',
      partialize: (state) => ({
        admin: state.admin,
      }),
    }
  )
);

export default useAdminAuthStore;
