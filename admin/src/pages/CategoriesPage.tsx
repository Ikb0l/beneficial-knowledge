import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import SavedViewsToolbar from '../components/SavedViewsToolbar';
import { Button, DataTableShell, EmptyState, Input, PageHeader, Section, Select, Spinner, StatCard } from '../components/ui';
import Modal from '../components/Modal';
import type { Category, CategoryInput } from '../types';
import { confirmAction } from '../lib/confirm';
import {
  useCategoriesListQuery,
  useCreateCategoryMutation,
  useDeleteCategoryMutation,
  useReorderCategoriesMutation,
  useUpdateCategoryMutation,
} from '../domains/categories/api';

interface CategoryModalProps {
  isOpen: boolean;
  category: Category | null;
  categories: Category[];
  onClose: () => void;
  onSave: (data: CategoryInput, categoryId?: string) => void;
  isSaving: boolean;
  error: string | null;
}

function CategoryModal({ isOpen, category, categories, onClose, onSave, isSaving, error }: CategoryModalProps) {
  const [formData, setFormData] = useState<CategoryInput>({
    categoryKey: '',
    name: '',
    description: '',
    icon: '',
    parentId: '',
    categoryType: 'normal',
    questionsPerMatch: 7,
    useGlobalQuestionCount: true,
    isActive: true,
  });

  useEffect(() => {
    const resetTimer = setTimeout(() => {
      if (category) {
        setFormData({
          categoryKey: category.categoryKey,
          name: category.name,
          description: category.description || '',
          icon: category.icon || '',
          parentId: category.parentId || '',
          categoryType: category.categoryType || 'normal',
          questionsPerMatch: category.questionsPerMatch || 7,
          useGlobalQuestionCount: category.useGlobalQuestionCount !== false,
          isActive: category.isActive,
        });
      } else {
        setFormData({
          categoryKey: '',
          name: '',
          description: '',
          icon: '',
          parentId: '',
          categoryType: 'normal',
          questionsPerMatch: 7,
          useGlobalQuestionCount: true,
          isActive: true,
        });
      }
    }, 0);
    return () => clearTimeout(resetTimer);
  }, [category, isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload: CategoryInput = {
      ...formData,
      useGlobalQuestionCount: formData.useGlobalQuestionCount !== false,
    };
    if (payload.useGlobalQuestionCount) {
      delete payload.questionsPerMatch;
    }
    onSave(payload, category?.id);
  };

  if (!isOpen) return null;

  const parentOptions = categories.filter(c => c.id !== category?.id);

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      ariaLabel={category ? 'Edit category' : 'Create category'}
    >
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-auto max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-slate-200">
          <h2 className="text-xl font-semibold text-slate-800">
            {category ? 'Edit Category' : 'Create Category'}
          </h2>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Category Key *
              </label>
              <input
                type="text"
                value={formData.categoryKey}
                onChange={(e) => setFormData({ ...formData, categoryKey: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })}
                className="input w-full"
                placeholder="e.g., quran_basics"
                disabled={!!category}
                required
              />
              <p className="text-xs text-slate-500 mt-1">Lowercase, underscores only</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Icon (Emoji)
              </label>
              <input
                type="text"
                value={formData.icon}
                onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                className="input w-full text-2xl"
                placeholder="📚"
                maxLength={4}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Name *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="input w-full"
              placeholder="Category Name"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="input w-full"
              rows={2}
              placeholder="Brief description..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Parent Category
            </label>
            <select
              value={formData.parentId || ''}
              onChange={(e) => setFormData({ ...formData, parentId: e.target.value || undefined })}
              className="input w-full"
            >
              <option value="">None (Top Level)</option>
              {parentOptions.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.icon} {cat.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Category Type
              </label>
              <select
                value={formData.categoryType || 'normal'}
                onChange={(e) => setFormData({ ...formData, categoryType: (e.target.value === 'vocabulary' ? 'vocabulary' : 'normal') })}
                className="input w-full"
              >
                <option value="normal">Normal</option>
                <option value="vocabulary">Vocabulary</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Questions Per Match
              </label>
              <input
                type="number"
                value={formData.questionsPerMatch || 7}
                onChange={(e) => setFormData({ ...formData, questionsPerMatch: Math.max(1, parseInt(e.target.value, 10) || 7) })}
                className="input w-full"
                min={1}
                max={1000}
                disabled={formData.useGlobalQuestionCount !== false}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="useGlobalQuestionCount"
              checked={formData.useGlobalQuestionCount !== false}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  useGlobalQuestionCount: e.target.checked,
                })
              }
              className="w-4 h-4 text-primary-600 rounded border-slate-300"
            />
            <label htmlFor="useGlobalQuestionCount" className="text-sm text-slate-700">
              Use global default questions per match
            </label>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isActive"
              checked={formData.isActive}
              onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
              className="w-4 h-4 text-primary-600 rounded border-slate-300"
            />
            <label htmlFor="isActive" className="text-sm text-slate-700">Active</label>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <div className="flex gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary flex-1"
              disabled={isSaving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary flex-1"
              disabled={isSaving}
            >
              {isSaving ? 'Saving...' : (category ? 'Update' : 'Create')}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}

type CategoriesScope = 'all' | 'top_level' | 'children' | 'leaf';
type CategoryTypeFilter = 'all' | 'normal' | 'vocabulary';

function categoryMatchesSearch(category: Category, search: string) {
  if (!search) return true;
  const haystack = [category.name, category.categoryKey, category.description || '']
    .join(' ')
    .toLowerCase();
  return haystack.includes(search);
}

function sortCategories(categories: Category[]) {
  return [...categories].sort((left, right) => {
    const leftParent = left.parentId || '';
    const rightParent = right.parentId || '';
    if (leftParent !== rightParent) {
      return leftParent.localeCompare(rightParent);
    }
    if ((left.displayOrder || 0) !== (right.displayOrder || 0)) {
      return (left.displayOrder || 0) - (right.displayOrder || 0);
    }
    return left.name.localeCompare(right.name);
  });
}

export default function CategoriesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  const showInactive = searchParams.get('showInactive') === '1';
  const search = searchParams.get('search')?.trim().toLowerCase() || '';
  const viewMode = searchParams.get('view') === 'all' ? 'all' : 'grouped';
  const scope = (searchParams.get('scope') as CategoriesScope) || 'all';
  const typeFilter = (searchParams.get('categoryType') as CategoryTypeFilter) || 'all';

  const categoriesQuery = useCategoriesListQuery({ includeInactive: showInactive });
  const createCategoryMutation = useCreateCategoryMutation();
  const updateCategoryMutation = useUpdateCategoryMutation();
  const deleteCategoryMutation = useDeleteCategoryMutation();
  const reorderCategoriesMutation = useReorderCategoriesMutation();
  const categories = useMemo(() => sortCategories((categoriesQuery.data?.categories || []) as Category[]), [categoriesQuery.data?.categories]);
  const isLoading = categoriesQuery.isLoading;
  const isSaving = createCategoryMutation.isPending || updateCategoryMutation.isPending;
  const isReordering = reorderCategoriesMutation.isPending;

  const updateParams = (updates: Record<string, string | undefined>) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([key, value]) => {
      if (value) next.set(key, value);
      else next.delete(key);
    });
    setSearchParams(next);
  };

  const categoryById = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);
  const childrenByParent = useMemo(() => {
    const map = new Map<string, Category[]>();
    categories.forEach((category) => {
      if (!category.parentId) return;
      const items = map.get(category.parentId) || [];
      items.push(category);
      map.set(category.parentId, sortCategories(items));
    });
    return map;
  }, [categories]);

  const filteredCategories = useMemo(() => {
    return categories.filter((category) => {
      const children = childrenByParent.get(category.id) || [];
      const isChild = Boolean(category.parentId && categoryById.has(category.parentId));
      const isLeaf = isChild || children.length === 0;

      if (typeFilter !== 'all' && category.categoryType !== typeFilter) {
        return false;
      }
      if (scope === 'top_level' && isChild) {
        return false;
      }
      if (scope === 'children' && !isChild) {
        return false;
      }
      if (scope === 'leaf' && !isLeaf) {
        return false;
      }
      return categoryMatchesSearch(category, search);
    });
  }, [categories, categoryById, childrenByParent, scope, search, typeFilter]);

  const groupedCategories = useMemo(() => {
    const groups = new Map<string, { parent: Category; children: Category[] }>();

    filteredCategories.forEach((category) => {
      const realParent = category.parentId ? categoryById.get(category.parentId) : undefined;
      if (realParent) {
        const existing = groups.get(realParent.id) || { parent: realParent, children: [] };
        existing.children.push(category);
        existing.children = sortCategories(existing.children);
        groups.set(realParent.id, existing);
        return;
      }

      const existing = groups.get(category.id) || { parent: category, children: [] };
      existing.parent = category;
      groups.set(category.id, existing);
    });

    return sortCategories(Array.from(groups.values()).map((group) => group.parent)).map((parent) => {
      const group = groups.get(parent.id) || { parent, children: [] };
      return {
        parent: group.parent,
        children: sortCategories(group.children),
      };
    });
  }, [categoryById, filteredCategories]);

  const handleSaveCategory = async (data: CategoryInput, categoryId?: string) => {
    setModalError(null);

    try {
      if (categoryId) {
        await updateCategoryMutation.mutateAsync({
          categoryId,
          updates: data,
        });
      } else {
        await createCategoryMutation.mutateAsync(data);
      }
      setIsModalOpen(false);
      setEditingCategory(null);
      setModalError(null);
    } catch (err: unknown) {
      console.error('Failed to save category:', err);
      const message = err instanceof Error ? err.message : 'Failed to save category';
      if (message.toLowerCase().includes('category key already exists')) {
        setModalError('Category key already exists. Use another key or enable "Show inactive categories" and reactivate the existing one.');
      } else {
        setModalError(message);
      }
    }
  };

  const handleDeleteCategory = async (category: Category) => {
    const questionWarning =
      category.questionCount > 0 ? `\n\nThis category has ${category.questionCount} questions.` : '';
    if (!(await confirmAction({
      title: 'Delete category?',
      message: `Are you sure you want to delete "${category.name}"?${questionWarning}`,
      confirmLabel: 'Delete',
      tone: 'danger',
    }))) {
      return;
    }

    try {
      const response = await deleteCategoryMutation.mutateAsync({
        categoryId: category.id,
        force: category.questionCount > 0,
      });

      if (!response.success && response.error) {
        setError(response.error);
        return;
      }
    } catch (err) {
      console.error('Failed to delete category:', err);
      setError('Failed to delete category.');
    }
  };

  const handleToggleActive = async (category: Category) => {
    try {
      await updateCategoryMutation.mutateAsync({
        categoryId: category.id,
        updates: { isActive: !category.isActive },
      });
    } catch (err) {
      console.error('Failed to toggle category:', err);
      setError('Failed to update category.');
    }
  };

  const handleMoveCategory = async (category: Category, direction: 'up' | 'down') => {
    const siblingKey = category.parentId || '__root__';
    const siblings = categories.filter((item) => (item.parentId || '__root__') === siblingKey);
    const currentIndex = siblings.findIndex((item) => item.id === category.id);
    const nextIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;

    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= siblings.length) {
      return;
    }

    const nextSiblings = [...siblings];
    const temp = nextSiblings[currentIndex];
    nextSiblings[currentIndex] = nextSiblings[nextIndex];
    nextSiblings[nextIndex] = temp;

    try {
      setError(null);
      await reorderCategoriesMutation.mutateAsync(
        nextSiblings.map((item, index) => ({
          categoryId: item.id,
          displayOrder: index + 1,
        })),
      );
    } catch (reorderError) {
      console.error('Failed to reorder categories:', reorderError);
      setError(reorderError instanceof Error ? reorderError.message : 'Failed to reorder categories.');
    }
  };

  const openCreateModal = () => {
    setEditingCategory(null);
    setModalError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (category: Category) => {
    setEditingCategory(category);
    setModalError(null);
    setIsModalOpen(true);
  };

  const activeCategories = categories.filter((c) => c.isActive);
  const parentCategories = categories.filter((category) => (childrenByParent.get(category.id) || []).length > 0);
  const leafCategories = categories.filter((category) => (childrenByParent.get(category.id) || []).length === 0);

  return (
    <div className="page-shell">
      <PageHeader
        title="Categories"
        subtitle="Organize quiz taxonomy by parent groups, leaf topics, and match rules"
        actions={(
          <Button onClick={openCreateModal}>+ Create Category</Button>
        )}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <StatCard title="Total Categories" value={categories.length} tone="primary" />
        <StatCard title="Parent Groups" value={parentCategories.length} tone="info" />
        <StatCard title="Leaf Topics" value={leafCategories.length} tone="warning" />
        <StatCard title="Active Categories" value={activeCategories.length} tone="success" />
      </div>

      <Section title="Workspace Filters" subtitle="Search and narrow the taxonomy before editing or reordering">
        <div className="flex flex-wrap gap-4">
          <div className="min-w-[220px] flex-1">
            <Input
              value={searchParams.get('search') || ''}
              onChange={(event) => updateParams({ search: event.target.value || undefined })}
              placeholder="Search by name, key, or description..."
            />
          </div>
          <Select
            value={viewMode}
            onChange={(event) => updateParams({ view: event.target.value === 'all' ? 'all' : undefined })}
          >
            <option value="grouped">Grouped View</option>
            <option value="all">All Categories</option>
          </Select>
          <Select
            value={scope}
            onChange={(event) => updateParams({ scope: event.target.value === 'all' ? undefined : event.target.value })}
          >
            <option value="all">All Scopes</option>
            <option value="top_level">Top Level</option>
            <option value="children">Children Only</option>
            <option value="leaf">Leaf Topics</option>
          </Select>
          <Select
            value={typeFilter}
            onChange={(event) => updateParams({ categoryType: event.target.value === 'all' ? undefined : event.target.value })}
          >
            <option value="all">All Types</option>
            <option value="normal">Normal</option>
            <option value="vocabulary">Vocabulary</option>
          </Select>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(event) => updateParams({ showInactive: event.target.checked ? '1' : undefined })}
              className="rounded border-slate-300"
            />
            Show inactive
          </label>
        </div>
      </Section>

      <SavedViewsToolbar
        storageKey="categories"
        searchParams={searchParams}
        onApply={(next) => setSearchParams(next)}
      />

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {categoriesQuery.error && (
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-sm text-yellow-700">
            Showing the latest successful result. Refresh warning: {categoriesQuery.error.message}
          </p>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Spinner />
        </div>
      ) : filteredCategories.length === 0 ? (
        <EmptyState
          title="No categories match the current filters"
          subtitle="Try clearing search or widening the scope filters."
        />
      ) : viewMode === 'all' ? (
        <DataTableShell>
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Category</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Parent</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Questions</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Status</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase text-slate-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {filteredCategories.map((category) => {
                const parent = category.parentId ? categoryById.get(category.parentId) : null;
                return (
                  <tr key={category.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{category.icon || '📁'}</span>
                        <div>
                          <p className="text-sm font-medium text-slate-900">{category.name}</p>
                          <p className="text-xs text-slate-500">{category.categoryKey}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">{parent?.name || 'Top level'}</td>
                    <td className="px-4 py-3 text-sm text-slate-600 capitalize">{category.categoryType}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{category.questionCount}</td>
                    <td className="px-4 py-3">
                      <span className={`badge ${category.isActive ? 'badge-success' : 'badge-error'}`}>
                        {category.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <CategoryRowActions
                        category={category}
                        onEdit={openEditModal}
                        onToggleActive={handleToggleActive}
                        onDelete={handleDeleteCategory}
                        onMoveUp={() => void handleMoveCategory(category, 'up')}
                        onMoveDown={() => void handleMoveCategory(category, 'down')}
                        isReordering={isReordering}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </DataTableShell>
      ) : (
        <div className="space-y-4">
          {groupedCategories.map((group) => (
            <div key={group.parent.id} className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{group.parent.icon || '📁'}</span>
                    <div>
                      <p className="text-lg font-semibold text-slate-900">{group.parent.name}</p>
                      <p className="text-sm text-slate-500">
                        {group.parent.categoryKey} • {group.children.length} child{group.children.length === 1 ? '' : 'ren'} • {group.parent.questionCount} direct questions
                      </p>
                    </div>
                  </div>
                  {group.parent.description ? (
                    <p className="mt-2 text-sm text-slate-600">{group.parent.description}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`badge ${group.parent.isActive ? 'badge-success' : 'badge-error'}`}>
                    {group.parent.isActive ? 'Active' : 'Inactive'}
                  </span>
                  <CategoryRowActions
                    category={group.parent}
                    onEdit={openEditModal}
                    onToggleActive={handleToggleActive}
                    onDelete={handleDeleteCategory}
                    onMoveUp={() => void handleMoveCategory(group.parent, 'up')}
                    onMoveDown={() => void handleMoveCategory(group.parent, 'down')}
                    isReordering={isReordering}
                  />
                </div>
              </div>

              {group.children.length > 0 ? (
                <div className="divide-y divide-slate-100">
                  {group.children.map((child) => (
                    <div key={child.id} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{child.icon || '•'}</span>
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{child.name}</p>
                            <p className="text-xs text-slate-500">
                              {child.categoryKey} • {child.categoryType} • {child.questionCount} questions • {child.questionsPerMatch} q/match
                            </p>
                          </div>
                        </div>
                        {child.description ? <p className="mt-2 text-sm text-slate-600">{child.description}</p> : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`badge ${child.isActive ? 'badge-success' : 'badge-error'}`}>
                          {child.isActive ? 'Active' : 'Inactive'}
                        </span>
                        <CategoryRowActions
                          category={child}
                          onEdit={openEditModal}
                          onToggleActive={handleToggleActive}
                          onDelete={handleDeleteCategory}
                          onMoveUp={() => void handleMoveCategory(child, 'up')}
                          onMoveDown={() => void handleMoveCategory(child, 'down')}
                          isReordering={isReordering}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-5 py-4 text-sm text-slate-500">
                  No child topics under this category yet.
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <CategoryModal
        isOpen={isModalOpen}
        category={editingCategory}
        categories={categories}
        onClose={() => {
          setIsModalOpen(false);
          setEditingCategory(null);
          setModalError(null);
        }}
        onSave={handleSaveCategory}
        isSaving={isSaving}
        error={modalError}
      />
    </div>
  );
}

function CategoryRowActions({
  category,
  onEdit,
  onToggleActive,
  onDelete,
  onMoveUp,
  onMoveDown,
  isReordering,
}: {
  category: Category;
  onEdit: (category: Category) => void;
  onToggleActive: (category: Category) => void;
  onDelete: (category: Category) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isReordering: boolean;
}) {
  return (
    <div className="flex items-center justify-end gap-2">
      <button
        type="button"
        onClick={onMoveUp}
        disabled={isReordering}
        className="rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 disabled:opacity-40"
        title="Move up"
      >
        ↑
      </button>
      <button
        type="button"
        onClick={onMoveDown}
        disabled={isReordering}
        className="rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 disabled:opacity-40"
        title="Move down"
      >
        ↓
      </button>
      <button
        type="button"
        onClick={() => onEdit(category)}
        className="rounded px-2 py-1 text-xs text-primary-600 hover:bg-primary-50"
      >
        Edit
      </button>
      <button
        type="button"
        onClick={() => onToggleActive(category)}
        className="rounded px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
      >
        {category.isActive ? 'Deactivate' : 'Activate'}
      </button>
      <button
        type="button"
        onClick={() => onDelete(category)}
        className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
      >
        Delete
      </button>
    </div>
  );
}
