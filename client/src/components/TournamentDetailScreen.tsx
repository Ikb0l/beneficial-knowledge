import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useTournamentStore, type TournamentMatch, type TournamentParticipant } from '../stores/tournamentStore';
import { useAuthStore } from '../stores/authStore';
import { useSettingsStore } from '../stores/settingsStore';
import { nakama } from '../shared/lib/nakama';
import { useGameStore } from '../stores/gameStore';
import { cn } from '../lib/utils/cn';
import { Avatar, Badge, Button, Card, Confetti, VictoryBurst } from './ui';
import {
  BracketView,
  TournamentMetaGrid,
  TournamentStatusBadge,
  TournamentSummaryPanel,
  canRegisterForTournament,
  canWithdrawFromTournament,
  formatTournamentDateTime,
  formatTournamentRelativeTime,
  getTournamentFormatLabel,
  getTournamentFormatLabelKey,
  isTournamentEligibleForMmr,
} from './tournament';
import { containerVariants, itemVariants, screenVariants } from '../lib/animations/variants';
import { useDialog } from '../hooks/useDialog';
import { getTournamentJoinErrorMessage } from './tournament/joinErrors';

interface TournamentDetailScreenProps {
  tournamentId: string;
  onBack: () => void;
}

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmText,
  cancelText,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  useDialog({
    open: isOpen,
    onClose: onCancel,
    dialogRef,
    initialFocusRef: cancelButtonRef,
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" role="presentation">
      <motion.div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        initial={{ scale: 0.94, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.94, opacity: 0 }}
        className="w-full max-w-sm"
      >
        <Card variant="elevated" className="border border-white/10 text-center">
          <div className="space-y-3">
            <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-red-500/20 text-xl text-red-300">
              {String.fromCodePoint(0x26A0, 0xFE0F)}
            </span>
            <h3 id={titleId} className="text-lg font-heading font-bold text-white">
              {title}
            </h3>
            <p className="text-sm text-text-secondary">{message}</p>
            <div className="flex gap-2 pt-2">
              <Button ref={cancelButtonRef} variant="ghost" fullWidth onClick={onCancel}>
                {cancelText}
              </Button>
              <Button variant="danger" fullWidth onClick={onConfirm}>
                {confirmText}
              </Button>
            </div>
          </div>
        </Card>
      </motion.div>
    </div>
  );
}

const participantStatusStyles: Record<string, string> = {
  registered: 'bg-blue-500/20 text-blue-300 border-blue-300/30',
  checked_in: 'bg-cyan-500/20 text-cyan-300 border-cyan-300/30',
  active: 'bg-emerald-500/20 text-emerald-300 border-emerald-300/30',
  eliminated: 'bg-red-500/20 text-red-300 border-red-300/30',
  winner: 'bg-amber-500/25 text-amber-200 border-amber-300/40',
  forfeited: 'bg-orange-500/20 text-orange-300 border-orange-300/30',
  disqualified: 'bg-rose-500/20 text-rose-300 border-rose-300/30',
};
const EMPTY_PARTICIPANTS: TournamentParticipant[] = [];
const EMPTY_MATCHES: TournamentMatch[] = [];
const TOURNAMENT_DETAIL_REFRESH_ACTIVE_MS = 10000;
const TOURNAMENT_DETAIL_REFRESH_PRESTART_MS = 15000;

export function TournamentDetailScreen({ tournamentId, onBack }: TournamentDetailScreenProps) {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const settings = useSettingsStore((state) => state.settings);
  const sessionUserId = nakama.getSession()?.user_id;
  const currentUserId = sessionUserId || user?.userId || null;
  const {
    currentTournament,
    isLoading,
    isActionLoading,
    error,
    actionError,
    clearActionError,
    fetchTournamentDetails,
    registerForTournament,
    withdrawFromTournament,
    startTournamentMatch,
    initiateReadyCheck,
  } = useTournamentStore();
  const { joinDirectMatch } = useGameStore();

  const [activeTab, setActiveTab] = useState<'brackets' | 'overview' | 'participants'>('overview');
  const [showWithdrawConfirm, setShowWithdrawConfirm] = useState(false);
  const [matchError, setMatchError] = useState<string | null>(null);
  const [isStartingMatch, setIsStartingMatch] = useState(false);
  const [showTournamentConfetti, setShowTournamentConfetti] = useState(false);
  const shownCelebrationKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    fetchTournamentDetails(tournamentId);
  }, [fetchTournamentDetails, tournamentId]);

  useEffect(() => {
    if (!currentTournament) return;
    if (
      currentTournament.tournament.status === 'in_progress' ||
      currentTournament.tournament.status === 'paused'
    ) {
      setActiveTab('brackets');
      return;
    }
    setActiveTab('overview');
  }, [currentTournament]);

  const refreshTournamentDetailsBackground = useCallback(() => {
    void fetchTournamentDetails(tournamentId, true);
  }, [fetchTournamentDetails, tournamentId]);

  useEffect(() => {
    const status = currentTournament?.tournament.status;
    const shouldAutoRefresh =
      status === 'registration' ||
      status === 'upcoming' ||
      status === 'in_progress' ||
      status === 'paused';

    if (!shouldAutoRefresh) return;

    const intervalMs =
      status === 'in_progress' || status === 'paused'
        ? TOURNAMENT_DETAIL_REFRESH_ACTIVE_MS
        : TOURNAMENT_DETAIL_REFRESH_PRESTART_MS;

    const runRefresh = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return;
      }
      refreshTournamentDetailsBackground();
    };

    const interval = setInterval(runRefresh, intervalMs);
    return () => clearInterval(interval);
  }, [currentTournament?.tournament.status, refreshTournamentDetailsBackground]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (typeof document === 'undefined') return;
      if (document.visibilityState === 'visible') {
        refreshTournamentDetailsBackground();
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityChange);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', refreshTournamentDetailsBackground);
    }

    return () => {
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', refreshTournamentDetailsBackground);
      }
    };
  }, [refreshTournamentDetailsBackground]);

  const tournament = currentTournament?.tournament ?? null;
  const participants = currentTournament?.participants ?? EMPTY_PARTICIPANTS;
  const matches = currentTournament?.matches ?? EMPTY_MATCHES;
  const isRegistered = currentTournament?.isRegistered ?? false;
  const userMmr = user?.profile?.mmr || 1000;
  const reducedMotion = settings.reducedMotion;

  const userParticipant = participants.find((participant) => participant.userId === currentUserId) || null;
  const userEliminated = userParticipant
    ? ['eliminated', 'forfeited', 'disqualified'].includes(userParticipant.status)
    : false;
  const isTournamentCompleted = tournament?.status === 'completed';
  const championParticipant =
    participants.find((participant) => participant.status === 'winner' || participant.finalPlacement === 1) || null;
  const isCurrentUserChampion = Boolean(
    userParticipant && (userParticipant.status === 'winner' || userParticipant.finalPlacement === 1)
  );
  const championName =
    championParticipant?.displayName || t('tournaments.celebration.unknownChampion', 'Champion');
  const celebrationKey = tournament
    ? `${tournament.id}:${tournament.status}:${championParticipant?.id ?? 'none'}`
    : null;

  const participantStatusLabel = (status: string) =>
    t(`tournaments.participantStatus.${status}`, status.replace(/_/g, ' '));

  useEffect(() => {
    if (!celebrationKey || !isTournamentCompleted || reducedMotion) {
      setShowTournamentConfetti(false);
      return;
    }
    if (shownCelebrationKeysRef.current.has(celebrationKey)) {
      return;
    }

    shownCelebrationKeysRef.current.add(celebrationKey);
    setShowTournamentConfetti(true);

    const timer = setTimeout(() => setShowTournamentConfetti(false), 2200);
    return () => clearTimeout(timer);
  }, [celebrationKey, isTournamentCompleted, reducedMotion]);

  const userMatchContext = (() => {
    if (!currentUserId || !tournament) return null;

    const match = matches.find((item) => {
      const p1 = participants.find((participant) => participant.id === item.player1Id);
      const p2 = participants.find((participant) => participant.id === item.player2Id);
      const p1UserId = item.player1UserId || p1?.userId;
      const p2UserId = item.player2UserId || p2?.userId;
      const isUserMatch = p1UserId === currentUserId || p2UserId === currentUserId;
      const bothAssigned = Boolean(item.player1Id && item.player2Id);
      return isUserMatch && bothAssigned && (item.status === 'ready' || item.status === 'in_progress');
    });

    if (!match) return null;

    const p1 = participants.find((participant) => participant.id === match.player1Id);
    const p2 = participants.find((participant) => participant.id === match.player2Id);
    const p1UserId = match.player1UserId || p1?.userId;
    const isUserPlayer1 = p1UserId === currentUserId;
    const opponent = isUserPlayer1 ? p2 : p1;
    const hasBotOpponent = isUserPlayer1
      ? Boolean(match.player2IsBot || p2?.isBot)
      : Boolean(match.player1IsBot || p1?.isBot);
    const isLive = match.status === 'in_progress';
    const useReadyCheck = match.status === 'ready' && !hasBotOpponent;
    const bestOf = match.bestOf || 1;
    const seriesLabel =
      bestOf > 1
        ? t('tournaments.seriesLabel', {
            bestOf,
            wins1: match.seriesWinsPlayer1 || 0,
            wins2: match.seriesWinsPlayer2 || 0,
            defaultValue: 'Bo{{bestOf}} - {{wins1}}:{{wins2}}',
          })
        : null;

    return {
      match,
      opponentName: opponent?.displayName || t('tournaments.opponent', 'Opponent'),
      isLive,
      useReadyCheck,
      seriesLabel,
    };
  })();

  if (!tournament && isLoading) {
    return (
      <motion.div variants={screenVariants} initial="initial" animate="animate" className="min-h-viewport bg-gradient-main flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
          className="h-12 w-12 rounded-full border-2 border-accent-teal border-t-transparent"
        />
      </motion.div>
    );
  }

  if (!tournament) {
    return (
      <motion.div variants={screenVariants} initial="initial" animate="animate" className="min-h-viewport bg-gradient-main flex items-center justify-center p-6">
        <Card variant="glass" className="max-w-md border border-white/10 text-center">
          <p className="text-sm text-text-secondary">{t('tournaments.errors.notFound', 'Tournament not found or unavailable.')}</p>
          <Button variant="secondary" className="mt-4" onClick={onBack}>
            {t('common.back')}
          </Button>
        </Card>
      </motion.div>
    );
  }

  const detailTournament = { ...tournament, isRegistered };
  const canRegister = canRegisterForTournament(detailTournament, userMmr);
  const canWithdraw = canWithdrawFromTournament(detailTournament);
  const eligible = isTournamentEligibleForMmr(tournament, userMmr);
  const isInProgress = tournament.status === 'in_progress';
  const isPaused = tournament.status === 'paused';
  const isCancelled = tournament.status === 'cancelled';
  const formatKey = getTournamentFormatLabelKey(tournament.format);
  const formatLabel = formatKey
    ? t(formatKey, getTournamentFormatLabel(tournament.format))
    : getTournamentFormatLabel(tournament.format);

  const tabs = [
    { id: 'brackets' as const, label: t('tournaments.detail.tabs.brackets', 'Brackets') },
    { id: 'overview' as const, label: t('tournaments.detail.tabs.overview', 'Overview') },
    {
      id: 'participants' as const,
      label: t('tournaments.detail.tabs.participants', {
        count: participants.length,
        defaultValue: 'Participants ({{count}})',
      }),
    },
  ];

  const handleRegister = async () => {
    const success = await registerForTournament(tournamentId);
    if (success) {
      fetchTournamentDetails(tournamentId);
    }
  };

  const handleWithdrawConfirm = async () => {
    setShowWithdrawConfirm(false);
    const success = await withdrawFromTournament(tournamentId);
    if (success) {
      fetchTournamentDetails(tournamentId);
    }
  };

  const handlePlayMatch = async (matchId: string, opponentName: string, useReadyCheck: boolean) => {
    if (useReadyCheck) {
      initiateReadyCheck(tournamentId, matchId, opponentName);
      return;
    }

    try {
      setIsStartingMatch(true);
      setMatchError(null);
      const nakamaMatchId = await startTournamentMatch(tournamentId, matchId);
      if (!nakamaMatchId) {
        setMatchError(
          t(
            'tournaments.errors.matchUnavailable',
            'This match is not available yet. Refresh the tournament and try again.'
          )
        );
        return;
      }
      await joinDirectMatch(nakamaMatchId);
    } catch (playError) {
      console.error('Failed to join tournament match:', playError);
      setMatchError(getTournamentJoinErrorMessage(playError, t, 'play', {
        participantStatus: userParticipant?.status,
        finalPlacement: userParticipant?.finalPlacement,
        roundNumber: userMatchContext?.match.roundNumber,
        totalPlayers: tournament.bracketSize,
      }));
      fetchTournamentDetails(tournamentId, true);
    } finally {
      setIsStartingMatch(false);
    }
  };

  const handleWatchMatch = async (nakamaMatchId: string | null | undefined) => {
    if (!nakamaMatchId) return;
    try {
      await joinDirectMatch(nakamaMatchId, undefined, { spectator: true });
    } catch (watchError) {
      console.error('Failed to watch tournament match:', watchError);
      setMatchError(getTournamentJoinErrorMessage(watchError, t, 'watch'));
    }
  };

  return (
    <motion.div variants={screenVariants} initial="initial" animate="animate" exit="exit" className="content-scrollable bg-gradient-main relative">
      {isTournamentCompleted && (
        <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-amber-300/10 via-amber-200/5 to-transparent" />
      )}
      {isTournamentCompleted && !reducedMotion && (
        <Confetti
          active={showTournamentConfetti}
          duration={2200}
          particleCount={40}
          className="z-40"
        />
      )}

      <div className="sticky top-0 z-20 border-b border-white/10 bg-bg-primary/85 backdrop-blur-xl">
        <div className="mx-auto w-full max-w-[var(--app-content-max-width)] px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onBack}
              className="h-10 w-10 rounded-full border border-white/10 bg-white/10 text-white transition-colors hover:bg-white/15"
              aria-label={t('common.back')}
            >
              <svg className="mx-auto h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="min-w-0 text-center">
              <p className="text-xs uppercase tracking-[0.2em] text-amber-300/80">
                {t('tournaments.detail.roomLabel', 'Bracket Room')}
              </p>
              <h1 className="name-text truncate text-lg font-display font-bold text-white sm:text-xl">{tournament.name}</h1>
            </div>
            <TournamentStatusBadge status={tournament.status} />
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[var(--app-content-max-width)] px-4 py-5 sm:px-6 lg:px-8">
        {(error || actionError || isPaused || isCancelled || userEliminated) && (
          <div className="mb-4 space-y-3">
            {error && (
              <Card variant="glass" className="border-red-300/30 bg-red-500/10">
                <p className="text-sm text-red-300">{error}</p>
              </Card>
            )}
            {actionError && (
              <Card variant="glass" padding="sm" className="flex items-center justify-between gap-3 border-red-300/30 bg-red-500/10">
                <p className="text-sm text-red-300">{actionError}</p>
                <button
                  type="button"
                  onClick={clearActionError}
                  className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/70 hover:text-white"
                >
                  {t('tournaments.actions.dismiss', 'Dismiss')}
                </button>
              </Card>
            )}
            {isPaused && (
              <Card variant="glass" className="border-orange-300/30 bg-orange-500/10">
                <p className="text-sm text-orange-300">{t('tournaments.alerts.paused', 'Tournament is currently paused by admin.')}</p>
              </Card>
            )}
            {isCancelled && (
              <Card variant="glass" className="border-red-300/30 bg-red-500/10">
                <p className="text-sm text-red-300">{t('tournaments.alerts.cancelled', 'Tournament has been cancelled.')}</p>
              </Card>
            )}
            {userEliminated && isInProgress && (
              <Card variant="glass" className="border-purple-300/30 bg-purple-500/10">
                <p className="text-sm text-purple-200">
                  {t('tournaments.alerts.eliminated', 'You have been eliminated, but you can still watch remaining matches.')}
                </p>
              </Card>
            )}
          </div>
        )}

        {isTournamentCompleted && (
          <Card className="mb-4 relative overflow-hidden border-amber-300/40 bg-gradient-to-r from-[#2f2410]/75 via-[#2b1d12]/70 to-[#17223d]/80">
            {!reducedMotion && (
              <VictoryBurst
                active={showTournamentConfetti}
                className="opacity-55"
              />
            )}
            <div className="relative z-10 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-[0.2em] text-amber-200/90">
                  {championParticipant
                    ? t('tournaments.celebration.championTitle', 'Tournament Champion')
                    : t('tournaments.celebration.completedTitle', 'Tournament Completed')}
                </p>
                <h2 className="name-text mt-1 text-lg font-heading font-bold text-white sm:text-xl">
                  {championParticipant
                    ? championName
                    : t('tournaments.celebration.completedSubtitle', 'Final standings are available in participants.')}
                </h2>
                {championParticipant && (
                  <p className="text-sm text-amber-100/85">
                    {t('tournaments.celebration.championSubtitle', {
                      name: championName,
                      defaultValue: '{{name}} finished in 1st place.',
                    })}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge
                  variant="warning"
                  size="sm"
                  className="rounded-lg border-amber-200/50 bg-amber-400/25 text-amber-100"
                >
                  {t('tournaments.badges.winner', 'Winner')}
                </Badge>
                {championParticipant?.finalPlacement && (
                  <Badge
                    variant="warning"
                    size="sm"
                    className="rounded-lg border-amber-200/45 bg-amber-500/20 text-amber-100"
                  >
                    #{championParticipant.finalPlacement}
                  </Badge>
                )}
              </div>
            </div>
          </Card>
        )}

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
          <main>
            <div className="mb-4 overflow-x-auto scrollbar-hide">
              <div className="flex min-w-max gap-2 rounded-2xl border border-white/10 bg-white/5 p-1.5">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      'rounded-xl px-4 py-2 text-sm font-semibold transition-all',
                      activeTab === tab.id
                        ? 'bg-gradient-to-r from-accent-teal to-teal-400 text-bg-primary shadow-glow-teal'
                        : 'text-text-secondary hover:text-white'
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {activeTab === 'brackets' && (
              <div className="space-y-4">
                {userMatchContext && isInProgress && !userEliminated && (
                  <Card variant="glass" className="border-cyan-300/30 bg-gradient-to-r from-[#1d2a45]/85 to-[#28204b]/85">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="warning" size="sm" className="rounded-lg">
                          {userMatchContext.isLive
                            ? t('tournaments.actions.rejoin', 'Rejoin match')
                            : t('tournaments.detail.yourMatchReady', 'Your match is ready')}
                        </Badge>
                        {userMatchContext.seriesLabel && (
                          <Badge variant="secondary" size="sm" className="rounded-lg">
                            {userMatchContext.seriesLabel}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                        <span className="font-semibold text-white shrink-0">{t('overlay.you', 'You')}</span>
                        <span className="text-text-secondary">VS</span>
                        <span className="name-text ml-auto max-w-[60%] text-right font-semibold text-white">
                          {userMatchContext.opponentName}
                        </span>
                      </div>
                      <Button
                        variant="gaming"
                        fullWidth
                        loading={isStartingMatch}
                        onClick={() =>
                          handlePlayMatch(
                            userMatchContext.match.id,
                            userMatchContext.opponentName,
                            userMatchContext.useReadyCheck
                          )
                        }
                      >
                        {isStartingMatch
                          ? t('tournaments.actions.starting', 'Starting...')
                          : userMatchContext.isLive
                            ? t('tournaments.actions.rejoin', 'Rejoin match')
                            : userMatchContext.useReadyCheck
                              ? t('tournaments.actions.readyUp', 'Ready up')
                              : t('tournaments.actions.playMatch', 'Play match')}
                      </Button>
                      {matchError && <p className="text-xs text-red-300">{matchError}</p>}
                    </div>
                  </Card>
                )}

                {matches.length > 0 ? (
                  <Card variant="glass" padding="sm" className="border border-white/10 bg-[#10172f]/82">
                    <BracketView
                      matches={matches}
                      participants={participants}
                      format={tournament.format === 'double_elimination' ? 'double_elimination' : 'single_elimination'}
                      currentUserId={currentUserId}
                      isPaused={isPaused}
                      isCancelled={isCancelled}
                      allowSpectators={tournament.allowSpectators}
                      onPlayMatch={(matchId, opponentName, useReadyCheck) =>
                        handlePlayMatch(matchId, opponentName, useReadyCheck)
                      }
                      onWatchMatch={(nakamaMatchId) => handleWatchMatch(nakamaMatchId)}
                    />
                  </Card>
                ) : (
                  <Card variant="glass" className="border border-white/10 bg-[#10172f]/75 text-center">
                    <p className="text-sm text-text-secondary">
                      {isInProgress
                        ? t('tournaments.detail.loadingBracket', 'Loading bracket data...')
                        : t('tournaments.detail.bracketSoon', 'Bracket will appear when tournament starts.')}
                    </p>
                  </Card>
                )}
              </div>
            )}

            {activeTab === 'overview' && (
              <motion.div variants={containerVariants} initial="initial" animate="animate" className="space-y-4">
                <motion.div variants={itemVariants}>
                  <Card variant="glass" className="border border-white/10 bg-[#10172f]/82">
                    <div className="space-y-3">
                      <h2 className="text-lg font-heading font-bold text-white">{t('tournaments.detail.overviewTitle', 'Overview')}</h2>
                      <p className="text-sm text-text-secondary">
                        {tournament.description || t('tournaments.detail.overviewFallback', 'Compete in this bracket tournament and climb to the final podium.')}
                      </p>
                      <TournamentMetaGrid tournament={tournament} userMmr={userMmr} />
                    </div>
                  </Card>
                </motion.div>

                <motion.div variants={itemVariants}>
                  <Card variant="glass" className="border border-white/10 bg-[#10172f]/82">
                    <div className="space-y-2">
                      <h3 className="font-heading text-base font-bold text-white">{t('tournaments.detail.timeline', 'Timeline')}</h3>
                      <p className="text-sm text-text-secondary">
                        {t('tournaments.detail.registrationWindow', {
                          start: formatTournamentDateTime(tournament.registrationStart),
                          end: formatTournamentDateTime(tournament.registrationEnd),
                          defaultValue: 'Registration: {{start}} - {{end}}',
                        })}
                      </p>
                      <p className="text-sm text-white">
                        {t('tournaments.detail.startsOn', {
                          value: formatTournamentDateTime(tournament.tournamentStart),
                          defaultValue: 'Starts: {{value}}',
                        })}
                      </p>
                      <p className="text-xs text-amber-300">{formatTournamentRelativeTime(tournament.tournamentStart, t)}</p>
                    </div>
                  </Card>
                </motion.div>

                <motion.div variants={itemVariants}>
                  <Card variant="glass" className="border border-white/10 bg-[#10172f]/82">
                    <div className="space-y-2">
                      <h3 className="font-heading text-base font-bold text-white">{t('tournaments.detail.rules', 'Rules Snapshot')}</h3>
                      <ul className="space-y-1 text-sm text-text-secondary">
                        <li>{t('tournaments.detail.ruleFormat', { value: formatLabel, defaultValue: 'Format: {{value}}' })}</li>
                        <li>
                          {t('tournaments.detail.ruleBracketSize', {
                            size: tournament.bracketSize,
                            defaultValue: 'Bracket size: {{size}} players',
                          })}
                        </li>
                        <li>
                          {t('tournaments.detail.ruleMmr', {
                            min: tournament.minMmr,
                            max: tournament.maxMmr,
                            defaultValue: 'MMR range: {{min}} - {{max}}',
                          })}
                        </li>
                        <li>
                          {t('tournaments.detail.ruleSpectators', {
                            value: tournament.allowSpectators
                              ? t('tournaments.detail.allowed', 'Allowed')
                              : t('tournaments.detail.notAllowed', 'Not allowed'),
                            defaultValue: 'Spectators: {{value}}',
                          })}
                        </li>
                      </ul>
                    </div>
                  </Card>
                </motion.div>
              </motion.div>
            )}

            {activeTab === 'participants' && (
              <Card variant="glass" className="overflow-hidden border border-white/10 bg-[#10172f]/82" padding="none">
                {participants.length === 0 ? (
                  <div className="p-5 text-center text-sm text-text-secondary">{t('tournaments.detail.noParticipants', 'No participants yet.')}</div>
                ) : (
                  <motion.div variants={containerVariants} initial="initial" animate="animate" className="divide-y divide-white/10">
                    {participants.map((participant, index) => (
                      <motion.div
                        key={participant.id}
                        variants={itemVariants}
                        className={cn(
                          'flex items-center gap-3 px-4 py-3',
                          participant.userId === currentUserId && 'bg-accent-teal/10'
                        )}
                      >
                        <span className="w-7 text-center text-xs text-text-secondary">
                          {participant.seedNumber || index + 1}
                        </span>
                        <Avatar name={participant.displayName} size="sm" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="name-text truncate text-sm font-semibold text-white">{participant.displayName}</p>
                            {participant.isBot && (
                              <Badge variant="secondary" size="sm" className="rounded-lg text-[10px]">
                                {t('tournaments.participantStatus.bot', 'BOT')}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-text-secondary">{participant.mmrAtRegistration} MMR</p>
                        </div>
                        <span
                          className={cn(
                            'rounded-lg border px-2 py-1 text-[11px] capitalize',
                            participantStatusStyles[participant.status] || 'border-white/15 bg-white/10 text-text-secondary'
                          )}
                        >
                          {participantStatusLabel(participant.status)}
                        </span>
                        {participant.finalPlacement !== null && participant.finalPlacement !== undefined && (
                          <Badge variant="warning" size="sm" className="rounded-lg">
                            #{participant.finalPlacement}
                          </Badge>
                        )}
                      </motion.div>
                    ))}
                  </motion.div>
                )}
              </Card>
            )}
          </main>

          <aside className="space-y-4 xl:sticky xl:top-28">
            <TournamentSummaryPanel
              tournament={detailTournament}
              userMmr={userMmr}
              isRegistered={isRegistered}
              actionLoading={isActionLoading}
              onRegister={handleRegister}
              onWithdraw={() => setShowWithdrawConfirm(true)}
            />

            <Card
              variant="glass"
              className={cn(
                'border bg-[#10172f]/82',
                isCurrentUserChampion
                  ? 'border-amber-300/45 bg-gradient-to-r from-[#2f2410]/65 via-[#2b1f0f]/60 to-[#17223d]/80 shadow-[0_0_26px_rgba(245,158,11,0.16)]'
                  : 'border-white/10'
              )}
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-base font-heading font-bold text-white">{t('tournaments.detail.yourStanding', 'Your standing')}</h3>
                  {isCurrentUserChampion && (
                    <Badge
                      variant="warning"
                      size="sm"
                      className="rounded-lg border-amber-200/50 bg-amber-400/25 text-amber-100"
                    >
                      {t('tournaments.badges.champion', 'Champion')}
                    </Badge>
                  )}
                </div>
                {userParticipant ? (
                  <>
                    <p className="text-sm text-text-secondary">
                      {t('tournaments.detail.statusLabel', 'Status')}: {' '}
                      <span
                        className={cn(
                          'font-semibold',
                          isCurrentUserChampion
                            ? 'text-amber-200'
                            : eligible
                              ? 'text-emerald-300'
                              : 'text-red-300'
                        )}
                      >
                        {participantStatusLabel(userParticipant.status)}
                      </span>
                    </p>
                    <p className="text-sm text-text-secondary">
                      {t('tournaments.detail.placementLabel', 'Placement')}: {' '}
                      <span className="font-semibold text-amber-200">
                        {userParticipant.finalPlacement
                          ? `#${userParticipant.finalPlacement}`
                          : t('tournaments.detail.inProgress', 'In progress')}
                      </span>
                    </p>
                    {isCurrentUserChampion && (
                      <p className="text-xs text-amber-100/90">
                        {t('tournaments.celebration.yourVictory', 'You won this tournament. Excellent run.')}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-text-secondary">
                    {canRegister
                      ? t('tournaments.detail.eligibleToJoin', 'You are eligible to join this tournament.')
                      : t('tournaments.detail.notRegistered', 'Not currently registered.')}
                  </p>
                )}
                {canWithdraw && (
                  <Button variant="danger" fullWidth onClick={() => setShowWithdrawConfirm(true)}>
                    {t('tournaments.actions.withdraw', 'Withdraw')}
                  </Button>
                )}
              </div>
            </Card>
          </aside>
        </div>
      </div>

      <AnimatePresence>
        {showWithdrawConfirm && (
          <ConfirmDialog
            isOpen={showWithdrawConfirm}
            title={t('tournaments.withdrawConfirm.title', 'Withdraw from tournament?')}
            message={t('tournaments.withdrawConfirm.message', {
              name: tournament.name,
              defaultValue: 'You are about to withdraw from "{{name}}".',
            })}
            confirmText={t('tournaments.withdrawConfirm.confirm', 'Yes, withdraw')}
            cancelText={t('common.cancel', 'Cancel')}
            onConfirm={handleWithdrawConfirm}
            onCancel={() => setShowWithdrawConfirm(false)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default TournamentDetailScreen;
