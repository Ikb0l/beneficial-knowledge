import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useCategories, type Category } from '../hooks/useCategories';
import { Spinner } from '../components/ui';
import {
  useCreateQuestionMutation,
  useQuestionDetailQuery,
  useUpdateQuestionMutation,
  type QuestionInputPayload,
} from '../domains/questions/api';
import type { QuestionContract } from '../domains/questions/contracts';
import type { QuestionType } from '../types';

function buildDefaultOptions(questionType: QuestionType): string[] {
  if (questionType === 'true_false') return ['True', 'False'];
  if (questionType === 'true_false_not_given') return ['True', 'False', 'Not Given'];
  return ['', '', '', ''];
}

export default function QuestionEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEditing = Boolean(id);
  const { categories, isLoading: categoriesLoading } = useCategories();
  const questionQuery = useQuestionDetailQuery(id);
  const createQuestionMutation = useCreateQuestionMutation();
  const updateQuestionMutation = useUpdateQuestionMutation();

  if (isEditing && questionQuery.isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner />
      </div>
    );
  }

  if (isEditing && questionQuery.error && !questionQuery.data?.question) {
    return (
      <div className="max-w-3xl mx-auto page-shell">
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-700">{questionQuery.error.message}</p>
        </div>
      </div>
    );
  }

  return (
    <QuestionEditorForm
      key={id || 'new-question'}
      questionId={id}
      initialQuestion={questionQuery.data?.question || null}
      categories={categories}
      categoriesLoading={categoriesLoading}
      isEditing={isEditing}
      onCreate={async (input) => {
        await createQuestionMutation.mutateAsync(input);
        navigate('/questions');
      }}
      onUpdate={async (questionId, input) => {
        await updateQuestionMutation.mutateAsync({ questionId, updates: input });
        navigate('/questions');
      }}
      isSaving={createQuestionMutation.isPending || updateQuestionMutation.isPending}
      loadError={questionQuery.error?.message || null}
    />
  );
}

function QuestionEditorForm({
  questionId,
  initialQuestion,
  categories,
  categoriesLoading,
  isEditing,
  onCreate,
  onUpdate,
  isSaving,
  loadError,
}: {
  questionId?: string;
  initialQuestion: QuestionContract | null;
  categories: Category[];
  categoriesLoading: boolean;
  isEditing: boolean;
  onCreate: (input: QuestionInputPayload) => Promise<void>;
  onUpdate: (questionId: string, input: QuestionInputPayload) => Promise<void>;
  isSaving: boolean;
  loadError: string | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState(initialQuestion?.category || '');
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>(initialQuestion?.difficulty || 'medium');
  const [questionType, setQuestionType] = useState<QuestionType>(initialQuestion?.questionType || 'mcq');
  const [questionText, setQuestionText] = useState(initialQuestion?.questionText || '');
  const [options, setOptions] = useState<string[]>(
    initialQuestion?.options && initialQuestion.options.length >= 2
      ? initialQuestion.options.slice(0, 6)
      : buildDefaultOptions(initialQuestion?.questionType || 'mcq'),
  );
  const [correctIndex, setCorrectIndex] = useState(initialQuestion?.correctIndex ?? 0);
  const [explanation, setExplanation] = useState(initialQuestion?.explanation || '');
  const [sourceReference, setSourceReference] = useState(initialQuestion?.sourceReference || '');

  const selectedCategory = category || categories[0]?.categoryKey || '';

  const handleQuestionTypeChange = (nextType: QuestionType) => {
    setQuestionType(nextType);

    if (nextType === 'true_false') {
      setOptions(['True', 'False']);
      setCorrectIndex((prev) => Math.min(prev, 1));
      return;
    }

    if (nextType === 'true_false_not_given') {
      setOptions(['True', 'False', 'Not Given']);
      setCorrectIndex((prev) => Math.min(prev, 2));
      return;
    }

    if (questionType === 'true_false' || questionType === 'true_false_not_given') {
      setOptions(['', '', '', '']);
      setCorrectIndex(0);
      return;
    }

    setOptions((prev) => {
      if (prev.length < 2) {
        return ['', '', '', ''];
      }
      return prev.slice(0, 6);
    });
    setCorrectIndex((prev) => Math.min(prev, Math.max(0, options.length - 1)));
  };

  const handleOptionChange = (index: number, value: string) => {
    setOptions((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const handleAddOption = () => {
    if (questionType === 'true_false' || questionType === 'true_false_not_given') return;
    if (options.length >= 6) return;
    setOptions((prev) => [...prev, '']);
  };

  const handleRemoveOption = (index: number) => {
    if (questionType === 'true_false' || questionType === 'true_false_not_given') return;
    if (options.length <= 2) return;

    setOptions((prev) => prev.filter((_, optionIndex) => optionIndex !== index));
    setCorrectIndex((prev) => {
      if (prev === index) return 0;
      if (prev > index) return prev - 1;
      return prev;
    });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!questionText.trim()) {
      setError('Question text is required');
      return;
    }
    if (options.some((option) => !option.trim())) {
      setError('All options are required');
      return;
    }
    if (!explanation.trim()) {
      setError('Explanation is required');
      return;
    }

    const maxCorrectIndex = Math.max(0, options.length - 1);
    const questionData: QuestionInputPayload = {
      category: selectedCategory,
      difficulty,
      questionType,
      questionText: questionText.trim(),
      options: options.map((option) => option.trim()),
      correctIndex: Math.min(correctIndex, maxCorrectIndex),
      explanation: explanation.trim(),
      sourceReference: sourceReference.trim() || undefined,
    };

    try {
      if (isEditing && questionId) {
        await onUpdate(questionId, questionData);
      } else {
        await onCreate(questionData);
      }
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : 'Failed to save question';
      setError(message);
    }
  };

  return (
    <div className="max-w-3xl mx-auto page-shell">
      <div className="flex items-center gap-4">
        <Link to="/questions" className="text-slate-600 hover:text-slate-800">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">
            {isEditing ? 'Edit Question' : 'New Question'}
          </h1>
          <p className="text-slate-600">
            {isEditing ? 'Update question details' : 'Create a new quiz question'}
          </p>
        </div>
      </div>

      {(error || loadError) && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-700">{error || loadError}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="panel-card space-y-6">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
              <select
                value={selectedCategory}
                onChange={(event) => setCategory(event.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                disabled={categoriesLoading}
              >
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.categoryKey}>{cat.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Difficulty</label>
              <select
                value={difficulty}
                onChange={(event) => setDifficulty(event.target.value as 'easy' | 'medium' | 'hard')}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Question Type</label>
              <select
                value={questionType}
                onChange={(event) => handleQuestionTypeChange(event.target.value as QuestionType)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              >
                <option value="mcq">Multiple choice</option>
                <option value="true_false">True / False</option>
                <option value="true_false_not_given">True / False / Not Given</option>
                <option value="heading_match">Match heading (choose)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Question</label>
            <textarea
              value={questionText}
              onChange={(event) => setQuestionText(event.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              placeholder="Enter your question..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Answer Options</label>
            <div className="space-y-3">
              {options.map((option, index) => (
                <div key={index} className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="correctIndex"
                    checked={correctIndex === index}
                    onChange={() => setCorrectIndex(index)}
                    className="h-4 w-4 text-primary-600"
                  />
                  <input
                    type="text"
                    value={option}
                    onChange={(event) => handleOptionChange(index, event.target.value)}
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-lg"
                    placeholder={`Option ${index + 1}`}
                    disabled={questionType === 'true_false' || questionType === 'true_false_not_given'}
                  />
                  {questionType !== 'true_false' && questionType !== 'true_false_not_given' && options.length > 2 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveOption(index)}
                      className="text-red-600 hover:text-red-700"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>

            {questionType !== 'true_false' && questionType !== 'true_false_not_given' && options.length < 6 && (
              <button
                type="button"
                onClick={handleAddOption}
                className="mt-3 text-sm text-primary-600 hover:text-primary-700"
              >
                + Add Option
              </button>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Explanation</label>
            <textarea
              value={explanation}
              onChange={(event) => setExplanation(event.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              placeholder="Explain why the answer is correct..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Source Reference</label>
            <input
              type="text"
              value={sourceReference}
              onChange={(event) => setSourceReference(event.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              placeholder="Optional source or citation..."
            />
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Link
            to="/questions"
            className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={isSaving}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : isEditing ? 'Update Question' : 'Create Question'}
          </button>
        </div>
      </form>
    </div>
  );
}
