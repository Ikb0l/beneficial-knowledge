// Settings Store - User preferences and app settings
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { changeLanguage, type LanguageCode } from '../lib/i18n';
import { requestNotificationPermission } from '../lib/notifications';
import nakama from '../shared/lib/nakama';
import { useAuthStore } from './authStore';
import { useProfileStore } from './profileStore';

export interface UserSettings {
  // Sound settings
  soundEffectsEnabled: boolean;
  soundEffectsVolume: number;
  musicEnabled: boolean;
  musicVolume: number;

  // Haptics
  hapticsEnabled: boolean;

  // Notifications
  matchFoundNotification: boolean;
  tournamentNotification: boolean;
  friendRequestNotification: boolean;
  challengeNotification: boolean;
  categoryNotification: boolean;
  onlineThresholdNotification: boolean;

  // Gameplay
  showTimer: boolean;
  showOpponentProgress: boolean;
  autoQueue: boolean;

  // Display
  reducedMotion: boolean;
  highContrast: boolean;

  // Language
  language: LanguageCode;
}

export interface ProfileEdit {
  displayName: string;
  avatarUrl: string;
}

interface SettingsState {
  // Settings
  settings: UserSettings;

  // Profile editing
  isEditingProfile: boolean;
  profileDraft: ProfileEdit | null;
  isSavingProfile: boolean;

  // Actions
  updateSetting: <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => void;
  syncNotificationPreferences: () => Promise<void>;
  resetSettings: () => void;

  // Profile actions
  startEditingProfile: (currentProfile: ProfileEdit) => void;
  updateProfileDraft: <K extends keyof ProfileEdit>(key: K, value: ProfileEdit[K]) => void;
  saveProfile: () => Promise<void>;
  cancelEditingProfile: () => void;

  // Account actions
  logout: () => Promise<void>;
}

const DEFAULT_SETTINGS: UserSettings = {
  soundEffectsEnabled: true,
  soundEffectsVolume: 80,
  musicEnabled: true,
  musicVolume: 10,
  hapticsEnabled: true,
  matchFoundNotification: true,
  tournamentNotification: true,
  friendRequestNotification: true,
  challengeNotification: true,
  categoryNotification: true,
  onlineThresholdNotification: true,
  showTimer: true,
  showOpponentProgress: true,
  autoQueue: false,
  reducedMotion: false,
  highContrast: false,
  language: 'uz',
};

const NOTIFICATION_SETTING_KEYS = [
  'matchFoundNotification',
  'tournamentNotification',
  'friendRequestNotification',
  'challengeNotification',
  'categoryNotification',
  'onlineThresholdNotification',
] as const;

type NotificationSettingKey = (typeof NOTIFICATION_SETTING_KEYS)[number];

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      // Initial state
      settings: DEFAULT_SETTINGS,
      isEditingProfile: false,
      profileDraft: null,
      isSavingProfile: false,

      syncNotificationPreferences: async () => {
        try {
          const result = await nakama.rpc<{ preferences?: Partial<UserSettings>; stored?: boolean }>(
            'get_notification_preferences',
            {}
          );
          if (result?.stored) {
            const serverPrefs = result.preferences || {};
            const updates: Partial<Record<NotificationSettingKey, boolean>> = {};
            for (const key of NOTIFICATION_SETTING_KEYS) {
              if (typeof serverPrefs[key] === 'boolean') {
                updates[key] = serverPrefs[key] as boolean;
              }
            }
            if (Object.keys(updates).length > 0) {
              const mergedSettings = { ...get().settings, ...updates };
              set({ settings: mergedSettings });
              if (Object.values(updates).some((value) => value === true)) {
                requestNotificationPermission().catch(() => {});
              }
            }
          } else {
            const local = get().settings;
            const payload: Partial<Record<NotificationSettingKey, boolean>> = {};
            for (const key of NOTIFICATION_SETTING_KEYS) {
              payload[key] = local[key];
            }
            await nakama.rpc('update_notification_preferences', payload);
          }
        } catch (error) {
          console.warn('Failed to sync notification preferences:', error);
        }
      },

      // Actions
      updateSetting: (key, value) => {
        set({
          settings: {
            ...get().settings,
            [key]: value,
          },
        });
        // Sync language with i18n when changed
        if (key === 'language') {
          changeLanguage(value as LanguageCode);
        }
        if (
          value === true
          && (
            key === 'matchFoundNotification'
            || key === 'tournamentNotification'
            || key === 'friendRequestNotification'
            || key === 'challengeNotification'
            || key === 'categoryNotification'
            || key === 'onlineThresholdNotification'
          )
        ) {
          requestNotificationPermission().catch(() => {});
        }
        if (NOTIFICATION_SETTING_KEYS.includes(key as NotificationSettingKey)) {
          const notificationKey = key as NotificationSettingKey;
          const notificationValue = value as boolean;
          void (async () => {
            try {
              await nakama.rpc('update_notification_preferences', { [notificationKey]: notificationValue });
            } catch (error) {
              console.warn('Failed to persist notification preference:', error);
            }
          })();
        }
      },

      resetSettings: () => {
        set({ settings: DEFAULT_SETTINGS });
        changeLanguage(DEFAULT_SETTINGS.language);
      },

      startEditingProfile: (currentProfile) => {
        set({
          isEditingProfile: true,
          profileDraft: { ...currentProfile },
        });
      },

      updateProfileDraft: (key, value) => {
        const { profileDraft } = get();
        if (profileDraft) {
          set({
            profileDraft: {
              ...profileDraft,
              [key]: value,
            },
          });
        }
      },

      saveProfile: async () => {
        const { profileDraft } = get();
        if (!profileDraft) return;

        set({ isSavingProfile: true });
        try {
          await nakama.rpc('update_profile', {
            displayName: profileDraft.displayName,
            avatarUrl: profileDraft.avatarUrl,
          });
          set({
            isEditingProfile: false,
            profileDraft: null,
            isSavingProfile: false,
          });
          try {
            const authStore = useAuthStore.getState();
            await authStore.refreshProfile();

            const userId = authStore.user?.userId;
            if (userId) {
              const profileStore = useProfileStore.getState();
              await profileStore.fetchProfile(userId);
              await profileStore.fetchMatchHistory(userId, 0, 8);
            }
          } catch (refreshError) {
            console.warn('Failed to refresh profile after save:', refreshError);
          }
        } catch (error) {
          console.error('Error saving profile:', error);
          set({ isSavingProfile: false });
          throw error;
        }
      },

      cancelEditingProfile: () => {
        set({
          isEditingProfile: false,
          profileDraft: null,
        });
      },

      logout: async () => {
        try {
          nakama.disconnect();
          await useAuthStore.getState().logout();
        } catch (error) {
          console.error('Error logging out:', error);
        }
      },
    }),
    {
      name: 'beneficial-knowledge-settings',
      partialize: (state) => ({ settings: state.settings }),
      merge: (persistedState, currentState) => {
        const persisted = (persistedState as Partial<SettingsState>) || {};
        const persistedSettings = (persisted.settings as Partial<UserSettings>) || {};
        return {
          ...currentState,
          ...persisted,
          settings: {
            ...DEFAULT_SETTINGS,
            ...persistedSettings,
          },
        };
      },
      onRehydrateStorage: () => (state) => {
        const lang = state?.settings?.language ?? DEFAULT_SETTINGS.language;
        changeLanguage(lang);
      },
    }
  )
);

export default useSettingsStore;
