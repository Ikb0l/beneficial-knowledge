import { useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { Category } from '../shared/types/game';
import {
  ArrowLeftIcon,
  BookIcon,
  GlobeIcon,
  ScrollIcon,
  SparklesIcon,
  XIcon,
} from './ui/Icons';
import { cn } from '../lib/utils/cn';
import { useDialog } from '../hooks/useDialog';

interface PlayMatchModalProps {
  open: boolean;
  categories: Category[];
  isLoadingCategories?: boolean;
  categoriesError?: string | null;
  selectedParentCategoryId?: string | null;
  selectedSubcategoryIds?: string[];
  selectedAllInCategory?: boolean;
  selectedMode?: MatchMode;
  onRetryLoad?: () => void;
  onClose: () => void;
  onConfirm: (selection: { parentCategory: string; subcategories: string[]; allInCategory: boolean; mode: MatchMode }) => void;
}

interface DisplayCategory {
  id: string;
  name: string;
  icon: ReactNode;
  parentId?: string | null;
  questionsPerMatch?: number;
  timePerQuestion?: number;
}

type PickerStep = 'category' | 'subcategories';
type MatchMode = 'ranked' | 'practice';

type TilePalette = {
  background: string;
  text: string;
  iconWrap: string;
  shadow: string;
  blobOne: string;
  blobTwo: string;
};

const SHEET_VARIANTS = {
  initial: { y: 28, opacity: 0 },
  animate: { y: 0, opacity: 1, transition: { type: 'spring', stiffness: 300, damping: 30 } },
  exit: { y: 18, opacity: 0, transition: { duration: 0.18 } },
} as const;

const PANEL_VARIANTS = {
  enter: (direction: 1 | -1) => ({ opacity: 0, x: direction > 0 ? 22 : -22 }),
  center: { opacity: 1, x: 0, transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] } },
  exit: (direction: 1 | -1) => ({
    opacity: 0,
    x: direction > 0 ? -18 : 18,
    transition: { duration: 0.16, ease: [0.4, 0, 1, 1] },
  }),
} as const;

const CATEGORY_PALETTES: TilePalette[] = [
  {
    background: 'linear-gradient(140deg, #fde68a 0%, #f59e0b 100%)',
    text: '#422006',
    iconWrap: 'bg-white/30 text-amber-950',
    shadow: 'shadow-[0_18px_40px_rgba(245,158,11,0.28)]',
    blobOne: 'bg-white/28',
    blobTwo: 'bg-amber-950/12',
  },
  {
    background: 'linear-gradient(145deg, #86efac 0%, #22c55e 100%)',
    text: '#052e16',
    iconWrap: 'bg-white/28 text-green-950',
    shadow: 'shadow-[0_18px_40px_rgba(34,197,94,0.25)]',
    blobOne: 'bg-white/24',
    blobTwo: 'bg-green-950/10',
  },
  {
    background: 'linear-gradient(145deg, #93c5fd 0%, #3b82f6 100%)',
    text: '#172554',
    iconWrap: 'bg-white/28 text-blue-950',
    shadow: 'shadow-[0_18px_40px_rgba(59,130,246,0.28)]',
    blobOne: 'bg-white/26',
    blobTwo: 'bg-blue-950/12',
  },
  {
    background: 'linear-gradient(145deg, #f9a8d4 0%, #ec4899 100%)',
    text: '#500724',
    iconWrap: 'bg-white/28 text-pink-950',
    shadow: 'shadow-[0_18px_40px_rgba(236,72,153,0.25)]',
    blobOne: 'bg-white/24',
    blobTwo: 'bg-pink-950/10',
  },
  {
    background: 'linear-gradient(145deg, #c4b5fd 0%, #8b5cf6 100%)',
    text: '#2e1065',
    iconWrap: 'bg-white/28 text-violet-950',
    shadow: 'shadow-[0_18px_40px_rgba(139,92,246,0.25)]',
    blobOne: 'bg-white/24',
    blobTwo: 'bg-violet-950/10',
  },
  {
    background: 'linear-gradient(145deg, #67e8f9 0%, #06b6d4 100%)',
    text: '#083344',
    iconWrap: 'bg-white/28 text-cyan-950',
    shadow: 'shadow-[0_18px_40px_rgba(6,182,212,0.25)]',
    blobOne: 'bg-white/24',
    blobTwo: 'bg-cyan-950/10',
  },
];

function getPalette(key: string): TilePalette {
  let hash = 0;
  for (let index = 0; index < key.length; index++) {
    hash = ((hash << 5) - hash + key.charCodeAt(index)) | 0;
  }
  return CATEGORY_PALETTES[Math.abs(hash) % CATEGORY_PALETTES.length];
}

function formatModeLabel(mode: MatchMode, t: ReturnType<typeof useTranslation>['t']): string {
  return mode === 'practice' ? t('search.modePractice', 'Practice') : t('search.modeRanked', 'Ranked');
}

function ModeSwitch({
  mode,
  onChange,
  t,
}: {
  mode: MatchMode;
  onChange: (mode: MatchMode) => void;
  t: ReturnType<typeof useTranslation>['t'];
}) {
  return (
    <div className="inline-flex rounded-full border border-white/10 bg-white/8 p-1 shadow-[0_14px_30px_rgba(2,12,27,0.28)] backdrop-blur-xl">
      {(['ranked', 'practice'] as const).map((candidate) => {
        const active = candidate === mode;
        return (
          <button
            key={candidate}
            type="button"
            onClick={() => onChange(candidate)}
            className={cn(
              'rounded-full px-5 py-2.5 text-base font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400',
              active ? 'bg-white text-slate-950 shadow-[0_10px_22px_rgba(255,255,255,0.14)]' : 'text-slate-300 hover:text-white'
            )}
          >
            {formatModeLabel(candidate, t)}
          </button>
        );
      })}
    </div>
  );
}

function CategoryTile({
  icon,
  name,
  palette,
  selected = false,
  onClick,
}: {
  icon: ReactNode;
  name: string;
  palette: TilePalette;
  selected?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group relative flex min-h-[168px] flex-col overflow-hidden rounded-[30px] p-4 text-left transition-transform duration-150',
        'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/65',
        palette.shadow,
        selected ? 'ring-4 ring-white/85 shadow-[0_0_0_1px_rgba(255,255,255,0.38),0_26px_50px_rgba(2,12,27,0.42)]' : 'hover:-translate-y-0.5'
      )}
      style={{ background: palette.background, color: palette.text }}
    >
      {selected && (
        <span className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-950/88 text-sm font-black text-white shadow-[0_10px_18px_rgba(2,12,27,0.26)]">
          ✓
        </span>
      )}
      <span className={cn('absolute -right-4 top-3 h-20 w-20 rounded-[38%_62%_59%_41%/42%_35%_65%_58%]', palette.blobOne)} />
      <span className={cn('absolute -bottom-5 -left-3 h-24 w-24 rounded-full', palette.blobTwo)} />
      <span className={cn('relative inline-flex h-14 w-14 items-center justify-center rounded-[22px] backdrop-blur-sm', palette.iconWrap)}>
        {icon}
      </span>
      <span className="relative mt-auto block text-xl font-black leading-[1.05] tracking-[-0.02em]">
        {name}
      </span>
    </button>
  );
}

function TopicTile({
  icon,
  name,
  palette,
  selected = false,
  onClick,
}: {
  icon: ReactNode;
  name: string;
  palette: TilePalette;
  selected?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative flex min-h-[118px] flex-col overflow-hidden rounded-[24px] p-3.5 text-left transition-transform duration-150',
        'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/65',
        palette.shadow,
        selected ? 'ring-4 ring-white/85 shadow-[0_0_0_1px_rgba(255,255,255,0.34),0_20px_42px_rgba(2,12,27,0.34)]' : 'hover:-translate-y-0.5'
      )}
      style={{ background: palette.background, color: palette.text }}
    >
      {selected && (
        <span className="absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-950/88 text-xs font-black text-white shadow-[0_10px_18px_rgba(2,12,27,0.26)]">
          ✓
        </span>
      )}
      <span className={cn('absolute -right-3 top-2 h-14 w-14 rounded-[35%_65%_57%_43%/43%_39%_61%_57%]', palette.blobOne)} />
      <span className={cn('relative inline-flex h-11 w-11 items-center justify-center rounded-[18px] backdrop-blur-sm', palette.iconWrap)}>
        {icon}
      </span>
      <span className="relative mt-auto block text-[15px] font-bold leading-tight">
        {name}
      </span>
    </button>
  );
}

export function PlayMatchModal({
  open,
  categories,
  isLoadingCategories = false,
  categoriesError = null,
  selectedParentCategoryId,
  selectedSubcategoryIds,
  selectedAllInCategory = true,
  selectedMode = 'ranked',
  onRetryLoad,
  onClose,
  onConfirm,
}: PlayMatchModalProps) {
  const fallbackIconNodes = useMemo(
    () => [
      <ScrollIcon key="scroll" size={24} />,
      <BookIcon key="book" size={24} />,
      <GlobeIcon key="globe" size={24} />,
      <SparklesIcon key="sparkles" size={24} />,
    ],
    []
  );

  const displayCategories = useMemo<DisplayCategory[]>(() => {
    if (categories.length === 0) return [];
    return categories.map((category, index) => ({
      id: category.id,
      name: category.name,
      icon: category.icon
        ? <span className="text-[22px] leading-none">{category.icon}</span>
        : fallbackIconNodes[index % fallbackIconNodes.length],
      parentId: category.parentId ?? null,
      questionsPerMatch: category.questionsPerMatch,
      timePerQuestion: category.timePerQuestion,
    }));
  }, [categories, fallbackIconNodes]);

  const parentCategories = useMemo(() => {
    const parents = displayCategories.filter((category) => category.parentId == null);
    return parents.length > 0 ? parents : displayCategories;
  }, [displayCategories]);

  const childrenByParent = useMemo(() => {
    const map: Record<string, DisplayCategory[]> = {};
    for (const parent of parentCategories) {
      map[parent.id] = [];
    }
    for (const category of displayCategories) {
      if (category.parentId && map[category.parentId]) {
        map[category.parentId].push(category);
      }
    }
    return map;
  }, [displayCategories, parentCategories]);

  const initialParentId = selectedParentCategoryId && parentCategories.some((item) => item.id === selectedParentCategoryId)
    ? selectedParentCategoryId
    : parentCategories[0]?.id ?? null;

  const initialSubIds = initialParentId
    ? (selectedSubcategoryIds || []).filter((subId) => (
      displayCategories.some((item) => item.id === subId && item.parentId === initialParentId)
    ))
    : [];

  const initialAllInCategory = selectedAllInCategory || initialSubIds.length === 0;

  return (
    <AnimatePresence>
      {open && (
        <PlayMatchModalDialog
          key={`${initialParentId ?? 'none'}:${initialSubIds.join(',')}:${initialAllInCategory ? 'all' : 'some'}:${selectedMode}`}
          parentCategories={parentCategories}
          childrenByParent={childrenByParent}
          isLoadingCategories={isLoadingCategories}
          categoriesError={categoriesError}
          initialSelectedParentId={initialParentId}
          initialSelectedSubIds={initialSubIds}
          initialAllInCategory={initialAllInCategory}
          initialSelectedMode={selectedMode}
          onRetryLoad={onRetryLoad}
          onClose={onClose}
          onConfirm={onConfirm}
        />
      )}
    </AnimatePresence>
  );
}

function PlayMatchModalDialog({
  parentCategories,
  childrenByParent,
  isLoadingCategories,
  categoriesError,
  initialSelectedParentId,
  initialSelectedSubIds,
  initialAllInCategory,
  initialSelectedMode,
  onRetryLoad,
  onClose,
  onConfirm,
}: {
  parentCategories: DisplayCategory[];
  childrenByParent: Record<string, DisplayCategory[]>;
  isLoadingCategories: boolean;
  categoriesError: string | null;
  initialSelectedParentId: string | null;
  initialSelectedSubIds: string[];
  initialAllInCategory: boolean;
  initialSelectedMode: MatchMode;
  onRetryLoad?: () => void;
  onClose: () => void;
  onConfirm: (selection: { parentCategory: string; subcategories: string[]; allInCategory: boolean; mode: MatchMode }) => void;
}) {
  const titleId = useId();
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const [step, setStep] = useState<PickerStep>('category');
  const [activeParentId, setActiveParentId] = useState<string | null>(() => initialSelectedParentId ?? parentCategories[0]?.id ?? null);
  const [selectedSubIds, setSelectedSubIds] = useState<Set<string>>(() => new Set(initialSelectedSubIds));
  const [allInCategory, setAllInCategory] = useState(initialAllInCategory);
  const [matchMode, setMatchMode] = useState<MatchMode>(initialSelectedMode);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [stepDirection, setStepDirection] = useState<1 | -1>(1);
  useDialog({
    open: true,
    onClose,
    dialogRef,
    initialFocusRef: closeButtonRef,
  });

  const hasCategories = parentCategories.length > 0;
  const currentStep: PickerStep = hasCategories ? step : 'category';

  const resolvedActiveParentId = useMemo(() => {
    if (activeParentId && parentCategories.some((item) => item.id === activeParentId)) {
      return activeParentId;
    }
    return parentCategories[0]?.id ?? null;
  }, [activeParentId, parentCategories]);

  const activeParent = useMemo(
    () => (resolvedActiveParentId ? parentCategories.find((item) => item.id === resolvedActiveParentId) ?? null : null),
    [resolvedActiveParentId, parentCategories]
  );

  const activeSubcategories = useMemo(
    () => (resolvedActiveParentId ? childrenByParent[resolvedActiveParentId] ?? [] : []),
    [childrenByParent, resolvedActiveParentId]
  );

  const filteredParentCategories = useMemo(() => {
    return parentCategories;
  }, [parentCategories]);

  const filteredSubcategories = useMemo(() => {
    return activeSubcategories;
  }, [activeSubcategories]);

  const selectedSubIdsForActiveParent = useMemo(() => {
    if (!resolvedActiveParentId || activeSubcategories.length === 0) {
      return new Set<string>();
    }
    const validIds = new Set(activeSubcategories.map((subcategory) => subcategory.id));
    return new Set(Array.from(selectedSubIds).filter((subId) => validIds.has(subId)));
  }, [activeSubcategories, resolvedActiveParentId, selectedSubIds]);

  const effectiveAllInCategory = !resolvedActiveParentId || allInCategory || selectedSubIdsForActiveParent.size === 0;
  const canSubmit = currentStep === 'subcategories'
    && !!resolvedActiveParentId
    && !isSubmitting
    && (effectiveAllInCategory || selectedSubIdsForActiveParent.size > 0);

  const showLoadingState = !hasCategories && isLoadingCategories;
  const showErrorState = !hasCategories && !isLoadingCategories && !!categoriesError;
  const showEmptyState = !hasCategories && !isLoadingCategories && !categoriesError;

  const panelKey = showLoadingState
    ? 'loading'
    : showErrorState
      ? 'error'
      : showEmptyState
        ? 'empty'
        : currentStep === 'category'
          ? 'category'
          : `subcategories:${resolvedActiveParentId ?? 'none'}`;

  const openSubcategorySheet = (parentId: string) => {
    const switchingParent = parentId !== resolvedActiveParentId;
    setStepDirection(1);
    setStep('subcategories');
    setActiveParentId(parentId);
    setIsSubmitting(false);
    if (switchingParent) {
      setSelectedSubIds(new Set());
      setAllInCategory(true);
    }
  };

  const backToCategories = () => {
    setStepDirection(-1);
    setStep('category');
    setIsSubmitting(false);
  };

  const applyAllSelection = () => {
    setAllInCategory(true);
    setSelectedSubIds(new Set());
    setIsSubmitting(false);
  };

  const toggleSubSelection = (subId: string) => {
    if (!resolvedActiveParentId) return;
    setAllInCategory(false);
    setIsSubmitting(false);
    setSelectedSubIds((prev) => {
      const next = new Set(prev);
      if (next.has(subId)) {
        next.delete(subId);
      } else {
        next.add(subId);
      }
      return next;
    });
  };

  const handleReady = () => {
    if (!canSubmit || !resolvedActiveParentId) return;
    setIsSubmitting(true);
    onConfirm({
      parentCategory: resolvedActiveParentId,
      subcategories: effectiveAllInCategory ? [] : Array.from(selectedSubIdsForActiveParent).sort(),
      allInCategory: effectiveAllInCategory,
      mode: matchMode,
    });
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-[10px]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      role="presentation"
    >
      <motion.div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="absolute inset-0 flex h-viewport w-full flex-col overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(250,204,21,0.12),transparent_32%),radial-gradient(circle_at_top_right,rgba(59,130,246,0.16),transparent_26%),linear-gradient(180deg,#071321_0%,#0b1730_48%,#08111f_100%)] text-white"
        variants={SHEET_VARIANTS}
        initial="initial"
        animate="animate"
        exit="exit"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-[radial-gradient(circle_at_top_left,rgba(250,204,21,0.16),transparent_42%),radial-gradient(circle_at_top_right,rgba(59,130,246,0.18),transparent_38%),radial-gradient(circle_at_center,rgba(236,72,153,0.12),transparent_36%)]" />

        <header className="relative shrink-0 px-4 pb-4 pt-[max(14px,env(safe-area-inset-top))] sm:px-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              {currentStep === 'subcategories' && hasCategories && (
                <button
                  type="button"
                  onClick={backToCategories}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/8 text-white shadow-[0_12px_24px_rgba(2,12,27,0.22)] transition-colors hover:bg-white/12 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-200/40"
                  aria-label={t('common.back', 'Back')}
                >
                  <ArrowLeftIcon size={18} />
                </button>
              )}
              <h2 id={titleId} className="mt-3 text-[28px] font-black tracking-[-0.04em] text-white">
                {currentStep === 'subcategories'
                  ? t('search.chooseSubcategory', 'Choose Topics')
                  : t('search.chooseCategory', 'Choose Category')}
              </h2>
            </div>

            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/8 text-white shadow-[0_12px_24px_rgba(2,12,27,0.22)] transition-colors hover:bg-white/12 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-200/40"
              aria-label={t('common.close')}
            >
              <XIcon size={18} />
            </button>
          </div>

          <div className="mt-4 flex items-center justify-center">
            <ModeSwitch mode={matchMode} onChange={setMatchMode} t={t} />
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto px-4 pb-4 sm:px-5">
            <AnimatePresence mode="wait" initial={false} custom={stepDirection}>
              <motion.div
                key={panelKey}
                custom={stepDirection}
                variants={PANEL_VARIANTS}
                initial="enter"
                animate="center"
                exit="exit"
                className="space-y-4"
              >
                {showLoadingState ? (
                  <div className="rounded-[30px] border border-white/10 bg-white/6 px-5 py-16 text-center shadow-[0_18px_40px_rgba(2,12,27,0.24)]">
                    <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-sky-500" aria-hidden="true" />
                  </div>
                ) : showErrorState ? (
                  <div className="rounded-[30px] border border-white/10 bg-white/6 px-5 py-12 text-center shadow-[0_18px_40px_rgba(2,12,27,0.24)]">
                    <p className="text-base font-semibold text-white">
                      {t('search.noCategoriesLoadError', 'Could not load categories')}
                    </p>
                    {onRetryLoad && (
                      <button
                        type="button"
                        onClick={onRetryLoad}
                        className="mt-4 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-slate-950 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-200/40"
                      >
                        {t('common.retry', 'Retry')}
                      </button>
                    )}
                  </div>
                ) : showEmptyState ? (
                  <div className="rounded-[30px] border border-white/10 bg-white/6 px-5 py-12 text-center shadow-[0_18px_40px_rgba(2,12,27,0.24)]">
                    <p className="text-base font-semibold text-white">
                      {t('search.noCategoriesAvailable', 'No categories available')}
                    </p>
                  </div>
                ) : currentStep === 'category' ? (
                  <>
                    {filteredParentCategories.length === 0 ? (
                      <div className="rounded-[30px] border border-white/10 bg-white/6 px-5 py-12 text-center shadow-[0_18px_40px_rgba(2,12,27,0.24)]">
                        <p className="text-base font-semibold text-white">
                          {t('search.noCategoryMatches', 'No results')}
                        </p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-3">
                        {filteredParentCategories.map((parent) => (
                          <CategoryTile
                            key={parent.id}
                            icon={parent.icon}
                            name={parent.name}
                            palette={getPalette(parent.id)}
                            selected={parent.id === resolvedActiveParentId}
                            onClick={() => openSubcategorySheet(parent.id)}
                          />
                        ))}
                      </div>
                    )}
                  </>
                ) : activeParent ? (
                  <>
                    <div className="rounded-[34px] p-4 shadow-[0_20px_44px_rgba(15,23,42,0.12)]" style={{ background: getPalette(activeParent.id).background, color: getPalette(activeParent.id).text }}>
                      <div className="flex items-center gap-3">
                        <span className={cn('inline-flex h-14 w-14 items-center justify-center rounded-[22px] backdrop-blur-sm', getPalette(activeParent.id).iconWrap)}>
                          {activeParent.icon}
                        </span>
                        <h3 className="text-2xl font-black tracking-[-0.04em]">
                          {activeParent.name}
                        </h3>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <TopicTile
                        icon={<GlobeIcon size={22} />}
                        name={t('search.allSubcategories', 'All Topics')}
                        palette={{
                          background: 'linear-gradient(145deg, #1b2f58 0%, #152241 100%)',
                          text: '#f8fafc',
                          iconWrap: 'bg-white/10 text-white',
                          shadow: 'shadow-[0_18px_40px_rgba(2,12,27,0.22)]',
                          blobOne: 'bg-white/10',
                          blobTwo: 'bg-black/12',
                        }}
                        selected={effectiveAllInCategory}
                        onClick={applyAllSelection}
                      />

                      {filteredSubcategories.map((subcategory) => {
                        const isSelected = !effectiveAllInCategory && selectedSubIdsForActiveParent.has(subcategory.id);
                        return (
                          <TopicTile
                            key={subcategory.id}
                            icon={subcategory.icon}
                            name={subcategory.name}
                            palette={getPalette(subcategory.id)}
                            selected={isSelected}
                            onClick={() => toggleSubSelection(subcategory.id)}
                          />
                        );
                      })}
                    </div>

                    {activeSubcategories.length === 0 && (
                      <div className="rounded-[30px] border border-white/10 bg-white/6 px-5 py-12 text-center shadow-[0_18px_40px_rgba(2,12,27,0.24)]">
                        <p className="text-base font-semibold text-white">
                          {t('search.noSubcategoriesFound', 'No topics')}
                        </p>
                      </div>
                    )}

                    {activeSubcategories.length > 0 && filteredSubcategories.length === 0 && (
                      <div className="rounded-[30px] border border-white/10 bg-white/6 px-5 py-12 text-center shadow-[0_18px_40px_rgba(2,12,27,0.24)]">
                        <p className="text-base font-semibold text-white">
                          {t('search.noSubcategoryMatches', 'No results')}
                        </p>
                      </div>
                    )}
                  </>
                ) : null}
              </motion.div>
            </AnimatePresence>
          </div>

          <footer className="shrink-0 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 sm:px-5">
            {currentStep === 'subcategories' && activeParent ? (
              <motion.button
                type="button"
                onClick={handleReady}
                disabled={!canSubmit}
                whileHover={canSubmit ? { scale: 1.02 } : undefined}
                whileTap={canSubmit ? { scale: 0.97 } : undefined}
                className={cn(
                  'relative inline-flex min-h-[60px] w-full items-center justify-center gap-3 rounded-[22px] px-6 py-4 text-lg font-black tracking-[-0.02em]',
                  'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/60',
                  'transition-all duration-200',
                  canSubmit
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-[0_0_28px_rgba(16,185,129,0.4),0_10px_32px_rgba(20,184,166,0.3)]'
                    : 'cursor-not-allowed bg-white/10 text-white/25'
                )}
              >
                {/* Subtle shimmer on hover */}
                {canSubmit && (
                  <motion.span
                    className="absolute inset-0 rounded-[22px]"
                    style={{
                      background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.2) 50%, transparent 100%)',
                    }}
                    animate={{ x: ['-100%', '200%'] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'linear', repeatDelay: 3 }}
                  />
                )}
                {isSubmitting ? (
                  <>
                    <motion.span
                      className="h-5 w-5 rounded-full border-2 border-white/30 border-t-white"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 0.7, repeat: Infinity, ease: 'linear' }}
                    />
                    {t('overlay.startingMatch', 'Starting...')}
                  </>
                ) : matchMode === 'practice' ? (
                  <>
                    <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                    </svg>
                    {t('search.startPractice', 'Start Practice')}
                  </>
                ) : (
                  <>
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    {t('search.startMatch', 'Start Search')}
                  </>
                )}
              </motion.button>
            ) : (
              <div className="h-2" aria-hidden="true" />
            )}
          </footer>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default PlayMatchModal;
