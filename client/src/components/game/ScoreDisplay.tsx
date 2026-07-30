import { memo, useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../lib/utils/cn';

interface ScoreDisplayProps {
  score: number;
  playerType: 'you' | 'opponent';
  isLeading?: boolean;
  className?: string;
}

interface FloatingScore {
  id: number;
  value: number;
}

export const ScoreDisplay = memo(function ScoreDisplay({
  score,
  playerType,
  isLeading = false,
  className,
}: ScoreDisplayProps) {
  const [displayScore, setDisplayScore] = useState(score);
  const [isAnimating, setIsAnimating] = useState(false);
  const [floatingScores, setFloatingScores] = useState<FloatingScore[]>([]);
  const prevScore = useRef(score);
  const floatingIdRef = useRef(0);

  useEffect(() => {
    if (score !== prevScore.current) {
      const diff = score - prevScore.current;

      // Add floating score indicator
      if (diff > 0) {
        const newFloating: FloatingScore = {
          id: floatingIdRef.current++,
          value: diff,
        };
        setFloatingScores((prev) => [...prev, newFloating]);

        // Remove after animation
        setTimeout(() => {
          setFloatingScores((prev) => prev.filter((f) => f.id !== newFloating.id));
        }, 1000);
      }

      // Animate score roll
      setIsAnimating(true);
      const duration = 400;
      const startTime = Date.now();
      const startScore = prevScore.current;

      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic

        setDisplayScore(Math.round(startScore + (score - startScore) * eased));

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          setIsAnimating(false);
        }
      };

      requestAnimationFrame(animate);
      prevScore.current = score;
    }
  }, [score]);

  const colors = {
    you: {
      text: 'text-accent-teal',
      glow: 'rgba(0, 212, 170, 0.3)',
      gradient: 'from-accent-teal/20 to-accent-teal/5',
      border: 'border-accent-teal/30',
    },
    opponent: {
      text: 'text-accent-orange',
      glow: 'rgba(255, 107, 53, 0.3)',
      gradient: 'from-accent-orange/20 to-accent-orange/5',
      border: 'border-accent-orange/30',
    },
  };

  const color = colors[playerType];

  return (
    <div className={cn('relative', className)}>
      {/* Glass container */}
      <motion.div
        className={cn(
          'relative px-4 py-1 rounded-xl',
          'bg-gradient-to-b backdrop-blur-sm',
          'border',
          color.gradient,
          color.border,
          isLeading && 'ring-1 ring-amber-400/50'
        )}
        animate={isAnimating ? { scale: [1, 1.1, 1] } : {}}
        transition={{ duration: 0.4 }}
      >
        {/* Score number */}
        <motion.span
          className={cn(
            'font-score font-black text-2xl tabular-nums',
            color.text
          )}
          style={{
            textShadow: `0 0 20px ${color.glow}`,
          }}
        >
          {displayScore}
        </motion.span>

        {/* Leading indicator */}
        {isLeading && (
          <motion.div
            className="absolute -top-1 -right-1"
            initial={{ scale: 0, rotate: -45 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 15 }}
          >
            <span className="text-amber-400 text-xs">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
            </span>
          </motion.div>
        )}
      </motion.div>

      {/* Floating score indicators */}
      <AnimatePresence>
        {floatingScores.map((floating) => (
          <motion.div
            key={floating.id}
            className={cn(
              'absolute left-1/2 -translate-x-1/2 font-score font-bold text-lg',
              floating.value > 0 ? 'text-feedback-correct' : 'text-feedback-wrong'
            )}
            initial={{ y: 0, opacity: 1, scale: 0.5 }}
            animate={{ y: -40, opacity: 0, scale: 1.2 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1, ease: 'easeOut' }}
            style={{ top: '-10px' }}
          >
            +{floating.value}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
});

export default ScoreDisplay;
