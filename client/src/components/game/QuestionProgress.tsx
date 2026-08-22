import { memo } from 'react';
import { motion } from 'framer-motion';
import { cn } from '../../lib/utils/cn';

export type DotState = 'pending' | 'current' | 'correct' | 'wrong' | 'skipped';

interface QuestionProgressProps {
  total: number;
  current: number;
  history?: DotState[];
  className?: string;
}

export const QuestionProgress = memo(function QuestionProgress({
  total,
  current,
  history = [],
  className,
}: QuestionProgressProps) {
  const dots = Array.from({ length: total }, (_, i) => {
    const questionNum = i + 1;
    if (questionNum < current && history[i]) {
      return history[i];
    }
    if (questionNum === current) {
      return 'current';
    }
    return 'pending';
  });

  return (
    <div className={cn('flex items-center justify-center gap-2', className)}>
      {dots.map((state, index) => (
        <ProgressDot key={index} state={state} index={index} />
      ))}
    </div>
  );
});

interface ProgressDotProps {
  state: DotState;
  index: number;
}

const ProgressDot = memo(function ProgressDot({ state, index }: ProgressDotProps) {
  const baseClasses = 'w-2.5 h-2.5 rounded-full transition-all duration-300';

  const stateStyles = {
    pending: 'bg-white/20 border border-white/30',
    current: 'bg-accent-teal border-2 border-accent-teal shadow-glow-teal',
    correct: 'bg-feedback-correct border border-feedback-correct',
    wrong: 'bg-feedback-wrong border border-feedback-wrong',
    skipped: 'bg-gray-500/50 border border-gray-500/50',
  };

  if (state === 'current') {
    return (
      <motion.div
        className={cn(baseClasses, stateStyles[state])}
        animate={{
          scale: [1, 1.3, 1],
          boxShadow: [
            '0 0 10px rgba(0, 212, 170, 0.4)',
            '0 0 20px rgba(0, 212, 170, 0.6)',
            '0 0 10px rgba(0, 212, 170, 0.4)',
          ],
        }}
        transition={{
          duration: 1.5,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />
    );
  }

  if (state === 'correct') {
    return (
      <motion.div
        className={cn(baseClasses, stateStyles[state])}
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{
          type: 'spring',
          stiffness: 400,
          damping: 15,
          delay: index * 0.05,
        }}
      >
        <motion.div
          className="w-full h-full rounded-full bg-feedback-correct"
          animate={{
            boxShadow: [
              '0 0 5px rgba(34, 197, 94, 0.3)',
              '0 0 10px rgba(34, 197, 94, 0.5)',
              '0 0 5px rgba(34, 197, 94, 0.3)',
            ],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      </motion.div>
    );
  }

  if (state === 'wrong') {
    return (
      <motion.div
        className={cn(baseClasses, stateStyles[state])}
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{
          type: 'spring',
          stiffness: 400,
          damping: 15,
          delay: index * 0.05,
        }}
      />
    );
  }

  return (
    <motion.div
      className={cn(baseClasses, stateStyles[state])}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: index * 0.03 }}
    />
  );
});

export default QuestionProgress;