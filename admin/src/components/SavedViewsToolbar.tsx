import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Input } from './ui';
import {
  useAdminPreferencesQuery,
  useDeleteAdminSavedViewMutation,
  useUpsertAdminSavedViewMutation,
} from '../domains/preferences/api';
import {
  clearSavedViews,
  deleteSavedView,
  loadSavedViews,
  normalizeSearchParams,
  upsertSavedView,
} from '../lib/savedViews';

interface SavedViewsToolbarProps {
  storageKey: string;
  searchParams: URLSearchParams;
  onApply: (next: URLSearchParams) => void;
}

export default function SavedViewsToolbar({
  storageKey,
  searchParams,
  onApply,
}: SavedViewsToolbarProps) {
  const [localViews, setLocalViews] = useState(() => loadSavedViews(storageKey));
  const [draftLabel, setDraftLabel] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const migrationAttemptedRef = useRef(false);
  const preferencesQuery = useAdminPreferencesQuery();
  const upsertMutation = useUpsertAdminSavedViewMutation();
  const deleteMutation = useDeleteAdminSavedViewMutation();
  const activeQuery = useMemo(() => normalizeSearchParams(searchParams), [searchParams]);
  const remoteViews = preferencesQuery.data?.savedViews?.[storageKey] || [];
  const shouldShowLocalFallback = preferencesQuery.isSuccess && remoteViews.length === 0 && localViews.length > 0;
  const views = preferencesQuery.isSuccess
    ? (shouldShowLocalFallback ? localViews : remoteViews)
    : localViews;
  const isMutating = upsertMutation.isPending || deleteMutation.isPending;

  useEffect(() => {
    setLocalViews(loadSavedViews(storageKey));
  }, [storageKey]);

  useEffect(() => {
    if (!preferencesQuery.isSuccess || remoteViews.length > 0 || localViews.length === 0 || migrationAttemptedRef.current) {
      return;
    }

    migrationAttemptedRef.current = true;
    let isCancelled = false;

    void (async () => {
      try {
        // Old saved views lived only in localStorage; migrate them once per page key.
        for (const view of [...localViews].reverse()) {
          await upsertMutation.mutateAsync({
            storageKey,
            label: view.label,
            query: view.query,
          });
        }
        if (isCancelled) return;
        clearSavedViews(storageKey);
        setLocalViews([]);
      } catch {
        if (!isCancelled) {
          migrationAttemptedRef.current = false;
        }
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [localViews, preferencesQuery.isSuccess, remoteViews.length, storageKey, upsertMutation]);

  const handleSave = async () => {
    if (preferencesQuery.isSuccess) {
      await upsertMutation.mutateAsync({
        storageKey,
        label: draftLabel.trim(),
        query: activeQuery,
      });
      clearSavedViews(storageKey);
      setLocalViews([]);
    } else {
      const next = upsertSavedView(storageKey, draftLabel, searchParams);
      setLocalViews(next);
    }

    setDraftLabel('');
    setIsAdding(false);
  };

  const handleDelete = async (viewId: string) => {
    if (preferencesQuery.isSuccess) {
      await deleteMutation.mutateAsync({ storageKey, viewId });
      return;
    }

    setLocalViews(deleteSavedView(storageKey, viewId));
  };

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Saved Views</p>
          <p className="mt-1 text-sm text-slate-600">Store reusable filter presets for this page.</p>
        </div>
        {isAdding ? (
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={draftLabel}
              onChange={(event) => setDraftLabel(event.target.value)}
              placeholder="View name"
              className="w-48"
            />
            <Button size="sm" onClick={() => void handleSave()} disabled={!draftLabel.trim() || isMutating}>
              Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setDraftLabel('');
                setIsAdding(false);
              }}
              disabled={isMutating}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="secondary" onClick={() => setIsAdding(true)} disabled={isMutating}>
            Save Current View
          </Button>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {preferencesQuery.isLoading && localViews.length === 0 ? (
          <span className="text-sm text-slate-500">Loading saved views...</span>
        ) : views.length === 0 ? (
          <span className="text-sm text-slate-500">No saved views yet.</span>
        ) : views.map((view) => {
          const isActive = view.query === activeQuery;
          return (
            <div
              key={view.id}
              className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm ${
                isActive
                  ? 'border-primary-200 bg-primary-50 text-primary-800'
                  : 'border-slate-200 bg-slate-50 text-slate-700'
              }`}
            >
              <button
                type="button"
                onClick={() => onApply(new URLSearchParams(view.query))}
                className="font-medium"
              >
                {view.label}
              </button>
              <button
                type="button"
                onClick={() => void handleDelete(view.id)}
                className="rounded-full px-1 text-slate-400 hover:bg-white hover:text-rose-600"
                aria-label={`Delete ${view.label}`}
                disabled={isMutating}
              >
                x
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
