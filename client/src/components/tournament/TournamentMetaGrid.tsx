import { motion } from 'framer-motion';
import type { Tournament } from '../../stores/tournamentStore';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils/cn';
import { getTournamentFormatLabel, getTournamentFormatLabelKey, isTournamentEligibleForMmr } from './viewModels';

interface TournamentMetaGridProps {
  tournament: Tournament;
  userMmr: number;
  className?: string;
}

const ICONS: Record<string, string> = {
  format: '⚔️',
  questions: '📝',
  mmrRange: '🏆',
  currentRound: '🔄',
};

function MetaCell({
  label,
  value,
  icon,
  valueClassName,
  index,
}: {
  label: string;
  value: string;
  icon: string;
  valueClassName?: string;
  index: number;
}) {
  return (
    <motion.div
      className="rounded-xl border border-white/[0.07] bg-[#0f172a]/80 backdrop-blur-sm p-2.5 shadow-[0_2px_12px_rgba(0,0,0,0.25)]"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.3, ease: 'easeOut' }}
      whileHover={{ scale: 1.02, borderColor: 'rgba(255,255,255,0.15)' }}
    >
      <p className="text-[10px] uppercase tracking-wider text-text-secondary/70 flex items-center gap-1">
        <span>{icon}</span>
        {label}
      </p>
      <p className={cn('mt-1 text-sm font-semibold text-white', valueClassName)}>{value}</p>
    </motion.div>
  );
}

export function TournamentMetaGrid({ tournament, userMmr, className }: TournamentMetaGridProps) {
  const { t } = useTranslation();
  const mmrEligible = isTournamentEligibleForMmr(tournament, userMmr);
  const formatKey = getTournamentFormatLabelKey(tournament.format);
  const formatLabel = formatKey
    ? t(formatKey, getTournamentFormatLabel(tournament.format))
    : getTournamentFormatLabel(tournament.format);

  const cells = [
    { label: t('tournaments.meta.format', 'Format'), value: formatLabel, icon: ICONS.format, valueClassName: undefined as string | undefined },
    { label: t('tournaments.meta.questions', 'Questions'), value: String(tournament.questionCount), icon: ICONS.questions, valueClassName: undefined as string | undefined },
    { label: t('tournaments.meta.mmrRange', 'MMR Range'), value: `${tournament.minMmr} - ${tournament.maxMmr}`, icon: ICONS.mmrRange, valueClassName: mmrEligible ? 'text-emerald-300' : 'text-red-300' },
    { label: t('tournaments.meta.currentRound', 'Current Round'), value: String(Math.max(1, tournament.currentRound || 1)), icon: ICONS.currentRound, valueClassName: undefined as string | undefined },
  ];

  return (
    <div className={cn('grid grid-cols-2 gap-2.5', className)}>
      {cells.map((cell, i) => (
        <MetaCell key={i} {...cell} index={i} />
      ))}
    </div>
  );
}

export default TournamentMetaGrid;
