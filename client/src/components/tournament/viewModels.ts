import type { Tournament, TournamentStatus } from '../../stores/tournamentStore';

export type TournamentStatusTone =
  | 'live'
  | 'open'
  | 'upcoming'
  | 'paused'
  | 'completed'
  | 'cancelled';

type StatusPresentation = {
  labelKey: string;
  fallbackLabel: string;
  tone: TournamentStatusTone;
  className: string;
};

const STATUS_PRESENTATION: Record<TournamentStatus, StatusPresentation> = {
  registration: {
    labelKey: 'tournaments.status.registration',
    fallbackLabel: 'Open',
    tone: 'open',
    className: 'bg-emerald-500/15 text-emerald-300 border-emerald-300/35',
  },
  upcoming: {
    labelKey: 'tournaments.status.upcoming',
    fallbackLabel: 'Upcoming',
    tone: 'upcoming',
    className: 'bg-sky-500/15 text-sky-300 border-sky-300/35',
  },
  in_progress: {
    labelKey: 'tournaments.status.in_progress',
    fallbackLabel: 'Live',
    tone: 'live',
    className: 'bg-amber-500/20 text-amber-300 border-amber-300/45 shadow-[0_0_16px_rgba(245,158,11,0.25)]',
  },
  paused: {
    labelKey: 'tournaments.status.paused',
    fallbackLabel: 'Paused',
    tone: 'paused',
    className: 'bg-orange-500/20 text-orange-300 border-orange-300/45',
  },
  completed: {
    labelKey: 'tournaments.status.completed',
    fallbackLabel: 'Completed',
    tone: 'completed',
    className: 'bg-slate-500/20 text-slate-300 border-slate-300/30',
  },
  cancelled: {
    labelKey: 'tournaments.status.cancelled',
    fallbackLabel: 'Cancelled',
    tone: 'cancelled',
    className: 'bg-red-500/20 text-red-300 border-red-300/40',
  },
};

export type TournamentPrimaryActionKind = 'enter' | 'register' | 'view_live' | 'view';

export interface TournamentPrimaryAction {
  kind: TournamentPrimaryActionKind;
  labelKey: string;
  fallbackLabel: string;
  variant: 'gaming' | 'secondary';
}

export const getTournamentStatusPresentation = (status: TournamentStatus): StatusPresentation => {
  return STATUS_PRESENTATION[status];
};

export const getTournamentFormatLabel = (format: string): string => {
  if (format === 'single_elimination') return 'Single Elimination';
  if (format === 'double_elimination') return 'Double Elimination';
  return format.replace(/_/g, ' ');
};

export const getTournamentFormatLabelKey = (format: string): string | null => {
  if (format === 'single_elimination') return 'tournaments.formats.single_elimination';
  if (format === 'double_elimination') return 'tournaments.formats.double_elimination';
  return null;
};

export const isTournamentEligibleForMmr = (tournament: Tournament, userMmr: number): boolean => {
  if (typeof tournament.isEligible === 'boolean') return tournament.isEligible;
  return userMmr >= tournament.minMmr && userMmr <= tournament.maxMmr;
};

export const isTournamentFull = (tournament: Tournament): boolean => {
  const registeredCount =
    typeof tournament.registeredCount === 'number' && Number.isFinite(tournament.registeredCount)
      ? tournament.registeredCount
      : tournament.participantCount;
  return registeredCount >= tournament.bracketSize;
};

const isWithinRegistrationWindow = (tournament: Tournament, nowMs: number = Date.now()): boolean => {
  const startMs = new Date(tournament.registrationStart).getTime();
  const endMs = new Date(tournament.registrationEnd).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return false;
  return nowMs >= startMs && nowMs <= endMs;
};

export const canRegisterForTournament = (tournament: Tournament, userMmr: number): boolean => {
  const isRegistered = Boolean(tournament.isRegistered);
  return (
    tournament.status === 'registration' &&
    isWithinRegistrationWindow(tournament) &&
    !isRegistered &&
    isTournamentEligibleForMmr(tournament, userMmr) &&
    !isTournamentFull(tournament)
  );
};

export const canWithdrawFromTournament = (tournament: Tournament): boolean => {
  return Boolean(tournament.isRegistered) && (tournament.status === 'registration' || tournament.status === 'upcoming');
};

export const getTournamentCapacityPercent = (participantCount: number, bracketSize: number): number => {
  if (bracketSize <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((participantCount / bracketSize) * 100)));
};

export const getTournamentPrimaryAction = (tournament: Tournament, userMmr: number): TournamentPrimaryAction => {
  if (tournament.status === 'in_progress' && tournament.isRegistered) {
    return { kind: 'enter', labelKey: 'tournaments.actions.enterTournament', fallbackLabel: 'Enter Tournament', variant: 'gaming' };
  }

  if (canRegisterForTournament(tournament, userMmr)) {
    return { kind: 'register', labelKey: 'tournaments.actions.register', fallbackLabel: 'Register', variant: 'gaming' };
  }

  if (tournament.status === 'in_progress') {
    return { kind: 'view_live', labelKey: 'tournaments.actions.viewLive', fallbackLabel: 'View Live', variant: 'secondary' };
  }

  return { kind: 'view', labelKey: 'tournaments.actions.viewDetails', fallbackLabel: 'View Details', variant: 'secondary' };
};

export const formatTournamentDateTime = (isoDate: string): string => {
  const date = new Date(isoDate);
  if (!Number.isFinite(date.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

type RelativeTimeTranslator = (key: string, options?: Record<string, string | number>) => string;

export const formatTournamentRelativeTime = (
  isoDate: string,
  nowMsOrTranslator?: number | RelativeTimeTranslator,
  maybeTranslator?: RelativeTimeTranslator
): string => {
  let nowMs = Date.now();
  let t: RelativeTimeTranslator | undefined;

  if (typeof nowMsOrTranslator === 'number') {
    nowMs = nowMsOrTranslator;
    t = maybeTranslator;
  } else {
    t = nowMsOrTranslator;
  }

  const target = new Date(isoDate).getTime();
  const deltaMs = target - nowMs;
  const absMinutes = Math.round(Math.abs(deltaMs) / 60000);

  if (absMinutes < 1) {
    return t ? t('tournaments.time.now') : 'now';
  }

  if (absMinutes < 60) {
    if (deltaMs >= 0) {
      return t ? t('tournaments.time.inMinutes', { count: absMinutes }) : `in ${absMinutes}m`;
    }
    return t ? t('tournaments.time.minutesAgo', { count: absMinutes }) : `${absMinutes}m ago`;
  }

  const absHours = Math.round(absMinutes / 60);
  if (absHours < 24) {
    if (deltaMs >= 0) {
      return t ? t('tournaments.time.inHours', { count: absHours }) : `in ${absHours}h`;
    }
    return t ? t('tournaments.time.hoursAgo', { count: absHours }) : `${absHours}h ago`;
  }

  const absDays = Math.round(absHours / 24);
  if (deltaMs >= 0) {
    return t ? t('tournaments.time.inDays', { count: absDays }) : `in ${absDays}d`;
  }
  return t ? t('tournaments.time.daysAgo', { count: absDays }) : `${absDays}d ago`;
};
