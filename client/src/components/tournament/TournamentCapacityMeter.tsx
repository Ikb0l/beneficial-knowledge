import { motion } from 'framer-motion';
import { cn } from '../../lib/utils/cn';
import { useTranslation } from 'react-i18next';
import { getTournamentCapacityPercent } from './viewModels';

interface TournamentCapacityMeterProps {
  participantCount: number;
  bracketSize: number;
  className?: string;
}

const GLOW_COLORS = {
  normal: 'rgba(45,212,191,0.7)',
  nearFull: 'rgba(251,191,36,0.7)',
  full: 'rgba(248,113,113,0.7)',
} as const;

const GRADIENTS = {
  normal: 'from-emerald-400 to-teal-500',
  nearFull: 'from-amber-300 to-amber-500',
  full: 'from-red-400 to-rose-500',
} as const;

export function TournamentCapacityMeter({
  participantCount,
  bracketSize,
  className,
}: TournamentCapacityMeterProps) {
  const { t } = useTranslation();
  const percent = getTournamentCapacityPercent(participantCount, bracketSize);
  const isFull = participantCount >= bracketSize;
  const isNearFull = percent >= 75;

  const state = isFull ? 'full' : isNearFull ? 'nearFull' : 'normal';
  const glowColor = GLOW_COLORS[state];

  const labelColor = isFull ? 'text-red-300' : isNearFull ? 'text-amber-300' : 'text-emerald-300';


  return (
    <div className={cn('space-y-1.5', className)} role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
      <div className="flex items-center justify-between text-[11px] text-text-secondary">
        <span>{t('tournaments.meta.capacity', 'Capacity')}</span>
        <motion.span
          className={cn('font-semibold tabular-nums', labelColor)}
          key={`${participantCount}-${bracketSize}`}
          initial={{ scale: 1.3, opacity: 0.6 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.2 }}
        >
          {participantCount}/{bracketSize}
        </motion.span>
      </div>

      {/* Track */}
      <div className="h-2 rounded-full bg-white/8 overflow-hidden relative shadow-inner">
        {/* Fill bar */}
        <motion.div
          className={cn('h-full rounded-full bg-gradient-to-r relative overflow-hidden', GRADIENTS[state])}
          initial={{ width: 0 }}
          animate={{ width: `${percent}%` }}
          transition={{ duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
        >
          {/* Inner gloss */}
          <div className="absolute inset-x-0 top-0 h-[40%] rounded-t-full bg-white/20" />

          {/* Leading edge glow dot */}
          <motion.div
            className="absolute right-0 top-1/2 -translate-y-1/2 w-[6px] h-[6px] rounded-full"
            style={{ background: 'white', boxShadow: `0 0 8px ${glowColor}, 0 0 16px ${glowColor}` }}
            animate={{ opacity: [0.7, 1, 0.7] }}
            transition={{ duration: 0.8, repeat: Infinity, ease: 'easeInOut' }}
          />
        </motion.div>

        {/* Track shimmer */}
        {percent < 100 && (
          <motion.div
            className="absolute inset-y-0 rounded-full"
            style={{
              width: '30%',
              background: `linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent)`,
            }}
            animate={{ left: ['-30%', '105%'] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: 'linear' }}
          />
        )}
      </div>
    </div>
  );
}

export default TournamentCapacityMeter;
