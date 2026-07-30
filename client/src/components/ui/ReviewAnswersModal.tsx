import { useId, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils/cn';
import type { QuestionReviewItem } from '../../stores/gameStore';
import { useDialog } from '../../hooks/useDialog';

interface ReviewAnswersModalProps {
  isOpen: boolean;
  onClose: () => void;
  questionHistory: QuestionReviewItem[];
}

interface QuestionCardProps {
  item: QuestionReviewItem;
  index: number;
}

const QuestionCard = ({ item, index }: QuestionCardProps) => {
  const { t } = useTranslation();
  const [showExplanation, setShowExplanation] = useState(false);

  const optionLabels = ['A', 'B', 'C', 'D', 'E', 'F'];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="bg-bg-secondary rounded-[clamp(12px,2.6vw,18px)] border border-white/10 overflow-hidden"
    >
      {/* Question Header */}
      <div className="px-[clamp(12px,3vw,18px)] py-[clamp(10px,2.6vw,14px)] border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-text-secondary text-sm font-medium">
            {t('results.questionNumber', { number: item.questionNumber })}
          </span>
        </div>
        <div className={cn(
          'flex items-center gap-2 text-sm font-semibold',
          item.myCorrect ? 'text-feedback-correct' : 'text-feedback-wrong'
        )}>
          {item.myCorrect ? (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              {t('results.correct')}
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              {t('results.wrong')}
            </>
          )}
          {item.myTimeMs !== null && (
            <span className="text-text-muted ml-1">
              {(item.myTimeMs / 1000).toFixed(1)}s
            </span>
          )}
        </div>
      </div>

      {/* Question Text */}
      <div className="px-[clamp(12px,3vw,18px)] py-[clamp(10px,2.6vw,14px)]">
        <p className="text-white text-sm font-medium leading-relaxed">
          {item.questionText}
        </p>
      </div>

      {/* Options */}
      <div className="px-[clamp(12px,3vw,18px)] pb-[clamp(10px,2.6vw,14px)] space-y-2">
        {item.options.map((option, optionIndex) => {
          const isCorrect = optionIndex === item.correctIndex;
          const isMyAnswer = optionIndex === item.myAnswerIndex;
          const isOpponentAnswer = optionIndex === item.opponentAnswerIndex;

          return (
            <div
              key={optionIndex}
              className={cn(
                'px-3 py-2 rounded-lg text-sm flex items-center justify-between',
                isCorrect && 'bg-feedback-correct/20 border border-feedback-correct/40',
                !isCorrect && isMyAnswer && 'bg-feedback-wrong/20 border border-feedback-wrong/40',
                !isCorrect && !isMyAnswer && 'bg-white/5 border border-white/10'
              )}
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className={cn(
                  'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0',
                  isCorrect ? 'bg-feedback-correct text-white' : 'bg-white/10 text-text-secondary'
                )}>
                  {optionLabels[optionIndex] || String(optionIndex + 1)}
                </span>
                <span className={cn(
                  'truncate',
                  isCorrect ? 'text-feedback-correct font-medium' : 'text-text-primary'
                )}>
                  {option}
                </span>
              </div>

              <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                {isMyAnswer && (
                  <span className={cn(
                    'px-2 py-0.5 rounded text-xs font-medium',
                    item.myCorrect ? 'bg-feedback-correct/30 text-feedback-correct' : 'bg-feedback-wrong/30 text-feedback-wrong'
                  )}>
                    {t('leaderboard.you')}
                  </span>
                )}
                {isOpponentAnswer && (
                  <span className={cn(
                    'px-2 py-0.5 rounded text-xs font-medium',
                    item.opponentCorrect ? 'bg-accent-purple/30 text-accent-purple' : 'bg-accent-gold/30 text-accent-gold'
                  )}>
                    {t('results.opponentShort')}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Explanation Toggle */}
      {item.explanation && (
        <div className="border-t border-white/10">
          <button
            onClick={() => setShowExplanation(!showExplanation)}
            className="w-full px-4 py-2 flex items-center justify-between text-sm text-accent-teal hover:bg-white/5 transition-colors"
          >
            <span className="font-medium">
              {showExplanation ? t('results.hideExplanation') : t('results.showExplanation')}
            </span>
            <motion.svg
              animate={{ rotate: showExplanation ? 180 : 0 }}
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </motion.svg>
          </button>

          <AnimatePresence>
            {showExplanation && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="px-4 pb-4">
                  <div className="bg-accent-purple/10 rounded-lg p-3 border border-accent-purple/20">
                    <p className="text-text-secondary text-sm leading-relaxed">
                      {item.explanation}
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  );
};

export const ReviewAnswersModal = ({ isOpen, onClose, questionHistory }: ReviewAnswersModalProps) => {
  const { t } = useTranslation();
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const correctCount = questionHistory.filter(q => q.myCorrect).length;
  const totalCount = questionHistory.length;
  const accuracy = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;

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
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
          onClick={onClose}
          role="presentation"
        >
          <motion.div
            ref={dialogRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            initial={{ y: 50, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 50, opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="w-full max-w-[min(92vw,42rem)] max-h-[min(calc(var(--tg-viewport-stable-height)-24px),760px)] bg-bg-card rounded-[clamp(16px,3.4vw,24px)] overflow-hidden shadow-2xl border border-white/10 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between flex-shrink-0">
              <div>
                <h2 id={titleId} className="font-display text-xl font-bold text-white">
                  {t('results.reviewAnswers')}
                </h2>
                <p className="text-text-secondary text-sm mt-0.5">
                  <span className={cn(
                    'font-semibold',
                    accuracy >= 70 ? 'text-feedback-correct' : accuracy >= 40 ? 'text-accent-gold' : 'text-feedback-wrong'
                  )}>
                    {t('results.correctCountLabel', { correct: correctCount, total: totalCount })}
                  </span>
                  {' '}&bull;{' '}
                  <span className="text-text-muted">{t('results.accuracyLabel', { accuracy })}</span>
                </p>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
                aria-label={t('common.close')}
              >
                <svg className="w-5 h-5 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Questions List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {questionHistory.length === 0 ? (
                <div className="text-center py-8 text-text-muted">
                  {t('results.noQuestionsToReview')}
                </div>
              ) : (
                questionHistory.map((item, index) => (
                  <QuestionCard key={index} item={item} index={index} />
                ))
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-white/10 flex-shrink-0">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={onClose}
                className="w-full py-3 rounded-xl bg-accent-teal text-white font-semibold hover:bg-accent-teal/90 transition-colors"
              >
                {t('common.close')}
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ReviewAnswersModal;
