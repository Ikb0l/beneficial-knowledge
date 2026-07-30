import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../stores/authStore';
import { useNotificationStore } from '../stores/notificationStore';
import { useRankStore } from '../stores/rankStore';
import { useTournamentStore } from '../stores/tournamentStore';
import { useGameStore } from '../stores/gameStore';
import {
  ProfileSection,
  GamesStatCard,
  WinRateStatCard,
  OnlineStatCard,
  TournamentsAction,
} from '../components/home';
import { BellIcon, SettingsIcon } from '../components/ui/Icons';
import { containerVariants, itemVariants, screenVariants } from '../lib/animations/variants';
import nakama from '../shared/lib/nakama';
import { getTournamentJoinErrorMessage } from '../components/tournament/joinErrors';
import { getTournamentCurrentActionLabel } from '../components/tournament/currentActionCopy';

interface HomeScreenProps {
  onOpenSettings?: () => void;
  onOpenTournaments?: () => void;
  onOpenTournamentDetail?: (tournamentId: string) => void;
  onOpenNotifications?: () => void;
}

export function HomeScreen({
  onOpenSettings,
  onOpenTournaments,
  onOpenTournamentDetail,
  onOpenNotifications,
}: HomeScreenProps) {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { unreadCount } = useNotificationStore();
  const { fetchRankTiers, getRankByMmr, getRankProgress, getMmrToNextRank, getNextRank } = useRankStore();
  const { currentTournamentAction, fetchCurrentTournamentAction, initiateReadyCheck } = useTournamentStore();
  const { joinDirectMatch } = useGameStore();
  const [onlineStats, setOnlineStats] = useState<{ playersOnline: number; activeMatches: number } | null>(null);
  const [tournamentActionError, setTournamentActionError] = useState<string | null>(null);

  useEffect(() => {
    fetchRankTiers();
  }, [fetchRankTiers]);

  useEffect(() => {
    if (!user) return;
    void fetchCurrentTournamentAction({ background: true });
    const interval = setInterval(() => {
      void fetchCurrentTournamentAction({ background: true });
    }, 15000);
    return () => clearInterval(interval);
  }, [user, fetchCurrentTournamentAction]);

  useEffect(() => {
    let mounted = true;

    const loadOnlineStats = async () => {
      try {
        const data = await nakama.rpc<{ playersOnline: number; activeMatches: number }>('online_stats', {});
        if (mounted) {
          setOnlineStats({
            playersOnline: data.playersOnline,
            activeMatches: data.activeMatches,
          });
        }
      } catch {
        // Keep the latest successful value to avoid flicker on transient RPC failures.
      }
    };

    loadOnlineStats();
    const interval = setInterval(loadOnlineStats, 30000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  if (!user) return null;

  const displayName = user.displayName || t('profile.defaultPlayerName');
  const mmr = user.profile?.mmr ?? 1089;
  const gamesPlayed = user.profile?.gamesPlayed ?? 32;
  const wins = user.profile?.wins ?? 12;
  const winRate = gamesPlayed > 0 ? Math.round((wins / gamesPlayed) * 100) : 0;
  const currentRankInfo = getRankByMmr(mmr);
  const rank = currentRankInfo.tierKey as 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond' | 'master' | 'grandmaster';
  const nextRankInfo = getNextRank(mmr);
  const nextRankName = nextRankInfo ? nextRankInfo.name : null;
  const rankProgress = getRankProgress(mmr);
  const clampedRankProgress = Math.min(Math.max(rankProgress, 0), 100);
  const rankRemaining = getMmrToNextRank(mmr) || 0;
  const isMaxRank = nextRankInfo === null;
  const primaryTournamentAction =
    currentTournamentAction &&
    currentTournamentAction.kind !== 'none' &&
    currentTournamentAction.kind !== 'view_results'
      ? currentTournamentAction
      : null;
  const tournamentActionTitle =
    primaryTournamentAction
      ? getTournamentCurrentActionLabel(primaryTournamentAction, t)
      : t('home.tournaments');
  const tournamentActionSubtitle =
    primaryTournamentAction
      ? (primaryTournamentAction.tournamentName || t('home.tournamentsActionSubtitle'))
      : currentTournamentAction?.kind === 'view_results'
        ? t('home.tournamentsResultsSubtitle', 'Find your next tournament or review past results.')
      : t('home.tournamentsActionSubtitle');

  const openTournamentAction = async () => {
    setTournamentActionError(null);

    if (
      primaryTournamentAction &&
      ['ready_up', 'play_match', 'rejoin_match'].includes(primaryTournamentAction.kind) &&
      primaryTournamentAction.nakamaMatchId
    ) {
      try {
        await joinDirectMatch(primaryTournamentAction.nakamaMatchId);
      } catch (joinError) {
        console.error('Failed to join current tournament match:', joinError);
        setTournamentActionError(getTournamentJoinErrorMessage(joinError, t, 'play', {
          participantStatus: primaryTournamentAction.participantStatus,
          finalPlacement: primaryTournamentAction.finalPlacement,
          roundNumber: primaryTournamentAction.roundNumber,
        }));
      }
      return;
    }

    if (
      primaryTournamentAction &&
      primaryTournamentAction.kind === 'ready_up' &&
      primaryTournamentAction.tournamentId &&
      primaryTournamentAction.matchId
    ) {
      initiateReadyCheck(
        primaryTournamentAction.tournamentId,
        primaryTournamentAction.matchId,
        primaryTournamentAction.opponentName || t('tournaments.opponent', 'Opponent')
      );
      return;
    }

    if (primaryTournamentAction?.tournamentId && onOpenTournamentDetail) {
      onOpenTournamentDetail(primaryTournamentAction.tournamentId);
      return;
    }

    onOpenTournaments?.();
  };

  return (
    <motion.div
      variants={screenVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="relative content-scrollable overflow-x-hidden font-heading"
      style={{
        background: 'linear-gradient(180deg, #081126 0%, #12274f 52%, #0b1020 100%)',
      }}
    >
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-24 -left-20 h-56 w-56 rounded-full bg-[#20c5ff]/16 blur-3xl" />
        <div className="absolute top-16 right-0 h-44 w-44 rounded-full bg-[#7c78ff]/14 blur-3xl" />
        <div className="absolute bottom-6 left-0 h-52 w-52 rounded-full bg-[#20c5ff]/8 blur-3xl" />
      </div>

      <motion.div
        variants={containerVariants}
        initial="initial"
        animate="animate"
        className="relative z-10 mx-auto w-full max-w-[var(--app-content-max-width)]"
      >
        <motion.div variants={itemVariants} className="flex items-center justify-end px-4 sm:px-6 lg:px-8 pt-4 safe-area-top">
          <div className="flex items-center gap-2">
            <motion.button
              onClick={onOpenNotifications}
              whileTap={{ scale: 0.96 }}
              className="relative w-11 h-11 rounded-full bg-[#102149]/85 border border-[#8fb4e54d] shadow-[0_8px_20px_rgba(7,12,24,0.35)] flex items-center justify-center"
              aria-label={t('notifications.title')}
            >
              <BellIcon size={22} className="text-[#d6e9ff]" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-[#ff8a4d] rounded-full flex items-center justify-center text-[10px] font-bold text-white">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </motion.button>

            <motion.button
              onClick={onOpenSettings}
              whileTap={{ scale: 0.96 }}
              className="w-11 h-11 rounded-full bg-[#102149]/85 border border-[#8fb4e54d] shadow-[0_8px_20px_rgba(7,12,24,0.35)] flex items-center justify-center"
              aria-label={t('settings.title')}
            >
              <SettingsIcon size={22} className="text-[#d6e9ff]" />
            </motion.button>
          </div>
        </motion.div>

        <div className="px-4 sm:px-6 lg:px-8 pb-6">
          <div className="space-y-4">
            <motion.div variants={itemVariants}>
              <ProfileSection
                photoUrl={user.photoUrl}
                displayName={displayName}
                rank={rank}
                mmr={mmr}
                rankProgress={clampedRankProgress}
                rankRemaining={rankRemaining}
                nextRankName={nextRankName}
                isMaxRank={isMaxRank}
              />
            </motion.div>

            <motion.div variants={itemVariants}>
              <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 sm:gap-4">
                <GamesStatCard value={gamesPlayed} index={0} />
                <WinRateStatCard value={winRate} index={2} />
                <OnlineStatCard value={onlineStats?.playersOnline ?? 0} index={3} />
              </div>
            </motion.div>

            <motion.div variants={itemVariants}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                <TournamentsAction
                  onClick={openTournamentAction}
                  title={tournamentActionTitle}
                  subtitle={tournamentActionSubtitle}
                />
                {tournamentActionError && (
                  <p className="rounded-lg border border-red-300/25 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                    {tournamentActionError}
                  </p>
                )}
              </div>
            </motion.div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
