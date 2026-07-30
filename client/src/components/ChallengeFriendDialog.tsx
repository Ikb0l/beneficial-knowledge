import { useId, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { Category } from '../shared/types/game';
import type { ChallengeFriendResult } from '../shared/types/challenge';
import { buildChallengeCategoryGroups, type ChallengeCategoryGroup } from '../lib/challengeCategories';
import { cn } from '../lib/utils/cn';
import { useDialog } from '../hooks/useDialog';
import { Avatar } from './ui';
import {
  ArrowLeftIcon,
  CheckIcon,
  ChevronRightIcon,
  GamepadIcon,
  SearchIcon,
  SparklesIcon,
  XIcon,
} from './ui/Icons';

export interface ChallengeFriendTarget {
  id: string;
  displayName: string;
  avatarUrl?: string;
}

interface ChallengeFriendDialogProps {
  target: ChallengeFriendTarget;
  categories: Category[];
  isLoadingCategories: boolean;
  preferredTopicId: string | null;
  onClose: () => void;
  onSubmit: (categoryId: string) => Promise<ChallengeFriendResult>;
}

type PickerStep = 'category' | 'topic';

const GROUP_ACCENTS = [
  {
    bar: 'bg-cyan-300',
    surface: 'border-cyan-300/25 bg-cyan-400/[0.08] hover:border-cyan-200/55 hover:bg-cyan-400/[0.14]',
    edge: 'border-l-cyan-300',
    icon: 'border-cyan-200/35 bg-cyan-300 text-[#07131d]',
    count: 'text-cyan-200',
    number: 'border-cyan-300/25 bg-cyan-300/10 text-cyan-100',
    selected: 'border-cyan-200/70 bg-cyan-400/[0.16] shadow-[0_12px_28px_rgba(34,211,238,0.16)]',
    mark: 'bg-cyan-300 text-[#07131d]',
    shadow: 'shadow-[0_12px_28px_rgba(34,211,238,0.1)]',
  },
  {
    bar: 'bg-amber-300',
    surface: 'border-amber-300/25 bg-amber-400/[0.08] hover:border-amber-200/55 hover:bg-amber-400/[0.14]',
    edge: 'border-l-amber-300',
    icon: 'border-amber-200/35 bg-amber-300 text-[#211503]',
    count: 'text-amber-200',
    number: 'border-amber-300/25 bg-amber-300/10 text-amber-100',
    selected: 'border-amber-200/70 bg-amber-400/[0.16] shadow-[0_12px_28px_rgba(252,211,77,0.14)]',
    mark: 'bg-amber-300 text-[#211503]',
    shadow: 'shadow-[0_12px_28px_rgba(252,211,77,0.09)]',
  },
  {
    bar: 'bg-emerald-300',
    surface: 'border-emerald-300/25 bg-emerald-400/[0.08] hover:border-emerald-200/55 hover:bg-emerald-400/[0.14]',
    edge: 'border-l-emerald-300',
    icon: 'border-emerald-200/35 bg-emerald-300 text-[#061b13]',
    count: 'text-emerald-200',
    number: 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100',
    selected: 'border-emerald-200/70 bg-emerald-400/[0.16] shadow-[0_12px_28px_rgba(110,231,183,0.14)]',
    mark: 'bg-emerald-300 text-[#061b13]',
    shadow: 'shadow-[0_12px_28px_rgba(110,231,183,0.09)]',
  },
  {
    bar: 'bg-rose-300',
    surface: 'border-rose-300/25 bg-rose-400/[0.08] hover:border-rose-200/55 hover:bg-rose-400/[0.14]',
    edge: 'border-l-rose-300',
    icon: 'border-rose-200/35 bg-rose-300 text-[#210a11]',
    count: 'text-rose-200',
    number: 'border-rose-300/25 bg-rose-300/10 text-rose-100',
    selected: 'border-rose-200/70 bg-rose-400/[0.16] shadow-[0_12px_28px_rgba(253,164,175,0.14)]',
    mark: 'bg-rose-300 text-[#210a11]',
    shadow: 'shadow-[0_12px_28px_rgba(253,164,175,0.09)]',
  },
  {
    bar: 'bg-violet-300',
    surface: 'border-violet-300/25 bg-violet-400/[0.08] hover:border-violet-200/55 hover:bg-violet-400/[0.14]',
    edge: 'border-l-violet-300',
    icon: 'border-violet-200/35 bg-violet-300 text-[#160d29]',
    count: 'text-violet-200',
    number: 'border-violet-300/25 bg-violet-300/10 text-violet-100',
    selected: 'border-violet-200/70 bg-violet-400/[0.16] shadow-[0_12px_28px_rgba(196,181,253,0.14)]',
    mark: 'bg-violet-300 text-[#160d29]',
    shadow: 'shadow-[0_12px_28px_rgba(196,181,253,0.09)]',
  },
] as const;

function stableIndex(value: string, length: number): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = value.charCodeAt(index) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % length;
}

function getGroupAccent(id: string) {
  return GROUP_ACCENTS[stableIndex(id, GROUP_ACCENTS.length)];
}

function CategoryGlyph({ category }: { category: Category }) {
  if (category.iconUrl) {
    return <img src={category.iconUrl} alt="" className="h-7 w-7 object-contain" />;
  }
  if (category.icon) {
    return <span className="text-xl leading-none" aria-hidden="true">{category.icon}</span>;
  }
  return <GamepadIcon size={22} />;
}

export function ChallengeFriendDialog({
  target,
  categories,
  isLoadingCategories,
  preferredTopicId,
  onClose,
  onSubmit,
}: ChallengeFriendDialogProps) {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  const titleId = useId();
  const searchId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const groups = useMemo(() => buildChallengeCategoryGroups(categories), [categories]);

  const [step, setStep] = useState<PickerStep>('category');
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useDialog({
    open: true,
    onClose: () => {
      if (!isSubmitting) onClose();
    },
    dialogRef,
    initialFocusRef: closeButtonRef,
  });

  const preferredGroup = preferredTopicId
    ? groups.find((group) => group.topics.some((topic) => topic.id === preferredTopicId))
    : undefined;
  const activeGroup = groups.find((group) => group.id === activeGroupId) || preferredGroup || groups[0] || null;
  const activeAccent = activeGroup ? getGroupAccent(activeGroup.id) : GROUP_ACCENTS[0];
  const activeStep: PickerStep = groups.length === 1 && activeGroup ? 'topic' : step;
  const effectiveTopicId = activeGroup?.topics.some((topic) => topic.id === selectedTopicId)
    ? selectedTopicId
    : preferredTopicId && activeGroup?.topics.some((topic) => topic.id === preferredTopicId)
      ? preferredTopicId
      : activeGroup?.topics.length === 1
        ? activeGroup.topics[0].id
        : null;

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const visibleTopics = !activeGroup
    ? []
    : normalizedQuery
      ? activeGroup.topics.filter((topic) => topic.name.toLowerCase().includes(normalizedQuery))
      : activeGroup.topics;
  const selectedTopic = categories.find((category) => category.id === effectiveTopicId) || null;

  const openGroup = (group: ChallengeCategoryGroup) => {
    setActiveGroupId(group.id);
    setSelectedTopicId((current) => (
      current && group.topics.some((topic) => topic.id === current)
        ? current
        : group.topics.length === 1
          ? group.topics[0].id
          : null
    ));
    setSearchQuery('');
    setSubmitError(null);
    setStep('topic');
  };

  const backToCategories = () => {
    setSearchQuery('');
    setSubmitError(null);
    setStep('category');
  };

  const handleSubmit = async () => {
    if (!effectiveTopicId || isSubmitting) return;
    setIsSubmitting(true);
    setSubmitError(null);
    const result = await onSubmit(effectiveTopicId);
    if (!result.ok) {
      setSubmitError(result.message);
      setIsSubmitting(false);
    }
  };

  const closeDialog = () => {
    if (!isSubmitting) onClose();
  };

  const title = activeStep === 'category'
    ? t('challenge.chooseCategory', 'Choose a category')
    : t('challenge.chooseTopic', 'Choose a topic');

  return (
    <motion.div
      className="fixed inset-0 z-[60] bg-[#08111f] text-white"
      initial={reducedMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={reducedMotion ? undefined : { opacity: 0 }}
      role="presentation"
    >
      <motion.div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex h-viewport w-full flex-col overflow-hidden"
        initial={reducedMotion ? false : { y: 20 }}
        animate={{ y: 0 }}
        exit={reducedMotion ? undefined : { y: 14 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
      >
        <header className="shrink-0 border-b border-white/10 bg-[#0b1730]">
          <div className="flex h-1.5" aria-hidden="true">
            <span className="flex-1 bg-cyan-300" />
            <span className="flex-1 bg-violet-300" />
            <span className="flex-1 bg-amber-300" />
            <span className="flex-1 bg-emerald-300" />
            <span className="flex-1 bg-rose-300" />
          </div>
          <div className="px-4 pb-4 pt-[max(12px,env(safe-area-inset-top))]">
          <div className="mx-auto flex w-full max-w-3xl items-center gap-3">
            {activeStep === 'topic' && groups.length > 1 ? (
              <button
                type="button"
                onClick={backToCategories}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-cyan-200/30 bg-cyan-400/10 text-cyan-100 shadow-[0_8px_18px_rgba(34,211,238,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200"
                aria-label={t('common.back', 'Back')}
              >
                <ArrowLeftIcon size={19} />
              </button>
            ) : (
              <span className="rounded-lg border border-violet-200/30 bg-violet-400/10 p-1 shadow-[0_8px_18px_rgba(196,181,253,0.12)]">
                <Avatar src={target.avatarUrl} name={target.displayName} size="lg" showGlow={false} />
              </span>
            )}

            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 truncate text-xs font-semibold uppercase tracking-[0.12em] text-cyan-200">
                <SparklesIcon size={14} className="shrink-0" />
                {t('challenge.challengePlayer', 'Challenge {{name}}', { name: target.displayName })}
              </p>
              <h2 id={titleId} className="mt-1 text-xl font-bold leading-tight text-white sm:text-2xl">
                {title}
              </h2>
            </div>

            <button
              ref={closeButtonRef}
              type="button"
              onClick={closeDialog}
              disabled={isSubmitting}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-white transition-colors hover:border-rose-200/35 hover:bg-rose-400/10 hover:text-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label={t('common.close', 'Close')}
            >
              <XIcon size={19} />
            </button>
          </div>

          <div className="mx-auto mt-4 grid w-full max-w-3xl grid-cols-2 gap-2" aria-label={t('challenge.selectionProgress', 'Selection progress')}>
            <div className={cn(
              'flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold',
              activeStep === 'category'
                ? 'border-cyan-200/50 bg-cyan-400/15 text-cyan-100'
                : 'border-cyan-300/20 bg-cyan-400/[0.07] text-cyan-200/75'
            )}>
              <span className={cn(
                'inline-flex h-6 w-6 items-center justify-center rounded-md text-xs font-black',
                activeStep === 'category' ? 'bg-cyan-300 text-[#07131d]' : 'bg-cyan-300/15 text-cyan-200'
              )}>1</span>
              <span className="truncate">{t('challenge.categories', 'Categories')}</span>
            </div>
            <div className={cn(
              'flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold',
              activeStep === 'topic'
                ? 'border-amber-200/50 bg-amber-400/15 text-amber-100'
                : 'border-white/10 bg-white/[0.03] text-white/45'
            )}>
              <span className={cn(
                'inline-flex h-6 w-6 items-center justify-center rounded-md text-xs font-black',
                activeStep === 'topic' ? 'bg-amber-300 text-[#211503]' : 'bg-white/10 text-white/55'
              )}>2</span>
              <span className="truncate">{t('challenge.topics', 'Topics')}</span>
            </div>
          </div>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-hidden">
          {isLoadingCategories ? (
            <div className="flex h-full items-center justify-center px-6" role="status">
              <div className="text-center">
                <span className="mx-auto block h-9 w-9 animate-spin rounded-full border-2 border-white/20 border-t-accent-teal" aria-hidden="true" />
                <p className="mt-3 text-sm text-text-secondary">{t('challenge.loadingTopics', 'Loading topics...')}</p>
              </div>
            </div>
          ) : groups.length === 0 ? (
            <div className="flex h-full items-center justify-center px-6">
              <p className="text-center text-sm text-text-secondary">{t('challenge.noTopics', 'No topics are available right now.')}</p>
            </div>
          ) : activeStep === 'category' ? (
            <section
              className="h-full overflow-y-auto overscroll-contain bg-[#08111f] px-4 py-4 scrollbar-hide"
              aria-label={t('challenge.categories', 'Categories')}
            >
              <div className="mx-auto grid w-full max-w-3xl grid-cols-1 gap-3 min-[360px]:grid-cols-2 sm:grid-cols-3">
                {groups.map((group, index) => {
                  const accent = getGroupAccent(group.id);
                  const topicLabel = group.topics.length === 1
                    ? t('challenge.oneTopic', '1 topic')
                    : t('challenge.topicCount', '{{count}} topics', { count: group.topics.length });
                  return (
                    <motion.button
                      key={group.id}
                      type="button"
                      onClick={() => openGroup(group)}
                      aria-label={`${group.category.name}, ${topicLabel}`}
                      whileHover={reducedMotion ? undefined : { y: -2 }}
                      whileTap={reducedMotion ? undefined : { scale: 0.98 }}
                      className={cn(
                        'relative flex min-h-36 w-full flex-col overflow-hidden rounded-lg border p-3 text-left transition-colors',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200',
                        accent.surface,
                        accent.shadow
                      )}
                    >
                      <span className={cn('absolute inset-x-0 top-0 h-1', accent.bar)} aria-hidden="true" />
                      <span className="flex w-full items-start justify-between pt-1">
                        <span className={cn('inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border shadow-sm', accent.icon)}>
                          <CategoryGlyph category={group.category} />
                        </span>
                        <span className={cn('rounded-md border px-2 py-1 font-mono text-[0.65rem] font-bold', accent.number)} aria-hidden="true">
                          {String(index + 1).padStart(2, '0')}
                        </span>
                      </span>
                      <span className="mt-3 block break-words text-sm font-bold leading-snug text-white sm:text-base">
                        {group.category.name}
                      </span>
                      <span className="mt-auto flex w-full items-center justify-between gap-2 pt-3">
                        <span className={cn('text-xs font-bold', accent.count)}>{topicLabel}</span>
                        <span className={cn('inline-flex h-7 w-7 items-center justify-center rounded-md border', accent.number)}>
                          <ChevronRightIcon size={15} />
                        </span>
                      </span>
                    </motion.button>
                  );
                })}
              </div>
            </section>
          ) : activeGroup ? (
            <div className="flex h-full min-h-0 flex-col">
              <div className="shrink-0 border-b border-white/10 bg-[#0a1428] px-4 py-3">
                <div className="mx-auto w-full max-w-3xl">
                  <div className={cn('flex items-center gap-3 rounded-lg border p-3', activeAccent.surface)}>
                    <span className={cn('inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border', activeAccent.icon)}>
                      <CategoryGlyph category={activeGroup.category} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={cn('text-[0.68rem] font-bold uppercase tracking-[0.12em]', activeAccent.count)}>
                        {t('challenge.chooseTopic', 'Choose a topic')}
                      </p>
                      <p className="mt-0.5 break-words text-sm font-bold text-white">{activeGroup.category.name}</p>
                      <p className="mt-1 truncate text-xs text-slate-300">
                        {selectedTopic ? t('challenge.selectedTopic', 'Selected: {{name}}', { name: selectedTopic.name }) : t('challenge.selectOneTopic', 'Select one topic')}
                      </p>
                    </div>
                    <span className={cn('rounded-md border px-2 py-1 text-xs font-bold', activeAccent.number)}>
                      {activeGroup.topics.length}
                    </span>
                  </div>

                  {activeGroup.topics.length > 8 && (
                    <div className="relative mt-3">
                      <label htmlFor={searchId} className="sr-only">{t('challenge.searchTopics', 'Search topics')}</label>
                      <SearchIcon size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-cyan-200" />
                      <input
                        id={searchId}
                        type="search"
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        placeholder={t('challenge.searchTopics', 'Search topics')}
                        className="h-11 w-full rounded-lg border border-cyan-300/25 bg-cyan-400/[0.07] pl-10 pr-3 text-sm text-white placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200"
                      />
                    </div>
                  )}
                </div>
              </div>

              <section
                className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[#08111f] px-4 py-3 scrollbar-hide"
                aria-label={t('challenge.topics', 'Topics')}
              >
                <div className="mx-auto w-full max-w-3xl space-y-2">
                  {visibleTopics.length === 0 ? (
                    <p className="py-12 text-center text-sm text-text-secondary">
                      {t('challenge.noTopicResults', 'No topics match your search.')}
                    </p>
                  ) : (
                    visibleTopics.map((topic) => {
                      const selected = effectiveTopicId === topic.id;
                      const accent = getGroupAccent(topic.id);
                      return (
                        <motion.button
                          key={topic.id}
                          type="button"
                          onClick={() => {
                            setSelectedTopicId(topic.id);
                            setSubmitError(null);
                          }}
                          aria-pressed={selected}
                          whileTap={reducedMotion ? undefined : { scale: 0.99 }}
                          className={cn(
                            'flex min-h-16 w-full items-center gap-3 rounded-lg border border-l-4 px-3 py-3 text-left',
                            'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200',
                            accent.edge,
                            selected
                              ? accent.selected
                              : accent.surface
                          )}
                        >
                          <span className={cn('inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border', accent.icon)}>
                            <CategoryGlyph category={topic} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block break-words text-sm font-semibold leading-snug text-white">{topic.name}</span>
                            {(topic.questionsPerMatch || topic.timePerQuestion) && (
                              <span className="mt-1 block text-xs text-slate-300">
                                {topic.questionsPerMatch ? t('challenge.questionCount', '{{count}} questions', { count: topic.questionsPerMatch }) : ''}
                                {topic.questionsPerMatch && topic.timePerQuestion ? ' / ' : ''}
                                {topic.timePerQuestion ? t('challenge.secondsPerQuestion', '{{count}}s each', { count: topic.timePerQuestion }) : ''}
                              </span>
                            )}
                          </span>
                          <span className={cn(
                            'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border',
                            selected ? cn(accent.mark, 'border-transparent') : 'border-white/20 bg-white/5 text-transparent'
                          )} aria-hidden="true">
                            <CheckIcon size={17} />
                          </span>
                        </motion.button>
                      );
                    })
                  )}
                </div>
              </section>
            </div>
          ) : null}
        </main>

        <footer className="shrink-0 border-t border-white/10 bg-[#0b1730] px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3">
          <div className="mx-auto w-full max-w-3xl">
            {submitError && (
              <p className="mb-2 rounded-lg border border-error/40 bg-error/10 px-3 py-2 text-sm text-red-200" role="alert" aria-live="polite">
                {submitError}
              </p>
            )}
            {selectedTopic && !submitError && (
              <div className="mb-3 flex items-center gap-3 rounded-lg border border-emerald-300/25 bg-emerald-400/[0.08] px-3 py-2">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-300 text-[#061b13]">
                  <CheckIcon size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[0.65rem] font-bold uppercase tracking-[0.12em] text-emerald-200">
                    {t('challenge.selected', 'Selected')}
                  </p>
                  <p className="truncate text-sm font-bold text-white">{selectedTopic.name}</p>
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={activeStep !== 'topic' || !effectiveTopicId || isSubmitting || isLoadingCategories}
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border border-cyan-100/60 bg-cyan-300 px-5 py-3 text-base font-black text-[#07131d] shadow-[0_12px_28px_rgba(34,211,238,0.24)] transition-colors hover:bg-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/10 disabled:text-white/35 disabled:shadow-none"
            >
              <GamepadIcon size={20} />
              {isSubmitting ? t('challenge.sending', 'Sending...') : t('challenge.send', 'Send challenge')}
            </button>
          </div>
        </footer>
      </motion.div>
    </motion.div>
  );
}

export default ChallengeFriendDialog;
