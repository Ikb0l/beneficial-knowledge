// Notification Store
import { create } from 'zustand';
import nakama from '../shared/lib/nakama';
import { useTournamentStore } from './tournamentStore';

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  data: Record<string, unknown> | null;
  actionUrl: string | null;
  isRead: boolean;
  createdAt: string;
}

// Toast notification for real-time display
export interface ToastNotification {
  id: string;
  type: string;
  title: string;
  body?: string;
  icon?: string;
  duration?: number;
}

// Types that should show toast notifications
const TOAST_NOTIFICATION_TYPES = [
  'tournament_match_ready',
  'tournament_reminder_1h',
  'tournament_reminder_15m',
  'tournament_eliminated',
  'tournament_victory',
  'tournament_match_forfeit_win',
  'tournament_match_forfeit_loss',
  'tournament_ready_check',
  'tournament_new',
  'category_new',
  'online_threshold',
];

// Types that should count toward unread inbox badge
const INBOX_NOTIFICATION_TYPES = [
  'tournament_reminder',
  'tournament_start',
  'tournament_starting',
  'tournament_match_ready',
  'tournament_result',
  'match_result',
  'tournament_reminder_1h',
  'tournament_reminder_15m',
  'tournament_ready_check',
  'tournament_match_forfeit_win',
  'tournament_match_forfeit_loss',
  'tournament_eliminated',
  'tournament_victory',
  'tournament_complete',
  'tournament_new',
  'friend_challenge',
  'friend_request',
  'friend_accepted',
  'streak_reminder',
  'season_start',
  'season_end',
  'rank_up',
  'rank_down',
  'donation_thanks',
  'category_new',
  'online_threshold',
  'system',
  'admin_message',
];

function shouldCountUnread(type: string, content: Record<string, unknown>): boolean {
  const inboxFlag = content?.inbox as boolean | undefined;
  if (inboxFlag === true) return true;
  if (inboxFlag === false) return false;
  return INBOX_NOTIFICATION_TYPES.includes(type);
}

function isTournamentNotificationType(type: string): boolean {
  return type.startsWith('tournament_');
}

// Icons for toast notifications
const TOAST_ICONS: Record<string, string> = {
  tournament_match_ready: '\u{2694}\u{FE0F}',
  tournament_reminder_1h: '\u{23F0}',
  tournament_reminder_15m: '\u{1F514}',
  tournament_eliminated: '\u{1F494}',
  tournament_victory: '\u{1F3C6}',
  tournament_match_forfeit_win: '\u{2705}',
  tournament_match_forfeit_loss: '\u{274C}',
  tournament_ready_check: '\u{1F3AE}',
  tournament_new: '\u{1F3C1}',
  category_new: '\u{1F4DA}',
  online_threshold: '\u{1F465}',
};

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;
  error: string | null;

  // Toast notifications (real-time)
  toasts: ToastNotification[];

  // Actions
  fetchNotifications: (unreadOnly?: boolean) => Promise<void>;
  markAsRead: (notificationId: string | 'all') => Promise<void>;
  registerPushToken: (token: string, platform: string) => Promise<void>;
  addToast: (toast: Omit<ToastNotification, 'id'>) => void;
  removeToast: (id: string) => void;
  handleIncomingNotification: (notification: { id: string; type: string; content: Record<string, unknown> }) => void;
  subscribeToNotifications: () => void;
  reset: () => void;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isLoading: false,
  error: null,
  toasts: [],

  fetchNotifications: async (unreadOnly = false) => {
    try {
      set({ isLoading: true, error: null });
      const data = await nakama.rpc<{
        notifications: Notification[];
        unreadCount: number;
      }>('get_notifications', {
        unreadOnly,
        limit: 50,
      });

      set({
        notifications: data.notifications || [],
        unreadCount: data.unreadCount || 0,
        isLoading: false,
      });
    } catch (error) {
      console.error('Error fetching notifications:', error);
      set({ error: 'Failed to load notifications', isLoading: false });
    }
  },

  markAsRead: async (notificationId: string | 'all') => {
    try {
      if (notificationId === 'all') {
        await nakama.rpc('mark_notification_read', { all: true });
        set({
          notifications: get().notifications.map(n => ({ ...n, isRead: true })),
          unreadCount: 0,
        });
      } else {
        const current = get();
        const target = current.notifications.find((n) => n.id === notificationId) || null;
        const shouldDecrement = !!target && !target.isRead && shouldCountUnread(target.type, target.data || {});

        await nakama.rpc('mark_notification_read', { notificationId });
        set({
          notifications: get().notifications.map(n =>
            n.id === notificationId ? { ...n, isRead: true } : n
          ),
          unreadCount: shouldDecrement ? Math.max(0, get().unreadCount - 1) : get().unreadCount,
        });
      }
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  },

  registerPushToken: async (token: string, platform: string) => {
    try {
      await nakama.rpc('register_push_token', { token, platform });
    } catch (error) {
      console.error('Error registering push token:', error);
    }
  },

  addToast: (toast) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const newToast: ToastNotification = {
      ...toast,
      id,
      icon: toast.icon || TOAST_ICONS[toast.type] || String.fromCodePoint(0x1F4EC),
      duration: toast.duration || 5000,
    };

    set({ toasts: [...get().toasts, newToast] });

    // Auto-remove after duration
    setTimeout(() => {
      get().removeToast(id);
    }, newToast.duration);
  },

  removeToast: (id: string) => {
    set({ toasts: get().toasts.filter(t => t.id !== id) });
  },

  handleIncomingNotification: (notification) => {
    const { type, content } = notification;
    const current = get();
    const existing = current.notifications.find((n) => n.id === notification.id);
    const shouldIncrementUnread = shouldCountUnread(type, content) && (!existing || existing.isRead);

    // Increment unread count
    if (shouldIncrementUnread) {
      set({ unreadCount: current.unreadCount + 1 });
    }

    // Keep in-app notification list in sync with real-time events.
    if (shouldCountUnread(type, content) && !existing) {
      const title = (content.title as string) || type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      const bodyValue = (content.body as string) || (content.message as string) || null;
      const actionUrl = typeof content.actionUrl === 'string' ? content.actionUrl : null;
      const createdAt = typeof content.createdAt === 'string' ? content.createdAt : new Date().toISOString();
      const dataValue = content && Object.keys(content).length > 0 ? content : null;
      const incomingNotification: Notification = {
        id: notification.id,
        type,
        title,
        body: bodyValue,
        data: dataValue,
        actionUrl,
        isRead: false,
        createdAt,
      };
      set({
        notifications: [incomingNotification, ...get().notifications].slice(0, 100),
      });
    }

    // Show toast for important notification types
    if (TOAST_NOTIFICATION_TYPES.includes(type)) {
      const title = (content.title as string) || type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      const body = (content.body as string) || (content.message as string);

      get().addToast({
        type,
        title,
        body,
      });
    }

    // Keep tournament screens in sync with real-time tournament events.
    if (isTournamentNotificationType(type)) {
      const tournamentStore = useTournamentStore.getState();
      void tournamentStore.fetchTournaments(tournamentStore.lastStatusFilter || undefined, { background: true });
      void tournamentStore.fetchMyTournaments({ background: true });
      void tournamentStore.fetchCurrentTournamentAction({ background: true });
      void tournamentStore.fetchSpectatorMatches({ background: true });
    }

    // Handle specific notification types that need special action
    if (type === 'tournament_ready_check') {
      const tournamentId = content.tournamentId as string | undefined;
      const matchId = content.matchId as string | undefined;
      const opponentName = (content.opponentName as string) || 'Opponent';
      const opponentReady = content.opponentReady === true;
      const cancelled = content.cancelled === true;
      const nakamaMatchId = typeof content.nakamaMatchId === 'string' ? content.nakamaMatchId : null;
      const tournamentStore = useTournamentStore.getState();

      if (tournamentId && matchId) {
        if (cancelled) {
          const existing = tournamentStore.readyCheck;
          if (existing && existing.matchId === matchId) {
            tournamentStore.handleOpponentCancelled();
          }
          return;
        }
        const existing = tournamentStore.readyCheck;
        if (!existing || existing.matchId !== matchId) {
          tournamentStore.initiateReadyCheck(tournamentId, matchId, opponentName);
        }
        if (opponentReady) {
          tournamentStore.handleOpponentReady(nakamaMatchId);
        }
      }
    }
  },

  subscribeToNotifications: () => {
    nakama.setSocialEventCallbacks({
      onNotification: (notification: { id: string; type: string; content: Record<string, unknown> }) => {
        get().handleIncomingNotification(notification);
      },
    });
  },

  reset: () => {
    set({
      notifications: [],
      unreadCount: 0,
      isLoading: false,
      error: null,
      toasts: [],
    });
  },
}));
