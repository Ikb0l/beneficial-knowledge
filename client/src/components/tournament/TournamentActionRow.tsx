import { motion } from 'framer-motion';
import type { Tournament } from '../../stores/tournamentStore';
import { useTranslation } from 'react-i18next';
import { Badge, Button } from '../ui';
import {
  canRegisterForTournament,
  canWithdrawFromTournament,
  getTournamentPrimaryAction,
  isTournamentEligibleForMmr,
  isTournamentFull,
} from './viewModels';

interface TournamentActionRowProps {
  tournament: Tournament;
  userMmr: number;
  primaryLabelOverride?: string | null;
  isRegistering?: boolean;
  isWithdrawing?: boolean;
  onView: () => void;
  onRegister: () => void;
  onWithdraw: () => void;
}

export function TournamentActionRow({
  tournament,
  userMmr,
  primaryLabelOverride = null,
  isRegistering = false,
  isWithdrawing = false,
  onView,
  onRegister,
  onWithdraw,
}: TournamentActionRowProps) {
  const { t } = useTranslation();
  const primaryAction = getTournamentPrimaryAction(tournament, userMmr);
  const canRegister = canRegisterForTournament(tournament, userMmr);
  const canWithdraw = canWithdrawFromTournament(tournament);
  const isEligible = isTournamentEligibleForMmr(tournament, userMmr);
  const full = isTournamentFull(tournament);

  const handlePrimaryClick = () => {
    if (primaryAction.kind === 'register') {
      onRegister();
      return;
    }
    onView();
  };

  const primaryLoading = primaryAction.kind === 'register' ? isRegistering : false;
  const primaryLabel = primaryLoading
    ? t('tournaments.actions.joining', 'Joining...')
    : (primaryLabelOverride || t(primaryAction.labelKey, primaryAction.fallbackLabel));
  const showSecondaryView = primaryAction.kind !== 'view';

  let helperMessage: string | null = null;
  if (!tournament.isRegistered) {
    if (tournament.status === 'registration' && !isEligible) {
      helperMessage = t('tournaments.eligibility.outOfRange', {
        min: tournament.minMmr,
        max: tournament.maxMmr,
        defaultValue: 'Your MMR is outside the required range ({{min}}-{{max}}).',
      });
    } else if (tournament.status === 'registration' && full) {
      helperMessage = t('tournaments.eligibility.full', 'Bracket is full for this tournament.');
    } else if (tournament.status === 'upcoming') {
      helperMessage = t('tournaments.eligibility.upcoming', 'Registration window has closed. Tournament starts soon.');
    } else if (tournament.status === 'completed') {
      helperMessage = t('tournaments.eligibility.completed', 'This tournament is already completed.');
    } else if (tournament.status === 'cancelled') {
      helperMessage = t('tournaments.eligibility.cancelled', 'This tournament has been cancelled.');
    }
  }

  return (
    <div className="space-y-3">
      {/* Primary CTA */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.25 }}
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.98 }}
      >
        <Button
          variant={primaryAction.variant}
          size="md"
          className="w-full"
          loading={primaryLoading}
          onClick={handlePrimaryClick}
          disabled={primaryLoading || isWithdrawing}
        >
          {primaryLabel}
        </Button>
      </motion.div>

      {/* Secondary buttons */}
      <motion.div
        className="flex flex-wrap gap-2"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.14, duration: 0.25 }}
      >
        {showSecondaryView && (
          <Button
            variant="secondary"
            size="sm"
            className="flex-1 min-w-[126px]"
            onClick={onView}
            disabled={primaryLoading || isWithdrawing}
          >
            {t('tournaments.actions.view', 'View')}
          </Button>
        )}

        {canWithdraw && (
          <Button
            variant="danger"
            size="sm"
            className="flex-1 min-w-[126px]"
            loading={isWithdrawing}
            onClick={onWithdraw}
            disabled={primaryLoading || isWithdrawing}
          >
            {isWithdrawing
              ? t('tournaments.actions.withdrawing', 'Withdrawing...')
              : t('tournaments.actions.withdraw', 'Withdraw')}
          </Button>
        )}

        {!showSecondaryView && canWithdraw && (
          <Button
            variant="secondary"
            size="sm"
            className="flex-1 min-w-[126px]"
            onClick={onView}
            disabled={primaryLoading || isWithdrawing}
          >
            {t('tournaments.actions.view', 'View')}
          </Button>
        )}
      </motion.div>

      {/* Badges — staggered */}
      <motion.div
        className="flex flex-wrap gap-2"
        initial="hidden"
        animate="visible"
        variants={{ visible: { transition: { staggerChildren: 0.04 } } }}
      >
        {!tournament.isRegistered && !isEligible && tournament.status === 'registration' && (
          <motion.div variants={{ hidden: { opacity: 0, scale: 0.9 }, visible: { opacity: 1, scale: 1 } }}>
            <Badge variant="error" size="sm" className="rounded-lg">
              {t('tournaments.badges.mmrNotEligible', 'MMR not eligible')}
            </Badge>
          </motion.div>
        )}
        {!tournament.isRegistered && full && tournament.status === 'registration' && isEligible && (
          <motion.div variants={{ hidden: { opacity: 0, scale: 0.9 }, visible: { opacity: 1, scale: 1 } }}>
            <Badge variant="warning" size="sm" className="rounded-lg">
              {t('tournaments.badges.full', 'Tournament full')}
            </Badge>
          </motion.div>
        )}
        {tournament.isRegistered && tournament.status !== 'in_progress' && !canWithdraw && (
          <motion.div variants={{ hidden: { opacity: 0, scale: 0.9 }, visible: { opacity: 1, scale: 1 } }}>
            <Badge variant="primary" size="sm" className="rounded-lg">
              {t('tournaments.badges.registered', 'Registered')}
            </Badge>
          </motion.div>
        )}
        {canRegister && (
          <motion.div variants={{ hidden: { opacity: 0, scale: 0.9 }, visible: { opacity: 1, scale: 1 } }}>
            <Badge variant="success" size="sm" className="rounded-lg">
              {t('tournaments.badges.registrationOpen', 'Registration open')}
            </Badge>
          </motion.div>
        )}
      </motion.div>

      {/* Helper message */}
      {helperMessage && (
        <motion.p
          className="rounded-xl border border-white/[0.04] bg-white/[0.02] px-3 py-2 text-xs text-text-secondary/60"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          {helperMessage}
        </motion.p>
      )}
    </div>
  );
}

export default TournamentActionRow;
