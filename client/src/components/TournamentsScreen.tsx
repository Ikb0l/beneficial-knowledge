import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useTournamentStore, type CurrentTournamentAction, type Tournament } from '../stores/tournamentStore';
import { useAuthStore } from '../stores/authStore';
import { useGameStore } from '../stores/gameStore';
import { cn } from '../lib/utils/cn';
import { Button, Card, Badge } from './ui';
import { containerVariants, itemVariants, screenVariants } from '../lib/animations/variants';
import { useDialog } from '../hooks/useDialog';
import {
  TournamentActionRow,
  TournamentCapacityMeter,
  TournamentLivePanel,
  TournamentMetaGrid,
  TournamentStatusBadge,
  formatTournamentDateTime,
  formatTournamentRelativeTime,
} from './tournament';
import { getTournamentJoinErrorMessage } from './tournament/joinErrors';
import {
  getTournamentCurrentActionButtonLabel,
  getTournamentCurrentActionDescription,
  getTournamentCurrentActionLabel,
} from './tournament/currentActionCopy';

interface TournamentsScreenProps {
  onBack: () => void;
  onViewTournament?: (tournamentId: string) => void;
}

type TournamentFilterId = '' | 'registration' | 'upcoming' | 'in_progress' | 'paused' | 'completed' | 'cancelled';
type TournamentViewMode = 'now' | 'browse' | 'results';
const TOURNAMENT_REFRESH_INTERVAL_MS = 12000;

const ACTIVE_PARTICIPANT_STATUSES = new Set(['registered', 'checked_in', 'active']);
const RESULT_PARTICIPANT_STATUSES = new Set(['eliminated', 'winner', 'forfeited', 'disqualified']);

const isTournamentHistory = (tournament: Tournament): boolean => {
  return (
    tournament.status === 'completed' ||
    tournament.status === 'cancelled' ||
    (tournament.finalPlacement !== null && tournament.finalPlacement !== undefined) ||
    RESULT_PARTICIPANT_STATUSES.has(String(tournament.participantStatus || ''))
  );
};

const isCurrentUserTournament = (tournament: Tournament): boolean => {
  if (!tournament.isRegistered) return false;
  if (tournament.status === 'completed' || tournament.status === 'cancelled') return false;
  if (!tournament.participantStatus) return true;
  return ACTIVE_PARTICIPANT_STATUSES.has(String(tournament.participantStatus));
};

const isPrimaryTournamentAction = (action?: CurrentTournamentAction | null): action is CurrentTournamentAction => {
  return Boolean(action && action.kind !== 'none' && action.kind !== 'view_results');
};

const uniqueTournamentsById = (items: Tournament[]): Tournament[] => {
  const seen = new Set<string>();
  const out: Tournament[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
};

interface TournamentListCardProps {
  tournament: Tournament;
  userMmr: number;
  isRegistering: boolean;
  isWithdrawing: boolean;
  onRegister: () => void;
  onWithdraw: () => void;
  onView: () => void;
  currentAction?: CurrentTournamentAction | null;
  currentActionLabel?: string | null;
}

function TournamentListCard({
  tournament,
  userMmr,
  isRegistering,
  isWithdrawing,
  onRegister,
  onWithdraw,
  onView,
  currentAction,
  currentActionLabel,
}: TournamentListCardProps) {
  const { t } = useTranslation();
  const hasParticipantStatus = Boolean(tournament.participantStatus);
  const hasPlacement = tournament.finalPlacement !== null && tournament.finalPlacement !== undefined;
  const isChampion = tournament.participantStatus === 'winner' || tournament.finalPlacement === 1;
  const relativeStart = formatTournamentRelativeTime(tournament.tournamentStart, t);
  const actionLabelOverride =
    currentAction?.tournamentId === tournament.id && currentAction.kind !== 'none'
      ? currentActionLabel || currentAction.label
      : null;

  const participantStatusLabel = hasParticipantStatus
    ? t(
        `tournaments.participantStatus.${tournament.participantStatus}`,
        tournament.participantStatus?.replace(/_/g, ' ') || ''
      )
    : null;

  return (
    <motion.article variants={itemVariants}>
      <Card
        variant="glass"
        className={cn(
          'group relative overflow-hidden border bg-[#10172f]/84 shadow-[0_18px_36px_rgba(0,0,0,0.38)]',
          isChampion
            ? 'border-amber-300/40 shadow-[0_18px_36px_rgba(0,0,0,0.38),0_0_26px_rgba(245,158,11,0.18)]'
            : 'border-white/10'
        )}
      >
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-20 -left-10 h-32 w-32 rounded-full bg-[#20c5ff]/10 blur-2xl" />
          <div className="absolute top-8 -right-10 h-28 w-28 rounded-full bg-[#7c78ff]/10 blur-2xl" />
          {isChampion && <div className="absolute -top-10 right-8 h-28 w-28 rounded-full bg-amber-300/15 blur-2xl" />}
        </div>

        <div className="relative space-y-4 p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.22em] text-emerald-300/75">
                {t('tournaments.sectionLabel', 'Tournament')}
              </p>
              <h3 className="name-text truncate text-lg font-heading font-bold text-white sm:text-xl">
                {tournament.name}
              </h3>
              {tournament.description && (
                <p className="mt-1 line-clamp-2 text-sm text-text-secondary">{tournament.description}</p>
              )}
            </div>
            <TournamentStatusBadge status={tournament.status} className="shrink-0" />
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-text-secondary">
              {t('tournaments.meta.starts', 'Starts')}: {formatTournamentDateTime(tournament.tournamentStart)}
            </span>
            <span className="rounded-lg border border-cyan-300/30 bg-cyan-400/10 px-2 py-1 text-cyan-200">
              {relativeStart}
            </span>
          </div>

          <TournamentCapacityMeter
            participantCount={tournament.registeredCount ?? tournament.participantCount}
            bracketSize={tournament.bracketSize}
          />

          <TournamentMetaGrid tournament={tournament} userMmr={userMmr} />

          {(hasParticipantStatus || hasPlacement) && (
            <div className="flex flex-wrap gap-2">
              {isChampion && (
                <Badge
                  variant="warning"
                  size="sm"
                  className="rounded-lg border-amber-200/50 bg-amber-400/25 text-amber-100"
                >
                  {t('tournaments.badges.champion', 'Champion')}
                </Badge>
              )}
              {hasParticipantStatus && participantStatusLabel && !isChampion && (
                <Badge variant="primary" size="sm" className="rounded-lg capitalize">
                  {participantStatusLabel}
                </Badge>
              )}
              {hasPlacement && (
                <Badge variant="warning" size="sm" className="rounded-lg">
                  {t('tournaments.finalPlacement', {
                    placement: tournament.finalPlacement,
                    defaultValue: 'Final placement #{{placement}}',
                  })}
                </Badge>
              )}
            </div>
          )}

          <TournamentActionRow
            tournament={tournament}
            userMmr={userMmr}
            primaryLabelOverride={actionLabelOverride}
            isRegistering={isRegistering}
            isWithdrawing={isWithdrawing}
            onRegister={onRegister}
            onWithdraw={onWithdraw}
            onView={onView}
          />
        </div>
      </Card>
    </motion.article>
  );
}

interface CurrentTournamentActionCardProps {
  action: CurrentTournamentAction;
  label: string;
  description: string;
  buttonLabel: string;
  busy: boolean;
  onPrimaryAction: () => void;
}

function CurrentTournamentActionCard({
  action,
  label,
  description,
  buttonLabel,
  busy,
  onPrimaryAction,
}: CurrentTournamentActionCardProps) {
  const { t } = useTranslation();
  const isUrgent = action.kind === 'ready_up' || action.kind === 'play_match' || action.kind === 'rejoin_match';

  return (
    <Card
      variant="glass"
      className={cn(
        'mb-4 overflow-hidden border bg-[#10172f]/86',
        isUrgent ? 'border-emerald-300/35 shadow-[0_0_30px_rgba(16,185,129,0.14)]' : 'border-white/10'
      )}
    >
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.22em] text-emerald-300/75">
            {t('tournaments.now.currentStep', 'Current step')}
          </p>
          <h2 className="mt-1 text-lg font-heading font-bold text-white">{label}</h2>
          <p className="mt-1 text-sm text-text-secondary">{description}</p>
          {action.tournamentName && (
            <p className="mt-2 truncate text-xs font-semibold text-cyan-200">{action.tournamentName}</p>
          )}
        </div>
        <Button
          variant={isUrgent ? 'gaming' : 'secondary'}
          size="md"
          className="shrink-0 sm:min-w-[160px]"
          loading={busy}
          disabled={busy}
          onClick={onPrimaryAction}
        >
          {buttonLabel}
        </Button>
      </div>
    </Card>
  );
}

function TournamentFlowStrip() {
  const { t } = useTranslation();
  const steps = [
    t('tournaments.flow.register', 'Register'),
    t('tournaments.flow.wait', 'Wait bracket'),
    t('tournaments.flow.ready', 'Ready up'),
    t('tournaments.flow.play', 'Play BO3'),
    t('tournaments.flow.advance', 'Advance or results'),
  ];

  return (
    <div className="mb-4 rounded-lg border border-white/10 bg-white/[0.04] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-text-secondary">
          {t('tournaments.flow.title', 'Tournament flow')}
        </span>
        {steps.map((step, index) => (
          <span
            key={step}
            className="rounded-md border border-white/10 bg-[#111d3b] px-2.5 py-1 text-xs font-semibold text-white/85"
          >
            {index + 1}. {step}
          </span>
        ))}
      </div>
    </div>
  );
}

export function TournamentsScreen({ onBack, onViewTournament }: TournamentsScreenProps) {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const {
    tournaments,
    myTournaments,
    spectatorMatches,
    isLoading,
    isSpectatorLoading,
    error,
    spectatorError,
    actionError: storeActionError,
    clearActionError,
    myTournamentsError,
    currentTournamentAction,
    fetchTournaments,
    fetchMyTournaments,
    fetchCurrentTournamentAction,
    fetchSpectatorMatches,
    registerForTournament,
    withdrawFromTournament,
    initiateReadyCheck,
    startTournamentMatch,
  } = useTournamentStore();
  const { joinDirectMatch } = useGameStore();

  const [statusFilter, setStatusFilter] = useState<TournamentFilterId>('');
  const [viewMode, setViewMode] = useState<TournamentViewMode>('now');
  const [registeringId, setRegisteringId] = useState<string | null>(null);
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);
  const [watchError, setWatchError] = useState<string | null>(null);
  const [currentActionError, setCurrentActionError] = useState<string | null>(null);
  const [currentActionBusy, setCurrentActionBusy] = useState(false);
  const [withdrawConfirm, setWithdrawConfirm] = useState<{ id: string; name: string } | null>(null);
  const [showAllFilters, setShowAllFilters] = useState(false);

  const withdrawConfirmTitleId = useId();
  const withdrawDialogRef = useRef<HTMLDivElement>(null);
  const withdrawCancelRef = useRef<HTMLButtonElement>(null);

  useDialog({
    open: Boolean(withdrawConfirm),
    onClose: () => setWithdrawConfirm(null),
    dialogRef: withdrawDialogRef,
    initialFocusRef: withdrawCancelRef,
  });

  const statusFilters = useMemo(
    () => [
      { id: '' as const, label: t('tournaments.filters.all', 'All') },
      { id: 'registration' as const, label: t('tournaments.filters.registration', 'Open') },
      { id: 'upcoming' as const, label: t('tournaments.filters.upcoming', 'Upcoming') },
      { id: 'in_progress' as const, label: t('tournaments.filters.in_progress', 'Live') },
      { id: 'paused' as const, label: t('tournaments.filters.paused', 'Paused') },
      { id: 'completed' as const, label: t('tournaments.filters.completed', 'Finished') },
      { id: 'cancelled' as const, label: t('tournaments.filters.cancelled', 'Cancelled') },
    ],
    [t]
  );

  const refreshTournamentData = useCallback((background = false) => {
    const publicStatus = viewMode === 'browse' ? statusFilter || undefined : undefined;
    void fetchTournaments(publicStatus, { background });
    void fetchMyTournaments({ background });
    void fetchCurrentTournamentAction({ background });
    void fetchSpectatorMatches({ background });
  }, [fetchTournaments, fetchMyTournaments, fetchCurrentTournamentAction, fetchSpectatorMatches, statusFilter, viewMode]);

  useEffect(() => {
    refreshTournamentData(false);
  }, [refreshTournamentData]);

  useEffect(() => {
    const runBackgroundRefresh = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return;
      }
      refreshTournamentData(true);
    };

    const onVisibilityChange = () => {
      if (typeof document === 'undefined') return;
      if (document.visibilityState === 'visible') {
        runBackgroundRefresh();
      }
    };

    const interval = setInterval(runBackgroundRefresh, TOURNAMENT_REFRESH_INTERVAL_MS);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityChange);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', runBackgroundRefresh);
    }

    return () => {
      clearInterval(interval);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', runBackgroundRefresh);
      }
    };
  }, [refreshTournamentData]);

  const handleRegister = async (tournamentId: string) => {
    setRegisteringId(tournamentId);
    try {
      await registerForTournament(tournamentId);
    } finally {
      setRegisteringId(null);
    }
  };

  const handleWithdraw = (tournamentId: string, tournamentName: string) => {
    setWithdrawConfirm({ id: tournamentId, name: tournamentName });
  };

  const confirmWithdraw = async () => {
    if (!withdrawConfirm) return;
    const { id } = withdrawConfirm;
    setWithdrawConfirm(null);
    setWithdrawingId(id);
    try {
      await withdrawFromTournament(id);
    } finally {
      setWithdrawingId((current) => (current === id ? null : current));
    }
  };

  const userMmr = user?.profile?.mmr || 1000;

  const liveCount = tournaments.filter((item) => item.status === 'in_progress').length;
  const openCount = tournaments.filter((item) => item.status === 'registration').length;
  const currentActionTournament = useMemo(() => {
    if (!currentTournamentAction?.tournamentId) return null;
    return (
      myTournaments.find((item) => item.id === currentTournamentAction.tournamentId) ||
      tournaments.find((item) => item.id === currentTournamentAction.tournamentId) ||
      null
    );
  }, [currentTournamentAction?.tournamentId, myTournaments, tournaments]);

  const nowTournaments = useMemo(() => {
    const activeMine = myTournaments.filter(isCurrentUserTournament);
    return uniqueTournamentsById(
      isPrimaryTournamentAction(currentTournamentAction) && currentActionTournament
        ? [currentActionTournament, ...activeMine]
        : activeMine
    );
  }, [currentActionTournament, currentTournamentAction, myTournaments]);

  const browseTournaments = useMemo(() => {
    if (statusFilter) return tournaments;
    return tournaments.filter((item) => item.status !== 'completed' && item.status !== 'cancelled');
  }, [statusFilter, tournaments]);

  const resultTournaments = useMemo(() => myTournaments.filter(isTournamentHistory), [myTournaments]);

  const displayTournaments =
    viewMode === 'now'
      ? nowTournaments
      : viewMode === 'results'
        ? resultTournaments
        : browseTournaments;

  const viewModes = useMemo(
    () => [
      { id: 'now' as const, label: t('tournaments.views.now', 'Now'), count: nowTournaments.length },
      { id: 'browse' as const, label: t('tournaments.views.browse', 'Find'), count: browseTournaments.length },
      { id: 'results' as const, label: t('tournaments.views.results', 'Results'), count: resultTournaments.length },
    ],
    [browseTournaments.length, nowTournaments.length, resultTournaments.length, t]
  );

  const listedCountText = t('tournaments.listedCount', {
    count: displayTournaments.length,
    defaultValue: '{{count}} listed',
  });

  const getCurrentActionLabel = useCallback((action: CurrentTournamentAction) => {
    return getTournamentCurrentActionLabel(action, t);
  }, [t]);

  const getCurrentActionDescription = useCallback((action: CurrentTournamentAction) => {
    return getTournamentCurrentActionDescription(action, t);
  }, [t]);

  const getCurrentActionButtonLabel = useCallback((action: CurrentTournamentAction) => {
    return getTournamentCurrentActionButtonLabel(action, t);
  }, [t]);

  const actionableCurrentAction =
    isPrimaryTournamentAction(currentTournamentAction) ? currentTournamentAction : null;

  const handleWatchMatch = async (nakamaMatchId: string) => {
    setWatchError(null);
    try {
      await joinDirectMatch(nakamaMatchId, undefined, { spectator: true });
    } catch (watchError) {
      console.error('Failed to watch match:', watchError);
      setWatchError(getTournamentJoinErrorMessage(watchError, t, 'watch'));
    }
  };

  const handleCurrentAction = async () => {
    if (!actionableCurrentAction) return;
    setCurrentActionError(null);

    if (
      (actionableCurrentAction.kind === 'ready_up' ||
        actionableCurrentAction.kind === 'play_match' ||
        actionableCurrentAction.kind === 'rejoin_match') &&
      actionableCurrentAction.nakamaMatchId
    ) {
      setCurrentActionBusy(true);
      try {
        await joinDirectMatch(actionableCurrentAction.nakamaMatchId);
      } catch (joinError) {
        console.error('Failed to join tournament match:', joinError);
        setCurrentActionError(getTournamentJoinErrorMessage(joinError, t, 'play', {
          participantStatus: actionableCurrentAction.participantStatus,
          finalPlacement: actionableCurrentAction.finalPlacement,
          roundNumber: actionableCurrentAction.roundNumber,
          totalPlayers: currentActionTournament?.bracketSize || null,
        }));
        void fetchCurrentTournamentAction({ background: true });
      } finally {
        setCurrentActionBusy(false);
      }
      return;
    }

    if (
      actionableCurrentAction.kind === 'play_match' &&
      actionableCurrentAction.tournamentId &&
      actionableCurrentAction.matchId
    ) {
      setCurrentActionError(null);
      setCurrentActionBusy(true);
      try {
        const nakamaMatchId = await startTournamentMatch(
          actionableCurrentAction.tournamentId,
          actionableCurrentAction.matchId
        );
        if (nakamaMatchId) {
          await joinDirectMatch(nakamaMatchId);
        }
      } catch (startError) {
        console.error('Failed to start tournament match:', startError);
        setCurrentActionError(
          startError instanceof Error
            ? startError.message
            : t('tournaments.errors.startFailed', 'Failed to start match')
        );
        void fetchCurrentTournamentAction({ background: true });
      } finally {
        setCurrentActionBusy(false);
      }
      return;
    }

    if (
      actionableCurrentAction.kind === 'ready_up' &&
      actionableCurrentAction.tournamentId &&
      actionableCurrentAction.matchId
    ) {
      initiateReadyCheck(
        actionableCurrentAction.tournamentId,
        actionableCurrentAction.matchId,
        actionableCurrentAction.opponentName || t('tournaments.opponent', 'Opponent')
      );
      return;
    }

    if (actionableCurrentAction.tournamentId) {
      onViewTournament?.(actionableCurrentAction.tournamentId);
    }
  };

  const primaryFilters = statusFilters.slice(0, 4);
  const secondaryFilters = statusFilters.slice(4);
  const emptyTitle =
    viewMode === 'now'
      ? t('tournaments.empty.nowTitle', 'No tournament action right now')
      : viewMode === 'results'
        ? t('tournaments.empty.resultsTitle', 'No results yet')
        : statusFilter
          ? t('tournaments.empty.filteredTitle', 'No tournaments in this filter')
          : t('tournaments.empty.browseTitle', 'No active tournaments found');
  const emptySubtitle =
    viewMode === 'now'
      ? t('tournaments.empty.nowSubtitle', 'When you register, ready up, or need to rejoin, the next step appears here.')
      : viewMode === 'results'
        ? t('tournaments.empty.resultsSubtitle', 'Completed tournaments and final placements will appear here.')
        : statusFilter
          ? t('tournaments.empty.filteredSubtitle', 'Try another filter or show all active tournaments.')
          : t('tournaments.empty.browseSubtitle', 'Open, upcoming, and live tournaments will appear here.');

  return (
    <motion.div variants={screenVariants} initial="initial" animate="animate" exit="exit" className="content-scrollable bg-gradient-main">
      <div className="sticky top-0 z-20 border-b border-white/10 bg-bg-primary/85 backdrop-blur-xl">
        <div className="mx-auto w-full max-w-[var(--app-content-max-width)] px-4 pb-3 pt-4 sm:px-6 lg:px-8">
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
              <h1 className="truncate font-display text-xl font-bold text-white sm:text-2xl">{t('tournaments.title', 'Tournaments')}</h1>
              <p className="text-xs text-text-secondary">{t('tournaments.subtitle', 'Compete live, climb faster, stay informed')}</p>
            </div>
            <span className="rounded-lg border border-cyan-300/30 bg-cyan-400/10 px-2 py-1 text-[11px] font-semibold text-cyan-200">
              {listedCountText}
            </span>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-white/10 bg-white/5 px-2 py-2 text-center">
              <p className="text-[10px] uppercase tracking-wide text-text-secondary">{t('tournaments.filters.registration', 'Open')}</p>
              <p className="text-sm font-bold text-emerald-300">{openCount}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 px-2 py-2 text-center">
              <p className="text-[10px] uppercase tracking-wide text-text-secondary">{t('tournaments.filters.in_progress', 'Live')}</p>
              <p className="text-sm font-bold text-amber-300">{liveCount}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 px-2 py-2 text-center">
              <p className="text-[10px] uppercase tracking-wide text-text-secondary">{t('tournaments.myTournaments', 'My Tournaments')}</p>
              <p className="text-sm font-bold text-cyan-200">{myTournaments.length}</p>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            {viewModes.map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => {
                  setViewMode(mode.id);
                  if (mode.id !== 'browse') {
                    setStatusFilter('');
                  }
                }}
                className={cn(
                  'rounded-xl px-2 py-2.5 text-sm font-semibold transition-all',
                  viewMode === mode.id
                    ? 'bg-gradient-to-r from-accent-teal to-teal-400 text-bg-primary shadow-glow-teal'
                    : 'border border-white/10 bg-white/5 text-text-secondary hover:text-white'
                )}
              >
                <span className="block truncate">{mode.label}</span>
                <span className="mt-0.5 block text-[11px] opacity-75">{mode.count}</span>
              </button>
            ))}
          </div>

          {viewMode === 'browse' && (
            <div className="mt-3 overflow-x-auto scrollbar-hide">
              <div className="flex min-w-max items-center gap-2 pb-1">
                {primaryFilters.map((filter) => (
                  <button
                    key={filter.id}
                    type="button"
                    onClick={() => setStatusFilter(filter.id)}
                    className={cn(
                      'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-all',
                      statusFilter === filter.id
                        ? 'border-cyan-300/50 bg-cyan-400/20 text-cyan-100'
                        : 'border-white/10 bg-white/5 text-text-secondary hover:text-white'
                    )}
                  >
                    <span>{filter.label}</span>
                  </button>
                ))}

                <button
                  type="button"
                  onClick={() => setShowAllFilters((prev) => !prev)}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-all',
                    showAllFilters ? 'border-white/20 bg-white/10 text-white' : 'border-white/10 bg-white/5 text-text-secondary hover:text-white'
                  )}
                >
                  {showAllFilters ? t('tournaments.filters.less', 'Less') : t('tournaments.filters.more', 'More')}
                </button>
              </div>

              {showAllFilters && (
                <div className="mt-2 flex min-w-max items-center gap-2 pb-1">
                  {secondaryFilters.map((filter) => (
                    <button
                      key={filter.id}
                      type="button"
                      onClick={() => setStatusFilter(filter.id)}
                      className={cn(
                        'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-all',
                        statusFilter === filter.id
                          ? 'border-cyan-300/50 bg-cyan-400/20 text-cyan-100'
                          : 'border-white/10 bg-white/5 text-text-secondary hover:text-white'
                      )}
                    >
                      <span>{filter.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto w-full max-w-[var(--app-content-max-width)] px-4 py-5 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,360px)_minmax(0,1fr)] xl:items-start xl:gap-8">
          <aside className="xl:sticky xl:top-28">
            <TournamentLivePanel
              matches={spectatorMatches}
              isLoading={isSpectatorLoading}
              error={spectatorError}
              onRefresh={() => refreshTournamentData(false)}
              onViewTournament={onViewTournament}
              onWatchMatch={handleWatchMatch}
            />
          </aside>

          <section>
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="mb-4"
                >
                  <Card variant="glass" className="border-red-300/30 bg-red-500/10">
                    <p className="text-sm text-red-300">{error}</p>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {myTournamentsError && viewMode !== 'browse' && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="mb-4"
                >
                  <Card variant="glass" className="border-red-300/30 bg-red-500/10">
                    <p className="text-sm text-red-300">{myTournamentsError}</p>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {storeActionError && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="mb-4"
                >
                  <Card
                    variant="glass"
                    padding="sm"
                    className="flex items-center justify-between gap-3 border-red-300/30 bg-red-500/10"
                  >
                    <p className="text-sm text-red-300">{storeActionError}</p>
                    <button
                      type="button"
                      onClick={clearActionError}
                      className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/70 hover:text-white"
                    >
                      {t('tournaments.actions.dismiss', 'Dismiss')}
                    </button>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {watchError && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="mb-4"
                >
                  <Card
                    variant="glass"
                    padding="sm"
                    className="flex items-center justify-between gap-3 border-red-300/30 bg-red-500/10"
                  >
                    <p className="text-sm text-red-300">{watchError}</p>
                    <button
                      type="button"
                      onClick={() => setWatchError(null)}
                      className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/70 hover:text-white"
                    >
                      {t('tournaments.actions.dismiss', 'Dismiss')}
                    </button>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {currentActionError && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="mb-4"
                >
                  <Card
                    variant="glass"
                    padding="sm"
                    className="flex items-center justify-between gap-3 border-red-300/30 bg-red-500/10"
                  >
                    <p className="text-sm text-red-300">{currentActionError}</p>
                    <button
                      type="button"
                      onClick={() => setCurrentActionError(null)}
                      className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/70 hover:text-white"
                    >
                      {t('tournaments.actions.dismiss', 'Dismiss')}
                    </button>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>

            {viewMode === 'now' && (
              <>
                <TournamentFlowStrip />
                {actionableCurrentAction && (
                  <CurrentTournamentActionCard
                    action={actionableCurrentAction}
                    label={getCurrentActionLabel(actionableCurrentAction)}
                    description={getCurrentActionDescription(actionableCurrentAction)}
                    buttonLabel={getCurrentActionButtonLabel(actionableCurrentAction)}
                    busy={currentActionBusy}
                    onPrimaryAction={handleCurrentAction}
                  />
                )}
              </>
            )}

            {isLoading && (
              <div className="flex flex-col items-center justify-center py-14">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                  className="h-11 w-11 rounded-full border-2 border-accent-teal border-t-transparent"
                />
                <p className="mt-3 text-sm text-text-secondary">{t('loading.tournaments', 'Loading tournaments...')}</p>
              </div>
            )}

            {!isLoading && displayTournaments.length > 0 && (
              <motion.div variants={containerVariants} initial="initial" animate="animate" className="space-y-4">
                {displayTournaments.map((tournament) => (
                  <TournamentListCard
                    key={tournament.id}
                    tournament={tournament}
                    userMmr={userMmr}
                    onRegister={() => handleRegister(tournament.id)}
                    onWithdraw={() => handleWithdraw(tournament.id, tournament.name)}
                    onView={() => onViewTournament?.(tournament.id)}
                    currentAction={currentTournamentAction}
                    currentActionLabel={
                      currentTournamentAction?.tournamentId === tournament.id && currentTournamentAction.kind !== 'none'
                        ? getCurrentActionButtonLabel(currentTournamentAction)
                        : null
                    }
                    isRegistering={registeringId === tournament.id}
                    isWithdrawing={withdrawingId === tournament.id}
                  />
                ))}
              </motion.div>
            )}

            {!isLoading && displayTournaments.length === 0 && (
              <Card variant="glass" className="border-white/10 bg-[#10172f]/70 py-14 text-center">
                <span className="mb-4 block text-5xl">{String.fromCodePoint(0x1F3C6)}</span>
                <h3 className="mb-2 text-lg font-heading font-bold text-white">
                  {emptyTitle}
                </h3>
                <p className="text-sm text-text-secondary">
                  {emptySubtitle}
                </p>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  {viewMode === 'now' && (
                    <Button type="button" variant="secondary" size="sm" onClick={() => setViewMode('browse')}>
                      {t('tournaments.views.browse', 'Find')}
                    </Button>
                  )}
                  {viewMode === 'now' && resultTournaments.length > 0 && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setViewMode('results')}>
                      {t('tournaments.views.results', 'Results')}
                    </Button>
                  )}
                  {viewMode === 'browse' && statusFilter && (
                    <Button type="button" variant="secondary" size="sm" onClick={() => setStatusFilter('')}>
                      {t('tournaments.empty.showActive', 'Show active tournaments')}
                    </Button>
                  )}
                  {viewMode === 'results' && (
                    <Button type="button" variant="secondary" size="sm" onClick={() => setViewMode('now')}>
                      {t('tournaments.views.now', 'Now')}
                    </Button>
                  )}
                </div>
              </Card>
            )}
          </section>
        </div>
      </div>

      {withdrawConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4"
          onClick={() => setWithdrawConfirm(null)}
          role="presentation"
        >
          <motion.div
            ref={withdrawDialogRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby={withdrawConfirmTitleId}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-sm"
            onClick={(event) => event.stopPropagation()}
          >
            <Card variant="elevated" className="text-center">
              <span className="mb-3 block text-4xl">{String.fromCodePoint(0x26A0, 0xFE0F)}</span>
              <h3 id={withdrawConfirmTitleId} className="mb-2 text-xl font-display font-bold text-white">
                {t('tournaments.withdrawConfirm.title', 'Withdraw from tournament?')}
              </h3>
              <p className="mb-6 text-sm text-text-secondary">
                {t('tournaments.withdrawConfirm.message', {
                  name: withdrawConfirm.name,
                  defaultValue: 'You are about to withdraw from "{{name}}".',
                })}
              </p>
              <div className="flex gap-3">
                <Button
                  ref={withdrawCancelRef}
                  type="button"
                  variant="ghost"
                  fullWidth
                  onClick={() => setWithdrawConfirm(null)}
                >
                  {t('tournaments.withdrawConfirm.cancel', 'Keep registration')}
                </Button>
                <Button type="button" variant="danger" fullWidth onClick={confirmWithdraw}>
                  {t('tournaments.actions.withdraw', 'Withdraw')}
                </Button>
              </div>
            </Card>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}

export default TournamentsScreen;
