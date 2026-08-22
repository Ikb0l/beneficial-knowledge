import { motion } from 'framer-motion';
import type { Tournament } from '../../stores/tournamentStore';
import { useTranslation } from 'react-i18next';
import { Button, Card, Badge } from '../ui';
import { TournamentStatusBadge } from './TournamentStatusBadge';
import { TournamentCapacityMeter } from './TournamentCapacityMeter';
import {
  canRegisterForTournament,
  canWithdrawFromTournament,
  formatTournamentDateTime,
  formatTournamentRelativeTime,
  getTournamentFormatLabel,
  getTournamentFormatLabelKey,
  isTournamentEligibleForMmr,
} from './viewModels';

interface TournamentSummaryPanelProps {
  tournament: Tournament;
  userMmr: number;
  isRegistered: boolean;
  actionLoading: boolean;
  onRegister: () => void;
  onWithdraw: () => void;
}

export function TournamentSummaryPanel({
  tournament,
  userMmr,
  isRegistered,
  actionLoading,
  onRegister,
  onWithdraw,
}: TournamentSummaryPanelProps) {
  const { t } = useTranslation();
  const effectiveTournament = { ...tournament, isRegistered };
  const canRegister = canRegisterForTournament(effectiveTournament, userMmr);
  const canWithdraw = canWithdrawFromTournament(effectiveTournament);
  const eligible = isTournamentEligibleForMmr(tournament, userMmr);
  const formatKey = getTournamentFormatLabelKey(tournament.format);
  const formatLabel = formatKey
    ? t(formatKey, getTournamentFormatLabel(tournament.format))
    : getTournamentFormatLabel(tournament.format);

  const stagger = { delay: 0.04 };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
      whileHover={{ scale: 1.005 }}
    >
      <Card variant="glass" className="overflow-hidden border border-white/[0.07] bg-[#0b1120]/90 backdrop-blur-sm shadow-[0_8px_32px_rgba(0,0,0,0.4)] relative">
        {/* Header */}
        <div className="relative border-b border-white/[0.06] bg-gradient-to-r from-[#0c1630]/95 via-[#101d44]/90 to-[#1a1248]/88 px-4 py-3.5 overflow-hidden">
          {/* Shimmer sweep */}
          <motion.div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'linear-gradient(105deg, transparent 0%, transparent 38%, rgba(255,255,255,0.06) 42%, rgba(255,255,255,0.1) 45%, rgba(255,255,255,0.06) 48%, transparent 52%, transparent 100%)',
            }}
            animate={{ x: ['-100%', '200%'] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'linear', repeatDelay: 2 }}
          />

          <div className="flex items-center justify-between gap-2 relative z-[1]">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.24em] text-text-secondary/60">
                {t('tournaments.sectionLabel', 'Tournament')}
              </p>
              <h3 className="truncate text-lg font-heading font-bold text-white tracking-[-0.01em]">
                {tournament.name}
              </h3>
            </div>
            <TournamentStatusBadge status={tournament.status} />
          </div>
        </div>

        {/* Body — staggered children */}
        <motion.div className="space-y-4 p-4" initial="hidden" animate="visible" variants={{ visible: { transition: { staggerChildren: stagger.delay } } }}>
          <motion.div variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}>
            <TournamentCapacityMeter
              participantCount={tournament.registeredCount ?? tournament.participantCount}
              bracketSize={tournament.bracketSize}
            />
          </motion.div>

          <motion.div className="grid grid-cols-2 gap-2" variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}>
            <div className="rounded-xl border border-white/[0.06] bg-[#0f172a]/75 p-2.5">
              <p className="text-[10px] uppercase tracking-wide text-text-secondary/60">{t('tournaments.meta.format', 'Format')}</p>
              <p className="mt-1 text-sm font-semibold text-white">{formatLabel}</p>
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-[#0f172a]/75 p-2.5">
              <p className="text-[10px] uppercase tracking-wide text-text-secondary/60">{t('tournaments.meta.questions', 'Questions')}</p>
              <p className="mt-1 text-sm font-semibold text-white">{tournament.questionCount}</p>
            </div>
          </motion.div>

          <motion.div className="rounded-xl border border-white/[0.06] bg-[#0f172a]/75 p-2.5" variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}>
            <p className="text-[10px] uppercase tracking-wide text-text-secondary/60">{t('tournaments.meta.starts', 'Starts')}</p>
            <p className="mt-1 text-sm font-semibold text-white">{formatTournamentDateTime(tournament.tournamentStart)}</p>
            <p className="mt-1 text-xs text-text-secondary/70">{formatTournamentRelativeTime(tournament.tournamentStart, t)}</p>
          </motion.div>

          <motion.div className="flex flex-wrap gap-2" variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}>
            <Badge variant={eligible ? 'success' : 'error'} size="sm" className="rounded-lg">
              {eligible
                ? t('tournaments.badges.mmrEligible', 'MMR eligible')
                : t('tournaments.badges.mmrNotEligible', 'MMR not eligible')}
            </Badge>
            {isRegistered && (
              <Badge variant="primary" size="sm" className="rounded-lg">
                {t('tournaments.badges.youRegistered', 'You are registered')}
              </Badge>
            )}
          </motion.div>

          <motion.div className="space-y-2" variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}>
            {canRegister && (
              <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}>
                <Button variant="gaming" fullWidth loading={actionLoading} onClick={onRegister}>
                  {actionLoading ? t('tournaments.actions.joining', 'Joining...') : t('tournaments.actions.registerNow', 'Register now')}
                </Button>
              </motion.div>
            )}
            {canWithdraw && (
              <Button variant="danger" fullWidth loading={actionLoading} onClick={onWithdraw}>
                {actionLoading
                  ? t('tournaments.actions.withdrawing', 'Withdrawing...')
                  : t('tournaments.actions.withdraw', 'Withdraw')}
              </Button>
            )}
            {!canRegister && !canWithdraw && (
              <p className="rounded-xl border border-white/[0.05] bg-white/[0.02] px-3 py-2 text-sm text-text-secondary/60">
                {t('tournaments.summary.noAction', 'No immediate action required. Check bracket updates below.')}
              </p>
            )}
          </motion.div>
        </motion.div>
      </Card>
    </motion.div>
  );
}

export default TournamentSummaryPanel;
