import { memo } from 'react';
import { motion } from 'framer-motion';
import { cn } from '../../lib/utils/cn';

interface QuestionCardProps {
  question: string;
  className?: string;
  compact?: boolean;
  veryCompact?: boolean;
}

export const QuestionCard = memo(function QuestionCard({
  question,
  className,
  compact = false,
  veryCompact = false,
}: QuestionCardProps) {
  // Keep question text readable without oversized jumps between devices.
  const getFontSize = (text: string) => {
    const length = text.length;
    if (veryCompact) {
      if (length < 60) return 'text-base sm:text-lg';
      if (length < 120) return 'text-sm sm:text-base';
      return 'text-xs sm:text-sm';
    }
    if (compact) {
      if (length < 60) return 'text-base sm:text-xl';
      if (length < 120) return 'text-sm sm:text-lg';
      return 'text-sm';
    }
    if (length < 60) return 'text-lg sm:text-xl md:text-2xl';
    if (length < 120) return 'text-base sm:text-lg md:text-xl';
    if (length < 180) return 'text-sm sm:text-base md:text-lg';
    return 'text-sm sm:text-base';
  };

  return (
    <motion.div
      className={cn('relative', className)}
      initial={{ y: 30, opacity: 0, scale: 0.95 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      exit={{ x: -100, opacity: 0 }}
      transition={{
        type: 'spring',
        stiffness: 300,
        damping: 25,
        duration: 0.4,
      }}
    >
      {/* Main card */}
      <div
        className={cn(
          'relative overflow-y-auto',
          'rounded-3xl border',
          veryCompact
            ? 'min-h-[68px] max-h-[min(24vh,180px)] p-[clamp(8px,2.3vw,14px)]'
            : compact
              ? 'min-h-[72px] max-h-[min(27vh,220px)] p-[clamp(9px,2.6vw,16px)]'
              : 'min-h-[clamp(76px,12vw,128px)] max-h-[min(30vh,280px)] p-[clamp(10px,2.8vw,20px)]',
          'flex items-center justify-center'
        )}
        style={{
          background: 'rgba(17, 26, 46, 0.92)',
          borderColor: 'rgba(42, 58, 95, 0.9)',
          boxShadow: `
            0 10px 28px rgba(2, 6, 23, 0.34),
            inset 0 1px 0 rgba(179, 201, 240, 0.06)
          `,
        }}
      >
        {/* Subtle top-to-bottom depth gradient */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'linear-gradient(180deg, rgba(255,255,255,0.03) 0%, transparent 55%, rgba(0,0,0,0.12) 100%)',
          }}
        />

        {/* Soft top edge highlight */}
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 h-px"
          style={{
            width: '58%',
            background: 'linear-gradient(90deg, transparent, rgba(147, 197, 253, 0.26), transparent)',
          }}
        />

        {/* Question text */}
        <motion.h2
          className={cn(
            'relative z-10',
            'font-heading font-semibold text-[#F3F6FF] text-center leading-relaxed',
            getFontSize(question)
          )}
          style={{
            textShadow: '0 1px 2px rgba(2, 6, 23, 0.4)',
            maxWidth: '100%',
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.3 }}
        >
          {question}
        </motion.h2>
      </div>
    </motion.div>
  );
});

export default QuestionCard;
