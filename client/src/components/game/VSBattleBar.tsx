import { memo, useMemo } from 'react';
import { motion } from 'framer-motion';
import { cn } from '../../lib/utils/cn';
import { formatQuizDisplayName } from '../../lib/utils/quizDisplayName';

interface VSBattleBarProps {
  leftScore: number;
  rightScore: number;
  leftName?: string;
  rightName?: string;
  leftAvatarUrl?: string | null;
  rightAvatarUrl?: string | null;
  show?: boolean;
  className?: string;
}

/**
 * VS Battle Bar - Horizontal tug-of-war score comparison
 * Shows proportional bar widths based on scores with winner glow effect
 */
export const VSBattleBar = memo(function VSBattleBar({
  leftScore,
  rightScore,
  leftName = 'You',
  rightName = 'Opponent',
  show = true,
  className,
}: VSBattleBarProps) {
  const safeLeftName = formatQuizDisplayName(leftName, 'You');
  const safeRightName = formatQuizDisplayName(rightName, 'Opponent');
  const total = leftScore + rightScore || 1; // Prevent division by zero
  const leftPercent = (leftScore / total) * 100;
  const rightPercent = (rightScore / total) * 100;

  const isLeftWinning = leftScore > rightScore;
  const isRightWinning = rightScore > leftScore;
  const isTied = leftScore === rightScore;

  // Calculate visual percentages (minimum 15% for visibility)
  const visualLeftPercent = useMemo(() => {
    if (leftScore === 0 && rightScore === 0) return 50;
    return Math.max(15, Math.min(85, leftPercent));
  }, [leftScore, rightScore, leftPercent]);

  const visualRightPercent = 100 - visualLeftPercent;

  if (!show) return null;

  return (
    <motion.div
      className={cn('w-full', className)}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, duration: 0.4 }}
    >
      {/* Score labels above bar */}
      <div className="flex justify-between items-end mb-2 px-1">
        <motion.div
          className="flex flex-col items-start"
          initial={{ x: -20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          <span className="text-xs text-white/60 font-medium">{safeLeftName}</span>
          <motion.span
            className={cn(
              'font-score font-black text-xl tabular-nums',
              isLeftWinning ? 'text-accent-teal text-glow-teal' : 'text-white/80'
            )}
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.5, type: 'spring', stiffness: 300 }}
          >
            {leftScore}
          </motion.span>
        </motion.div>

        {/* VS Badge in center */}
        <motion.div
          className="relative"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.5, type: 'spring', stiffness: 400, damping: 15 }}
        >
          <div
            className="px-3 py-1 rounded-full font-heading font-black text-sm"
            style={{
              background: 'linear-gradient(135deg, #ffd700 0%, #b8860b 100%)',
              color: '#1a1510',
              boxShadow: '0 0 15px rgba(255, 215, 0, 0.4)',
            }}
          >
            VS
          </div>
        </motion.div>

        <motion.div
          className="flex flex-col items-end"
          initial={{ x: 20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          <span className="text-xs text-white/60 font-medium">{safeRightName}</span>
          <motion.span
            className={cn(
              'font-score font-black text-xl tabular-nums',
              isRightWinning ? 'text-accent-orange text-glow-orange' : 'text-white/80'
            )}
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.5, type: 'spring', stiffness: 300 }}
          >
            {rightScore}
          </motion.span>
        </motion.div>
      </div>

      {/* Battle bar container */}
      <div className="relative h-6 rounded-full overflow-hidden bg-white/5 border border-white/10">
        {/* Center divider line */}
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/20 z-10" />

        {/* Left bar (teal/cyan) - grows from left */}
        <motion.div
          className={cn(
            'absolute left-0 top-0 bottom-0 rounded-l-full',
            isLeftWinning && 'winner-bar-glow'
          )}
          style={{
            background: isLeftWinning
              ? 'linear-gradient(90deg, #20c5ff 0%, #15a7e0 100%)'
              : 'linear-gradient(90deg, rgba(0, 212, 170, 0.6) 0%, rgba(0, 245, 212, 0.6) 100%)',
            boxShadow: isLeftWinning
              ? '0 0 20px rgba(0, 212, 170, 0.5), inset 0 2px 4px rgba(255,255,255,0.2)'
              : 'inset 0 2px 4px rgba(255,255,255,0.1)',
            color: '#20c5ff',
          }}
          initial={{ width: 0 }}
          animate={{ width: `${visualLeftPercent}%` }}
          transition={{
            delay: 0.6,
            duration: 0.8,
            ease: [0.34, 1.56, 0.64, 1],
          }}
        >
          {/* Shine effect */}
          <motion.div
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(180deg, rgba(255,255,255,0.3) 0%, transparent 50%)',
            }}
          />
        </motion.div>

        {/* Right bar (orange) - grows from right */}
        <motion.div
          className={cn(
            'absolute right-0 top-0 bottom-0 rounded-r-full',
            isRightWinning && 'winner-bar-glow'
          )}
          style={{
            background: isRightWinning
              ? 'linear-gradient(270deg, #ff6b35 0%, #ff8c5a 100%)'
              : 'linear-gradient(270deg, rgba(255, 107, 53, 0.6) 0%, rgba(255, 140, 90, 0.6) 100%)',
            boxShadow: isRightWinning
              ? '0 0 20px rgba(255, 107, 53, 0.5), inset 0 2px 4px rgba(255,255,255,0.2)'
              : 'inset 0 2px 4px rgba(255,255,255,0.1)',
            color: '#ff6b35',
          }}
          initial={{ width: 0 }}
          animate={{ width: `${visualRightPercent}%` }}
          transition={{
            delay: 0.6,
            duration: 0.8,
            ease: [0.34, 1.56, 0.64, 1],
          }}
        >
          {/* Shine effect */}
          <motion.div
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(180deg, rgba(255,255,255,0.3) 0%, transparent 50%)',
            }}
          />
        </motion.div>

        {/* Tie indicator - pulsing center line */}
        {isTied && (
          <motion.div
            className="absolute left-1/2 top-0 bottom-0 w-1 -translate-x-1/2 z-20"
            style={{
              background: 'linear-gradient(180deg, #ffd700, #b8860b)',
              boxShadow: '0 0 10px rgba(255, 215, 0, 0.6)',
            }}
            animate={{
              opacity: [0.8, 1, 0.8],
              boxShadow: [
                '0 0 10px rgba(255, 215, 0, 0.6)',
                '0 0 20px rgba(255, 215, 0, 0.8)',
                '0 0 10px rgba(255, 215, 0, 0.6)',
              ],
            }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
        )}
      </div>

      {/* Percentage labels below bar */}
      <div className="flex justify-between mt-1 px-2">
        <span className="text-xs text-white/40 tabular-nums">
          {Math.round(leftPercent)}%
        </span>
        <span className="text-xs text-white/40 tabular-nums">
          {Math.round(rightPercent)}%
        </span>
      </div>
    </motion.div>
  );
});

export default VSBattleBar;
