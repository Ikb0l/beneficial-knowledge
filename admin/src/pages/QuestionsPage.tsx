import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  QUESTIONS_QUERY_KEY,
  bulkImportQuestions,
  deleteQuestion,
  exportQuestions,
  fetchQuestions,
  toggleQuestionStatus,
  useBulkDeleteQuestionsMutation,
  useQuestionsQuery,
} from '../domains/questions/api';
import type { QuestionContract, QuestionImportResult } from '../domains/questions/contracts';
import { useRBAC } from '../hooks/useRBAC';
import { useCategories } from '../hooks/useCategories';
import type { QuestionType } from '../types';
import { getErrorMessage } from '../lib/errors';
import { confirmAction } from '../lib/confirm';
import { toastError, toastSuccess } from '../lib/toast';
import Modal from '../components/Modal';
import SavedViewsToolbar from '../components/SavedViewsToolbar';
import {
  Button,
  DataTableShell,
  EmptyState,
  Input,
  PageHeader,
  Select,
  Spinner,
} from '../components/ui';

interface QuestionPreview {
  id: string;
  category: string;
  difficulty: 'easy' | 'medium' | 'hard';
  questionText: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
}

const QUESTION_TYPES: Array<{ type: QuestionType; label: string }> = [
  { type: 'mcq', label: 'Multiple choice' },
  { type: 'true_false', label: 'True / False' },
  { type: 'true_false_not_given', label: 'True / False / Not Given' },
  { type: 'heading_match', label: 'Match heading (choose)' },
];

const DEFAULT_IMPORT_TYPES: QuestionType[] = QUESTION_TYPES.map((t) => t.type);
const IMPORT_TYPES_STORAGE_KEY = 'admin_import_allowed_types_by_category';

const IMPORT_EXAMPLES: Array<{ title: string; description: string; json: string }> = [
  {
    title: 'Multiple choice (mcq)',
    description: '2 to 6 options, one correct answer (correctIndex).',
    json: `[
  {
    "category": "prophets",
    "difficulty": "easy",
    "questionType": "mcq",
    "questionText": "Who was the first prophet?",
    "options": ["Adam (AS)", "Noah (AS)", "Abraham (AS)", "Moses (AS)"],
    "correctIndex": 0,
    "explanation": "Adam (AS) is considered the first prophet.",
    "sourceReference": "Quran/Hadith"
  }
]`,
  },
  {
    title: 'True / False (true_false)',
    description: 'Server sets options to ["True","False"]. You can omit options.',
    json: `[
  {
    "category": "prophets",
    "difficulty": "easy",
    "questionType": "true_false",
    "questionText": "Prophet Nuh (AS) built the Ark.",
    "correctIndex": 0,
    "explanation": "This is a well-known account.",
    "sourceReference": "Quran"
  }
]`,
  },
  {
    title: 'True / False / Not Given (true_false_not_given)',
    description: 'Server sets options to ["True","False","Not Given"]. You can omit options.',
    json: `[
  {
    "category": "prophets",
    "difficulty": "medium",
    "questionType": "true_false_not_given",
    "questionText": "The Quran states the exact height of Prophet Adam (AS).",
    "correctIndex": 2,
    "explanation": "If the text does not state it, use Not Given.",
    "sourceReference": "Quran"
  }
]`,
  },
  {
    title: 'Match heading (heading_match)',
    description: 'Same structure as mcq (single correct choice), 2 to 6 options.',
    json: `[
  {
    "category": "prophets",
    "difficulty": "hard",
    "questionType": "heading_match",
    "questionText": "Choose the best heading: A passage describing patience during hardship.",
    "options": ["Gratitude", "Patience", "Justice", "Migration"],
    "correctIndex": 1,
    "explanation": "The passage focuses on sabr (patience).",
    "sourceReference": "Quran/Hadith"
  }
]`,
  },
];

const DIFFICULTIES = [
  { id: 'all', name: 'All Difficulties' },
  { id: 'easy', name: 'Easy' },
  { id: 'medium', name: 'Medium' },
  { id: 'hard', name: 'Hard' },
];

const PAGE_SIZE = 20;
const PREVIEW_FETCH_LIMIT = 50;
const PREVIEW_QUESTION_COUNT = 7;
const IMPORT_BATCH_SIZE = 50;

const loadSavedImportTypes = (categoryKey: string): QuestionType[] | null => {
  if (!categoryKey) return null;
  try {
    const raw = localStorage.getItem(IMPORT_TYPES_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const value = parsed[categoryKey];
    if (!Array.isArray(value)) return null;

    const selected: QuestionType[] = [];
    for (const item of value) {
      if (typeof item !== 'string') continue;
      const normalized = item.toLowerCase();
      if (DEFAULT_IMPORT_TYPES.includes(normalized as QuestionType) && !selected.includes(normalized as QuestionType)) {
        selected.push(normalized as QuestionType);
      }
    }

    return selected;
  } catch {
    return null;
  }
};

const saveImportTypes = (categoryKey: string, types: QuestionType[]) => {
  if (!categoryKey) return;
  try {
    const raw = localStorage.getItem(IMPORT_TYPES_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    parsed[categoryKey] = types;
    localStorage.setItem(IMPORT_TYPES_STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    // Ignore storage failures.
  }
};

const shuffleArray = <T,>(items: T[]): T[] => {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = result[i];
    result[i] = result[j];
    result[j] = temp;
  }
  return result;
};

const randomizePreviewQuestion = (question: QuestionContract): QuestionPreview => {
  const options = Array.isArray(question.options) ? question.options.slice() : [];
  const indices = options.map((_, index) => index);
  const shuffledIndices = shuffleArray(indices);

  const shuffledOptions: string[] = [];
  let newCorrectIndex = -1;

  for (let i = 0; i < shuffledIndices.length; i += 1) {
    const originalIndex = shuffledIndices[i];
    shuffledOptions.push(options[originalIndex]);
    if (originalIndex === question.correctIndex) {
      newCorrectIndex = i;
    }
  }

  return {
    id: question.id,
    category: question.category,
    difficulty: question.difficulty,
    questionText: question.questionText,
    options: shuffledOptions.length > 0 ? shuffledOptions : options,
    correctIndex: newCorrectIndex >= 0 ? newCorrectIndex : question.correctIndex,
    explanation: question.explanation || undefined,
  };
};

function parsePositiveInt(value: string | null, fallback: number) {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export default function QuestionsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { canPerform, can } = useRBAC();
  const { categories, isLoading: categoriesLoading } = useCategories();

  const page = parsePositiveInt(searchParams.get('page'), 1);
  const category = searchParams.get('category') || 'all';
  const difficulty = searchParams.get('difficulty') || 'all';
  const questionType = searchParams.get('questionType') || 'all';
  const search = searchParams.get('search') || '';
  const showInactive = searchParams.get('showInactive') === '1';
  const sortBy = searchParams.get('sortBy') || 'createdAt';
  const sortOrder = searchParams.get('sortOrder') === 'asc' ? 'asc' : 'desc';

  const { data, isLoading, error, refetch, isFetching } = useQuestionsQuery({
    page,
    pageSize: PAGE_SIZE,
    category: category === 'all' ? undefined : category,
    difficulty: difficulty === 'all' ? undefined : difficulty,
    questionType: questionType === 'all' ? undefined : questionType,
    search: search || undefined,
    showInactive,
    sortBy,
    sortOrder,
  });

  const questions = data?.items || [];
  const total = data?.total || 0;
  const totalPages = Math.max(1, data?.totalPages || Math.ceil(total / PAGE_SIZE) || 1);
  const activeFilterCount = [category !== 'all', difficulty !== 'all', questionType !== 'all', Boolean(search), showInactive].filter(Boolean).length;

  const [searchDraft, setSearchDraft] = useState(search);
  const [listError, setListError] = useState<string | null>(null);

  const [showImportModal, setShowImportModal] = useState(false);
  const [importCategory, setImportCategory] = useState('');
  const [importData, setImportData] = useState('');
  const [importAllowedTypes, setImportAllowedTypes] = useState<QuestionType[]>(DEFAULT_IMPORT_TYPES);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<QuestionImportResult | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);

  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewCategory, setPreviewCategory] = useState('');
  const [previewQuestions, setPreviewQuestions] = useState<QuestionPreview[]>([]);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<Set<string>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const bulkDeleteQuestionsMutation = useBulkDeleteQuestionsMutation();

  const canCreate = can('questions.create');
  const canUpdate = can('questions.update');
  const canDelete = canPerform('delete_question');
  const canImport = can('questions.import');
  const canExport = can('questions.export');

  const selectedOnPage = questions.filter((question) => selectedQuestionIds.has(question.id)).length;
  const isAllSelectedOnPage = questions.length > 0 && selectedOnPage === questions.length;
  const isSomeSelectedOnPage = selectedOnPage > 0 && !isAllSelectedOnPage;
  const selectedCount = selectedQuestionIds.size;

  useEffect(() => {
    setSearchDraft(search);
  }, [search]);

  useEffect(() => {
    setSelectedQuestionIds(new Set());
    setListError(null);
  }, [page, category, difficulty, questionType, search, showInactive, sortBy, sortOrder]);

  useEffect(() => {
    if (page > totalPages) {
      const next = new URLSearchParams(searchParams);
      if (totalPages <= 1) {
        next.delete('page');
      } else {
        next.set('page', String(totalPages));
      }
      setSearchParams(next);
    }
  }, [page, searchParams, setSearchParams, totalPages]);

  useEffect(() => {
    if (categories.length === 0) return;

    const hasImportCategory = categories.some((item) => item.categoryKey === importCategory);
    const hasPreviewCategory = categories.some((item) => item.categoryKey === previewCategory);

    if (!hasImportCategory) {
      setImportCategory(categories[0].categoryKey);
    }
    if (!hasPreviewCategory) {
      setPreviewCategory(categories[0].categoryKey);
    }
  }, [categories, importCategory, previewCategory]);

  useEffect(() => {
    if (!showImportModal) return;
    const saved = loadSavedImportTypes(importCategory);
    setImportAllowedTypes(saved ?? DEFAULT_IMPORT_TYPES);
  }, [importCategory, showImportModal]);

  useEffect(() => {
    if (!showImportModal) return;
    saveImportTypes(importCategory, importAllowedTypes);
  }, [importAllowedTypes, importCategory, showImportModal]);

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = isSomeSelectedOnPage;
    }
  }, [isSomeSelectedOnPage]);

  useEffect(() => {
    if (!showPreviewModal) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closePreviewModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showPreviewModal]);

  const updateParams = (updates: Record<string, string | undefined>, options?: { resetPage?: boolean }) => {
    const next = new URLSearchParams(searchParams);

    Object.entries(updates).forEach(([key, value]) => {
      if (value) {
        next.set(key, value);
      } else {
        next.delete(key);
      }
    });

    if (options?.resetPage !== false) {
      next.delete('page');
    }

    setSearchParams(next);
  };

  const setPageParam = (nextPage: number) => {
    const next = new URLSearchParams(searchParams);
    if (nextPage <= 1) {
      next.delete('page');
    } else {
      next.set('page', String(nextPage));
    }
    setSearchParams(next);
  };

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
    updateParams({ search: searchDraft.trim() || undefined });
  };

  const handleDelete = async (questionId: string) => {
    if (!(await confirmAction({
      title: 'Delete question?',
      message: 'Are you sure you want to delete this question?',
      confirmLabel: 'Delete',
      tone: 'danger',
    }))) return;

    try {
      await deleteQuestion(questionId);
      await queryClient.invalidateQueries({ queryKey: QUESTIONS_QUERY_KEY });
      await refetch();
      toastSuccess('Question deleted');
    } catch (err) {
      console.error('Failed to delete question:', err);
      toastError('Failed to delete question: ' + getErrorMessage(err));
    }
  };

  const handleToggleSelectQuestion = (questionId: string) => {
    setSelectedQuestionIds((prev) => {
      const next = new Set(prev);
      if (next.has(questionId)) {
        next.delete(questionId);
      } else {
        next.add(questionId);
      }
      return next;
    });
  };

  const handleSelectAllOnPage = (checked: boolean) => {
    setSelectedQuestionIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        questions.forEach((question) => next.add(question.id));
      } else {
        questions.forEach((question) => next.delete(question.id));
      }
      return next;
    });
  };

  const handleClearSelection = () => {
    setSelectedQuestionIds(new Set());
  };

  const handleBulkDelete = async () => {
    if (selectedCount === 0) return;

    if (!(await confirmAction({
      title: 'Delete selected questions?',
      message: `Delete ${selectedCount} selected questions?`,
      confirmLabel: 'Delete',
      tone: 'danger',
    }))) return;

    setIsBulkDeleting(true);
    setListError(null);
    const idsToDelete = Array.from(selectedQuestionIds);

    try {
      const response = await bulkDeleteQuestionsMutation.mutateAsync({ questionIds: idsToDelete });
      await queryClient.invalidateQueries({ queryKey: QUESTIONS_QUERY_KEY });
      await refetch();
      setSelectedQuestionIds(new Set());
      toastSuccess(`Deleted ${response.deletedCount || idsToDelete.length} question${idsToDelete.length === 1 ? '' : 's'}`);
    } catch (err) {
      console.error('Failed to bulk delete questions:', err);
      setListError(getErrorMessage(err));
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const handleToggleActive = async (questionId: string, isActive: boolean) => {
    try {
      await toggleQuestionStatus({ questionId, isActive: !isActive });
      await queryClient.invalidateQueries({ queryKey: QUESTIONS_QUERY_KEY });
      await refetch();
      toastSuccess(!isActive ? 'Question activated' : 'Question deactivated');
    } catch (err) {
      console.error('Failed to toggle question:', err);
      toastError('Failed to toggle question status: ' + getErrorMessage(err));
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const response = await exportQuestions(category === 'all' ? undefined : category);
      const exportData = {
        exportedAt: new Date().toISOString(),
        category: category === 'all' ? 'all' : category,
        total: response.total,
        errors: response.errors,
        questions: response.questions,
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `questions-${category}-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);

      toastSuccess(`Exported ${response.total} question${response.total === 1 ? '' : 's'}`);
    } catch (err) {
      console.error('Failed to export questions:', err);
      toastError('Failed to export questions: ' + getErrorMessage(err));
    } finally {
      setIsExporting(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      setImportData(loadEvent.target?.result as string);
    };
    reader.onerror = () => {
      setListError('Failed to read file. Please try again with a different file.');
      if (event.target) {
        event.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!importData.trim()) {
      toastError('Please paste JSON data or select a file');
      return;
    }
    if (importAllowedTypes.length === 0) {
      toastError('Please select at least one question type to import');
      return;
    }

    setIsImporting(true);
    setImportResult(null);

    try {
      let questionsToImport: unknown[] = [];
      const parsed = JSON.parse(importData);

      if (Array.isArray(parsed)) {
        questionsToImport = parsed;
      } else if (parsed.questions && Array.isArray(parsed.questions)) {
        questionsToImport = parsed.questions;
      } else {
        throw new Error('Invalid format: expected array of questions or object with questions array');
      }

      if (questionsToImport.length === 0) {
        throw new Error('No questions found to import');
      }

      const totalBatches = Math.ceil(questionsToImport.length / IMPORT_BATCH_SIZE);
      let totalImported = 0;
      const allErrors: string[] = [];

      for (let batchIndex = 0; batchIndex < totalBatches; batchIndex += 1) {
        const start = batchIndex * IMPORT_BATCH_SIZE;
        const batch = questionsToImport.slice(start, start + IMPORT_BATCH_SIZE);
        const response = await bulkImportQuestions({
          questions: batch,
          category: importCategory,
          allowedQuestionTypes: importAllowedTypes,
        });

        totalImported += response.imported || 0;
        if (Array.isArray(response.errors) && response.errors.length > 0) {
          for (const batchError of response.errors) {
            const prefix = totalBatches > 1 ? `Batch ${batchIndex + 1}: ` : '';
            allErrors.push(prefix + batchError);
          }
        }

        setImportResult({
          imported: totalImported,
          errors: allErrors,
        });
      }

      await queryClient.invalidateQueries({ queryKey: QUESTIONS_QUERY_KEY });
      await refetch();

      if (totalImported > 0) {
        toastSuccess(`Imported ${totalImported} question${totalImported === 1 ? '' : 's'}`);
      }
    } catch (err: unknown) {
      console.error('Failed to import questions:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to import questions';
      setImportResult({
        imported: 0,
        errors: [errorMessage],
      });
    } finally {
      setIsImporting(false);
    }
  };

  const closeImportModal = () => {
    setShowImportModal(false);
    setImportData('');
    setImportResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const openImportModal = () => {
    setShowImportModal(true);
    setImportResult(null);
  };

  const copyToClipboard = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toastSuccess('Copied example');
    } catch (err) {
      console.error('Failed to copy:', err);
      toastError('Copy failed. Please copy manually.');
    }
  };

  const toggleImportType = (type: QuestionType) => {
    setImportAllowedTypes((prev) => {
      if (prev.includes(type)) {
        return prev.filter((item) => item !== type);
      }
      return [...prev, type];
    });
  };

  const openPreviewModal = () => {
    setShowPreviewModal(true);
    setPreviewQuestions([]);
    setPreviewError(null);
  };

  const closePreviewModal = () => {
    setShowPreviewModal(false);
    setPreviewQuestions([]);
    setPreviewError(null);
  };

  const loadPreviewQuestions = async () => {
    setIsPreviewLoading(true);
    setPreviewError(null);
    setPreviewQuestions([]);

    try {
      const response = await fetchQuestions({
        category: previewCategory,
        isActive: true,
        limit: PREVIEW_FETCH_LIMIT,
        offset: 0,
      });

      const randomized = shuffleArray(response.items || [])
        .slice(0, PREVIEW_QUESTION_COUNT)
        .map(randomizePreviewQuestion);

      setPreviewQuestions(randomized);
    } catch (err: unknown) {
      console.error('Failed to preview questions:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to load preview questions';
      setPreviewError(errorMessage);
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const getDifficultyBadge = (value: string) => {
    const classes = {
      easy: 'badge-easy',
      medium: 'badge-medium',
      hard: 'badge-hard',
    }[value] || 'badge-info';
    return <span className={`badge ${classes}`}>{value}</span>;
  };

  const getQuestionTypeBadge = (value?: string) => {
    const normalized = (value || 'mcq').toLowerCase();
    const label = normalized === 'true_false'
      ? 'True/False'
      : normalized === 'true_false_not_given'
        ? 'TFNG'
        : normalized === 'heading_match'
          ? 'Heading'
          : 'MCQ';

    return <span className="badge badge-info">{label}</span>;
  };

  const showingFrom = total === 0 ? 0 : ((page - 1) * PAGE_SIZE) + 1;
  const showingTo = total === 0 ? 0 : Math.min(page * PAGE_SIZE, total);

  return (
    <div className="page-shell">
      <PageHeader
        title="Questions"
        subtitle="Question library, imports, preview, and activation controls"
        actions={(
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void refetch()} loading={isFetching}>
              Refresh
            </Button>
            {canDelete && selectedCount > 0 ? (
              <>
                <Button onClick={handleBulkDelete} disabled={isBulkDeleting} variant="danger">
                  {isBulkDeleting ? 'Deleting...' : `Delete Selected (${selectedCount})`}
                </Button>
                <Button onClick={handleClearSelection} disabled={isBulkDeleting} variant="secondary">
                  Clear Selection
                </Button>
              </>
            ) : null}
            {canImport ? (
              <Button onClick={openImportModal} variant="secondary">
                Import JSON
              </Button>
            ) : null}
            <Button onClick={openPreviewModal} variant="secondary">
              Preview
            </Button>
            {canExport ? (
              <Button onClick={handleExport} disabled={isExporting} variant="secondary">
                {isExporting ? 'Exporting...' : 'Export JSON'}
              </Button>
            ) : null}
            {canCreate ? (
              <Link to="/questions/new" className="btn btn-primary">
                Add Question
              </Link>
            ) : null}
          </div>
        )}
      />

      {(error || listError) ? (
        <div className="rounded-xl border border-yellow-300/75 bg-yellow-100/70 p-4">
          <p className="text-sm text-yellow-800">
            {listError || `Showing the latest successful result. Refresh warning: ${error?.message || 'Unknown error'}`}
          </p>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <SummaryCard label="Library results" value={total} detail={`${showingFrom}-${showingTo} in current page`} />
        <SummaryCard label="Selected" value={selectedCount} detail={selectedCount > 0 ? 'Bulk actions ready' : 'No rows selected'} />
        <SummaryCard label="Active filters" value={activeFilterCount} detail={activeFilterCount > 0 ? 'Filters are URL-synced' : 'All questions visible'} />
      </div>

      <div className="panel-card p-4">
        <form onSubmit={handleSearch} className="flex flex-wrap gap-4">
          <div className="min-w-[220px] flex-1">
            <Input
              type="text"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder="Search questions..."
            />
          </div>
          <Select
            value={category}
            onChange={(event) => updateParams({ category: event.target.value === 'all' ? undefined : event.target.value })}
            disabled={categoriesLoading}
          >
            <option value="all">Any Category</option>
            {categories.map((item) => (
              <option key={item.id} value={item.categoryKey}>{item.name}</option>
            ))}
          </Select>
          <Select
            value={difficulty}
            onChange={(event) => updateParams({ difficulty: event.target.value === 'all' ? undefined : event.target.value })}
          >
            {DIFFICULTIES.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </Select>
          <Select
            value={questionType}
            onChange={(event) => updateParams({ questionType: event.target.value === 'all' ? undefined : event.target.value })}
          >
            <option value="all">Any Type</option>
            {QUESTION_TYPES.map((item) => (
              <option key={item.type} value={item.type}>{item.label}</option>
            ))}
          </Select>
          <Select
            value={sortBy}
            onChange={(event) => updateParams({ sortBy: event.target.value === 'createdAt' ? undefined : event.target.value })}
          >
            <option value="createdAt">Newest</option>
            <option value="updatedAt">Recently Updated</option>
            <option value="timesShown">Most Shown</option>
            <option value="accuracy">Lowest Accuracy</option>
            <option value="difficulty">Difficulty</option>
            <option value="questionType">Question Type</option>
          </Select>
          <Select
            value={sortOrder}
            onChange={(event) => updateParams({ sortOrder: event.target.value === 'desc' ? undefined : event.target.value })}
          >
            <option value="desc">Desc</option>
            <option value="asc">Asc</option>
          </Select>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(event) => updateParams({ showInactive: event.target.checked ? '1' : undefined })}
              className="rounded border-slate-300"
            />
            <span className="text-sm text-slate-600">Show inactive</span>
          </label>
          <Button type="submit">Search</Button>
        </form>
        <p className="mt-3 text-sm text-slate-500">
          Filters stay in the URL, so reopening the page restores the same question workspace.
        </p>
      </div>

      <SavedViewsToolbar
        storageKey="questions"
        searchParams={searchParams}
        onApply={(next) => setSearchParams(next)}
      />

      <DataTableShell>
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Spinner size="lg" />
          </div>
        ) : questions.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <EmptyState
              title="No questions found"
              subtitle={activeFilterCount > 0 ? 'Try clearing filters or widening your search.' : 'Create or import questions to build the library.'}
            />
          </div>
        ) : (
          <>
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  {canDelete ? (
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">
                      <input
                        ref={selectAllRef}
                        type="checkbox"
                        checked={isAllSelectedOnPage}
                        onChange={(event) => handleSelectAllOnPage(event.target.checked)}
                        aria-label="Select all questions on this page"
                        className="rounded border-slate-300"
                      />
                    </th>
                  ) : null}
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Question</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Category</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Difficulty</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Stats</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {questions.map((question) => (
                  <tr key={question.id} className="hover:bg-slate-50">
                    {canDelete ? (
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedQuestionIds.has(question.id)}
                          onChange={() => handleToggleSelectQuestion(question.id)}
                          aria-label={`Select question ${question.questionText}`}
                          className="rounded border-slate-300"
                        />
                      </td>
                    ) : null}
                    <td className="px-4 py-3">
                      <p className="line-clamp-2 text-sm text-slate-800">{question.questionText}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm capitalize text-slate-600">{question.category.replace(/_/g, ' ')}</span>
                    </td>
                    <td className="px-4 py-3">
                      {getDifficultyBadge(question.difficulty)}
                    </td>
                    <td className="px-4 py-3">
                      {getQuestionTypeBadge(question.questionType)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-xs text-slate-500">
                        <p>Shown: {question.timesShown}</p>
                        <p>Success: {question.timesShown > 0 ? Math.round((question.timesCorrect / question.timesShown) * 100) : 0}%</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`badge ${question.isActive ? 'badge-success' : 'badge-error'}`}>
                        {question.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {canUpdate || canCreate ? (
                          <Link
                            to={`/questions/${question.id}`}
                            className="text-sm text-primary-600 hover:text-primary-700"
                          >
                            Edit
                          </Link>
                        ) : null}
                        {canUpdate ? (
                          <button
                            type="button"
                            onClick={() => void handleToggleActive(question.id, question.isActive)}
                            className="text-sm text-slate-600 hover:text-slate-700"
                          >
                            {question.isActive ? 'Disable' : 'Enable'}
                          </button>
                        ) : null}
                        {canDelete ? (
                          <button
                            type="button"
                            onClick={() => void handleDelete(question.id)}
                            className="text-sm text-red-600 hover:text-red-700"
                          >
                            Delete
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {total > PAGE_SIZE ? (
              <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
                <p className="text-sm text-slate-600">
                  Showing {showingFrom} to {showingTo} of {total}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setPageParam(Math.max(1, page - 1))}
                    disabled={page === 1}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setPageParam(Math.min(totalPages, page + 1))}
                    disabled={page >= totalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </DataTableShell>

      {showImportModal ? (
        <Modal open={showImportModal} onClose={closeImportModal} ariaLabel="Import questions">
          <div className="mx-auto max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-xl">
            <div className="border-b border-slate-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-slate-800">Import Questions</h2>
              <p className="text-sm text-slate-600">Import questions from a JSON file</p>
            </div>

            <div className="space-y-4 p-6">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Default Category (used if not specified in data)
                </label>
                <Select
                  value={importCategory}
                  onChange={(event) => setImportCategory(event.target.value)}
                >
                  {categories.map((item) => (
                    <option key={item.id} value={item.categoryKey}>{item.name}</option>
                  ))}
                </Select>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <label className="block text-sm font-medium text-slate-700">
                    Allowed Question Types
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setImportAllowedTypes(DEFAULT_IMPORT_TYPES)}
                      className="text-xs text-slate-600 underline hover:text-slate-800"
                    >
                      Select all
                    </button>
                    <button
                      type="button"
                      onClick={() => setImportAllowedTypes([])}
                      className="text-xs text-slate-600 underline hover:text-slate-800"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {QUESTION_TYPES.map(({ type, label }) => (
                    <label key={type} className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={importAllowedTypes.includes(type)}
                        onChange={() => toggleImportType(type)}
                        className="rounded border-slate-300"
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>

                {importAllowedTypes.length === 0 ? (
                  <p className="mt-2 text-xs text-yellow-700">
                    Select at least one type to enable importing.
                  </p>
                ) : null}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Select JSON File
                </label>
                <Input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleFileSelect}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Or Paste JSON Data
                </label>
                <textarea
                  value={importData}
                  onChange={(event) => setImportData(event.target.value)}
                  rows={10}
                  placeholder={`[
  {
    "category": "prophets",
    "difficulty": "easy",
    "questionType": "mcq",
    "questionText": "Who was the first prophet?",
    "options": ["Adam (AS)", "Noah (AS)", "Abraham (AS)", "Moses (AS)"],
    "correctIndex": 0,
    "explanation": "Adam was the first prophet.",
    "sourceReference": "Quran"
  }
]`}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
                />
              </div>

              {importResult ? (
                <div className={`rounded-lg border p-4 ${importResult.errors.length > 0 ? 'border-yellow-200 bg-yellow-50' : 'border-green-200 bg-green-50'}`}>
                  <p className={`font-medium ${importResult.errors.length > 0 ? 'text-yellow-800' : 'text-green-800'}`}>
                    Imported: {importResult.imported} questions
                  </p>
                  {importResult.errors.length > 0 ? (
                    <div className="mt-2">
                      <p className="text-sm font-medium text-yellow-800">Errors:</p>
                      <ul className="list-inside list-disc text-sm text-yellow-700">
                        {importResult.errors.slice(0, 10).map((item, index) => (
                          <li key={index}>{item}</li>
                        ))}
                        {importResult.errors.length > 10 ? (
                          <li>... and {importResult.errors.length - 10} more errors</li>
                        ) : null}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="rounded-lg bg-slate-50 p-4">
                <p className="mb-2 text-sm font-medium text-slate-700">Expected JSON Format:</p>
                <ul className="space-y-1 text-xs text-slate-600">
                  <li><code className="rounded bg-slate-200 px-1">category</code>: {categories.length > 0 ? categories.map((item) => item.categoryKey).join(', ') : 'Load categories to see valid keys'}</li>
                  <li><code className="rounded bg-slate-200 px-1">difficulty</code>: easy, medium, hard</li>
                  <li><code className="rounded bg-slate-200 px-1">questionType</code>: mcq, true_false, true_false_not_given, heading_match</li>
                  <li><code className="rounded bg-slate-200 px-1">questionText</code>: The question text (required)</li>
                  <li><code className="rounded bg-slate-200 px-1">options</code>: Array of 2 to 6 answer options (required for mcq and heading_match)</li>
                  <li><code className="rounded bg-slate-200 px-1">correctIndex</code>: Index of correct answer 0..(options.length-1)</li>
                  <li><code className="rounded bg-slate-200 px-1">explanation</code>: Explanation shown after answer (optional)</li>
                  <li><code className="rounded bg-slate-200 px-1">sourceReference</code>: Source reference (optional)</li>
                </ul>

                <div className="mt-3 text-xs text-slate-600">
                  <p>
                    This import is single-category. Either omit <code className="rounded bg-slate-200 px-1">category</code> per question and use the dropdown above,
                    or ensure every question has the same category as selected.
                  </p>
                </div>

                <details className="mt-4">
                  <summary className="cursor-pointer select-none text-sm font-medium text-slate-700">
                    Examples (copy-paste)
                  </summary>
                  <div className="mt-3 space-y-4">
                    {IMPORT_EXAMPLES.map((example) => (
                      <div key={example.title} className="rounded-lg border border-slate-200 bg-white p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-800">{example.title}</p>
                            <p className="mt-0.5 text-xs text-slate-600">{example.description}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => void copyToClipboard(example.json)}
                            className="rounded-lg border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
                          >
                            Copy
                          </button>
                        </div>
                        <pre className="mt-3 overflow-auto rounded border border-slate-200 bg-slate-50 p-3 text-xs">
                          <code>{example.json}</code>
                        </pre>
                      </div>
                    ))}
                  </div>
                </details>
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4">
              <Button type="button" onClick={closeImportModal} variant="secondary">
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => void handleImport()}
                disabled={isImporting || !importData.trim() || importAllowedTypes.length === 0}
              >
                {isImporting ? 'Importing...' : 'Import Questions'}
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}

      {showPreviewModal ? (
        <Modal
          open={showPreviewModal}
          onClose={closePreviewModal}
          ariaLabel="Preview questions"
          closeOnBackdrop
        >
          <div className="mx-auto max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-800">Preview Questions</h2>
                <p className="text-sm text-slate-600">Randomized options per preview load.</p>
              </div>
              <button
                type="button"
                onClick={closePreviewModal}
                className="px-2 py-1 text-slate-500 hover:text-slate-700"
                aria-label="Close preview"
              >
                X
              </button>
            </div>

            <div className="space-y-4 p-6">
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[200px] flex-1">
                  <label className="mb-1 block text-sm font-medium text-slate-700">Category</label>
                  <Select
                    value={previewCategory}
                    onChange={(event) => setPreviewCategory(event.target.value)}
                  >
                    {categories.map((item) => (
                      <option key={item.id} value={item.categoryKey}>{item.name}</option>
                    ))}
                  </Select>
                </div>
                <Button onClick={() => void loadPreviewQuestions()} disabled={isPreviewLoading}>
                  {isPreviewLoading ? 'Loading...' : 'Load Preview'}
                </Button>
              </div>

              {previewError ? (
                <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
                  <p className="text-sm text-yellow-700">{previewError}</p>
                </div>
              ) : null}

              {isPreviewLoading ? (
                <div className="flex h-40 items-center justify-center">
                  <Spinner />
                </div>
              ) : previewQuestions.length === 0 ? (
                <div className="py-6 text-center text-slate-500">
                  Load a preview to see questions.
                </div>
              ) : (
                <div className="space-y-4">
                  {previewQuestions.map((question, index) => (
                    <div key={question.id || index} className="rounded-lg border border-slate-200 p-4">
                      <div className="mb-2 flex items-center justify-between">
                        <p className="font-medium text-slate-800">{question.questionText}</p>
                        <span className={`badge ${
                          question.difficulty === 'easy'
                            ? 'badge-easy'
                            : question.difficulty === 'medium'
                              ? 'badge-medium'
                              : 'badge-hard'
                        }`}>
                          {question.difficulty}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                        {question.options.map((option, optionIndex) => (
                          <div
                            key={optionIndex}
                            className={`rounded-lg border px-3 py-2 text-sm ${
                              optionIndex === question.correctIndex
                                ? 'border-green-200 bg-green-50 text-green-800'
                                : 'border-slate-200 bg-slate-50 text-slate-700'
                            }`}
                          >
                            {option}
                          </div>
                        ))}
                      </div>
                      {question.explanation ? (
                        <p className="mt-2 text-xs text-slate-500">{question.explanation}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end border-t border-slate-200 px-6 py-4">
              <Button onClick={closePreviewModal} variant="secondary">
                Close
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function SummaryCard({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white/60 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
      <p className="mt-1 text-sm text-slate-500">{detail}</p>
    </div>
  );
}
