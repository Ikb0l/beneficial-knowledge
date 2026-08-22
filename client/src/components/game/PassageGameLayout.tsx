import { useState, useCallback, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../lib/utils/cn';

type MobileView = 'passage' | 'question';

interface PassageGameLayoutProps {
  passageContent: ReactNode;
  questionContent: ReactNode;
  hasPassage: boolean;
  compact?: boolean;
  veryCompact?: boolean;
  className?: string;
  passageWidth?: number;
}

export function PassageGameLayout({
  passageContent,
  questionContent,
  hasPassage,
  
  
  className,
  passageWidth = 0.4,
}: PassageGameLayoutProps) {
  const [mobileView, setMobileView] = useState<MobileView>('question');

  const showPassage = useCallback(() => setMobileView('passage'), []);
  const showQuestion = useCallback(() => setMobileView('question'), []);

  if (!hasPassage) {
    return <>{questionContent}</>;
  }

  return (
    <>
      {/* ── Desktop: Side-by-side ──────────────────────────── */}
      <div className={cn('hidden md:flex h-full w-full', className)}>
        <div
          className="flex-shrink-0 h-full"
          style={{ width: `${passageWidth * 100}%` }}
        >
          {passageContent}
        </div>

        {/* Subtle vertical divider */}
        <div className="flex-shrink-0 w-px bg-gradient-to-b from-transparent via-white/[0.04] to-transparent" />

        <div className="flex-1 h-full overflow-y-auto">
          {questionContent}
        </div>
      </div>

      {/* ── Mobile: iOS-style segmented control ─────────────── */}
      <div className={cn('md:hidden flex flex-col h-full', className)}>
        {/* Segmented control bar */}
        <div className="flex-shrink-0 px-3 pt-2.5 pb-2">
          <div className="flex bg-white/[0.03] rounded-xl p-[3px] border border-white/[0.05] backdrop-blur-sm">
            <button
              onClick={showPassage}
              className={cn(
                'flex-1 flex items-center justify-center gap-2',
                'py-2.5 rounded-[10px] text-sm font-semibold',
                'transition-all duration-300 ease-out',
                mobileView === 'passage'
                  ? 'bg-white/[0.08] text-white shadow-[0_1px_3px_rgba(0,0,0,0.3)]'
                  : 'text-white/35 hover:text-white/60'
              )}
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.8}
                  d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                />
              </svg>
              <span className="tracking-[-0.01em]">Reading</span>
            </button>
            <button
              onClick={showQuestion}
              className={cn(
                'flex-1 flex items-center justify-center gap-2',
                'py-2.5 rounded-[10px] text-sm font-semibold',
                'transition-all duration-300 ease-out',
                mobileView === 'question'
                  ? 'bg-white/[0.08] text-white shadow-[0_1px_3px_rgba(0,0,0,0.3)]'
                  : 'text-white/35 hover:text-white/60'
              )}
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.8}
                  d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M12 15h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span className="tracking-[-0.01em]">Questions</span>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden relative mx-3 mb-3 rounded-2xl border border-white/[0.04] bg-[#0f172a]/80 backdrop-blur-sm">
          <AnimatePresence mode="wait">
            {mobileView === 'passage' ? (
              <motion.div
                key="passage"
                initial={{ opacity: 0, filter: 'blur(4px)' }}
                animate={{ opacity: 1, filter: 'blur(0px)' }}
                exit={{ opacity: 0, filter: 'blur(4px)' }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className="h-full overflow-y-auto rounded-2xl"
              >
                {passageContent}
              </motion.div>
            ) : (
              <motion.div
                key="question"
                initial={{ opacity: 0, filter: 'blur(4px)' }}
                animate={{ opacity: 1, filter: 'blur(0px)' }}
                exit={{ opacity: 0, filter: 'blur(4px)' }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className="h-full overflow-y-auto rounded-2xl"
              >
                {questionContent}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </>
  );
}

export default PassageGameLayout;
