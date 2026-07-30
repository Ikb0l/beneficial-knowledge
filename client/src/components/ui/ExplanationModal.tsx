import { forwardRef, useId, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../lib/utils/cn';
import { useDialog } from '../../hooks/useDialog';

interface ExplanationModalProps {
  isOpen: boolean;
  onClose: () => void;
  explanation: string;
  isCorrect: boolean;
  correctAnswer: string;
  className?: string;
}

export const ExplanationModal = forwardRef<HTMLDivElement, ExplanationModalProps>(
  ({ isOpen, onClose, explanation, isCorrect, correctAnswer, className }, ref) => {
    const titleId = useId();
    const dialogRef = useRef<HTMLDivElement>(null);
    const closeButtonRef = useRef<HTMLButtonElement>(null);

    useDialog({
      open: isOpen,
      onClose,
      dialogRef,
      initialFocusRef: closeButtonRef,
    });

    return (
      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={ref}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={cn(
              'fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60',
              className
            )}
            onClick={onClose}
            role="presentation"
          >
            <motion.div
              ref={dialogRef}
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              initial={{ y: 100, opacity: 0, scale: 0.95 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 100, opacity: 0, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="w-full max-w-[min(92vw,32rem)] md:max-w-md bg-bg-card rounded-[clamp(16px,3.4vw,24px)] overflow-hidden shadow-2xl border border-white/10"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header with result indicator */}
              <div className={cn(
                'px-[clamp(16px,4vw,24px)] py-[clamp(12px,3vw,18px)] border-b border-white/10',
                isCorrect ? 'bg-feedback-correct/20' : 'bg-feedback-wrong/20'
              )}>
                <div className="flex items-center gap-3">
                  <motion.div
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 15, delay: 0.1 }}
                    className={cn(
                      'w-12 h-12 rounded-full flex items-center justify-center',
                      isCorrect ? 'bg-feedback-correct' : 'bg-feedback-wrong'
                    )}
                  >
                    {isCorrect ? (
                      <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    )}
                  </motion.div>
                  <div>
                    <h3 id={titleId} className={cn(
                      'font-display text-xl font-bold',
                      isCorrect ? 'text-feedback-correct' : 'text-feedback-wrong'
                    )}>
                      {isCorrect ? 'Correct!' : 'Incorrect'}
                    </h3>
                    <p className="text-text-secondary text-sm">
                      {isCorrect ? 'Great job!' : `The answer was: ${correctAnswer}`}
                    </p>
                  </div>
                </div>
              </div>

              {/* Explanation content */}
              <div className="px-[clamp(16px,4vw,24px)] py-[clamp(14px,3.4vw,20px)]">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-accent-purple/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg className="w-4 h-4 text-accent-purple" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-white text-sm mb-2">Explanation</h4>
                    <p className="text-text-secondary text-sm leading-relaxed">
                      {explanation}
                    </p>
                  </div>
                </div>
              </div>

              {/* Close button */}
              <div className="px-[clamp(16px,4vw,24px)] pb-[clamp(16px,4vw,24px)]">
                <motion.button
                  ref={closeButtonRef}
                  type="button"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={onClose}
                  className="w-full py-3 rounded-xl bg-accent-teal text-white font-semibold hover:bg-accent-teal/90 transition-colors"
                >
                  Got it!
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }
);

ExplanationModal.displayName = 'ExplanationModal';

export default ExplanationModal;
