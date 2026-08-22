import { motion } from 'framer-motion';
import type { TournamentStatus } from '../../stores/tournamentStore';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils/cn';
import { getTournamentStatusPresentation } from './viewModels';

interface TournamentStatusBadgeProps {
  status: TournamentStatus;
  className?: string;
}

export function TournamentStatusBadge({ status, className }: TournamentStatusBadgeProps) {
  const { t } = useTranslation();
  const presentation = getTournamentStatusPresentation(status);
  const isLive = presentation.tone === 'live';

  return (
    <motion.span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide relative',
        presentation.className,
        className,
      )}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
    >
      {/* Outer glow ring — only for live */}
      {isLive && (
        <motion.span
          className="absolute -inset-[3px] rounded-full pointer-events-none"
          animate={{
            boxShadow: [
              '0 0 4px rgba(245,158,11,0.2)',
              '0 0 14px rgba(245,158,11,0.5)',
              '0 0 4px rgba(245,158,11,0.2)',
            ],
          }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}

      {/* Live dot — framer-motion breathing */}
      {isLive && (
        <motion.span
          className="h-1.5 w-1.5 rounded-full bg-amber-300"
          aria-hidden="true"
          animate={{
            opacity: [0.5, 1, 0.5],
            scale: [0.85, 1.15, 0.85],
          }}
          transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}

      {t(presentation.labelKey, presentation.fallbackLabel)}
    </motion.span>
  );
}

export default TournamentStatusBadge;
