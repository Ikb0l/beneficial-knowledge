// Notifications Screen - View and manage notifications
import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNotificationStore, type Notification } from '../stores/notificationStore';
import { cn } from '../lib/utils/cn';
import { Card } from './ui';
import { screenVariants, containerVariants, itemVariants } from '../lib/animations/variants';

interface NotificationsScreenProps {
  onBack: () => void;
  onOpenTournament?: (tournamentId: string) => void;
}

const typeIcons: Record<string, string> = {
  tournament_reminder: '\u{1F3C6}',
  tournament_start: '\u{1F514}',
  tournament_starting: '\u{1F514}',
  tournament_result: '\u{1F39E}\u{FE0F}',
  match_result: '\u{2694}\u{FE0F}',
  friend_request: '\u{1F44B}',
  friend_accepted: '\u{1F91D}',
  streak_reminder: '\u{1F525}',
  season_end: '\u{1F31F}',
  season_start: '\u{1F331}',
  donation_thanks: '\u{1F49D}',
  system: '\u{1F4E2}',
  admin_message: '\u{1F4E3}',
  tournament_match_ready: '\u{2694}\u{FE0F}',
  tournament_complete: '\u{1F3C6}',
  friend_challenge: '\u{1F3AF}',
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

const typeColors: Record<string, string> = {
  tournament_reminder: 'bg-blue-500/20',
  tournament_start: 'bg-yellow-500/20',
  tournament_starting: 'bg-yellow-500/20',
  tournament_result: 'bg-purple-500/20',
  match_result: 'bg-green-500/20',
  friend_request: 'bg-pink-500/20',
  friend_accepted: 'bg-teal-500/20',
  streak_reminder: 'bg-amber-500/20',
  season_end: 'bg-indigo-500/20',
  season_start: 'bg-emerald-500/20',
  donation_thanks: 'bg-rose-500/20',
  system: 'bg-slate-500/20',
  admin_message: 'bg-slate-500/20',
  tournament_match_ready: 'bg-yellow-500/20',
  tournament_complete: 'bg-purple-500/20',
  friend_challenge: 'bg-orange-500/20',
  tournament_reminder_1h: 'bg-blue-500/20',
  tournament_reminder_15m: 'bg-orange-500/20',
  tournament_eliminated: 'bg-red-500/20',
  tournament_victory: 'bg-yellow-500/20',
  tournament_match_forfeit_win: 'bg-green-500/20',
  tournament_match_forfeit_loss: 'bg-red-500/20',
  tournament_ready_check: 'bg-teal-500/20',
  tournament_new: 'bg-indigo-500/20',
  category_new: 'bg-blue-500/20',
  online_threshold: 'bg-cyan-500/20',
};

function NotificationItem({
  notification,
  onMarkRead,
  onOpenTournament,
}: {
  notification: Notification;
  onMarkRead: () => void;
  onOpenTournament?: (tournamentId: string) => void;
}) {
  const iconValue = typeIcons[notification.type] || '\u{1F4EC}';
  const bgColor = typeColors[notification.type] || 'bg-white/10';
  const tournamentId = typeof notification.data?.tournamentId === 'string'
    ? notification.data.tournamentId
    : null;
  const parseTournamentIdFromActionUrl = (actionUrl: string | null): string | null => {
    if (!actionUrl) return null;
    const match = actionUrl.match(/\/tournament\/([a-f0-9-]+)/i);
    return match ? match[1] : null;
  };
  const derivedTournamentId = tournamentId || parseTournamentIdFromActionUrl(notification.actionUrl);

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <motion.div
      variants={itemVariants}
      className={cn(
        'relative overflow-hidden rounded-xl transition-all',
        notification.isRead ? 'bg-white/5' : 'bg-white/10 border border-accent-teal/30'
      )}
      onClick={!notification.isRead ? onMarkRead : undefined}
    >
      {!notification.isRead && (
        <div className="absolute top-3 right-3 w-2 h-2 rounded-full bg-accent-teal animate-pulse" />
      )}

      <div className="p-4 flex gap-3">
        <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center text-2xl', bgColor)}>
          {iconValue}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className={cn(
            'font-medium mb-1',
            notification.isRead ? 'text-text-secondary' : 'text-white'
          )}>
            {notification.title}
          </h3>
          {notification.body && (
            <p className="text-sm text-text-secondary line-clamp-2">
              {notification.body}
            </p>
          )}
          <p className="text-xs text-text-secondary mt-2">
            {formatTime(notification.createdAt)}
          </p>
        </div>
        {derivedTournamentId && onOpenTournament && (
          <button
            onClick={(event) => {
              event.stopPropagation();
              if (!notification.isRead) {
                onMarkRead();
              }
              onOpenTournament(derivedTournamentId);
            }}
            className="ml-2 px-3 py-1 text-xs font-medium rounded-full bg-accent-teal/20 text-accent-teal hover:bg-accent-teal/30"
          >
            Open
          </button>
        )}
      </div>
    </motion.div>
  );
}

export function NotificationsScreen({ onBack, onOpenTournament }: NotificationsScreenProps) {
  const {
    notifications,
    unreadCount,
    isLoading,
    error,
    fetchNotifications,
    markAsRead,
  } = useNotificationStore();

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const handleMarkAllRead = async () => {
    await markAsRead('all');
  };

  const handleMarkRead = async (notificationId: string) => {
    await markAsRead(notificationId);
  };

  return (
    <motion.div
      variants={screenVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="content-scrollable bg-gradient-main"
    >
      <div className="sticky top-0 z-10 bg-bg-primary/80 backdrop-blur-lg border-b border-white/10">
        <div className="flex items-center justify-between p-4">
          <button
            onClick={onBack}
            className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center"
          >
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-xl font-bold text-white">Notifications</h1>
            {unreadCount > 0 && (
              <span className="bg-accent-teal text-bg-primary text-xs font-bold px-2 py-0.5 rounded-full">
                {unreadCount}
              </span>
            )}
          </div>
          {unreadCount > 0 ? (
            <button
              onClick={handleMarkAllRead}
              className="text-sm text-accent-teal font-medium"
            >
              Mark all read
            </button>
          ) : (
            <div className="w-20" />
          )}
        </div>
      </div>

      <div className="px-4 py-4">
        {error && (
          <Card variant="glass" className="bg-error/20 border-error/30 mb-4">
            <p className="text-error text-sm text-center">{error}</p>
          </Card>
        )}

        {isLoading && (
          <div className="flex justify-center py-12">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
              className="w-12 h-12 border-3 border-accent-teal border-t-transparent rounded-full"
            />
          </div>
        )}

        {!isLoading && notifications.length > 0 && (
          <motion.div
            variants={containerVariants}
            initial="initial"
            animate="animate"
            className="flex flex-col gap-3"
          >
            {notifications.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                onMarkRead={() => handleMarkRead(notification.id)}
                onOpenTournament={onOpenTournament}
              />
            ))}
          </motion.div>
        )}

        {!isLoading && notifications.length === 0 && (
          <Card variant="glass" className="text-center py-12">
            <span className="text-5xl mb-4 block">{'\u{1F514}'}</span>
            <h3 className="font-heading font-bold text-lg text-white mb-2">
              No Notifications
            </h3>
            <p className="text-text-secondary text-sm">
              You&apos;re all caught up! Check back later.
            </p>
          </Card>
        )}
      </div>
    </motion.div>
  );
}

export default NotificationsScreen;
