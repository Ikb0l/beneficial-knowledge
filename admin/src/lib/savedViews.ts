export interface AdminSavedView {
  id: string;
  label: string;
  query: string;
  updatedAt: number;
}

export const MAX_SAVED_VIEWS = 8;

export function getSavedViewsStorageKey(storageKey: string) {
  return `admin_saved_views:${storageKey}`;
}

export function normalizeSearchParams(searchParams: URLSearchParams) {
  const entries = Array.from(searchParams.entries())
    .filter(([key]) => key !== 'page')
    .sort(([keyA, valueA], [keyB, valueB]) => {
      if (keyA === keyB) return valueA.localeCompare(valueB);
      return keyA.localeCompare(keyB);
    });

  return new URLSearchParams(entries).toString();
}

export function loadSavedViews(storageKey: string): AdminSavedView[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(getSavedViewsStorageKey(storageKey));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is AdminSavedView => (
        Boolean(item)
        && typeof item === 'object'
        && typeof (item as AdminSavedView).id === 'string'
        && typeof (item as AdminSavedView).label === 'string'
        && typeof (item as AdminSavedView).query === 'string'
        && typeof (item as AdminSavedView).updatedAt === 'number'
      ))
      .slice(0, MAX_SAVED_VIEWS);
  } catch {
    return [];
  }
}

export function persistSavedViews(storageKey: string, views: AdminSavedView[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(getSavedViewsStorageKey(storageKey), JSON.stringify(views.slice(0, MAX_SAVED_VIEWS)));
  } catch {
    // Ignore storage failures.
  }
}

export function clearSavedViews(storageKey: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(getSavedViewsStorageKey(storageKey));
  } catch {
    // Ignore storage failures.
  }
}

export function upsertSavedView(
  storageKey: string,
  label: string,
  searchParams: URLSearchParams,
) {
  const normalizedQuery = normalizeSearchParams(searchParams);
  const trimmedLabel = label.trim();
  if (!trimmedLabel) return loadSavedViews(storageKey);

  const existing = loadSavedViews(storageKey);
  const now = Date.now();
  const next = existing.filter((view) => view.label.toLowerCase() !== trimmedLabel.toLowerCase());
  next.unshift({
    id: typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${now}`,
    label: trimmedLabel,
    query: normalizedQuery,
    updatedAt: now,
  });
  persistSavedViews(storageKey, next);
  return next;
}

export function deleteSavedView(storageKey: string, viewId: string) {
  const next = loadSavedViews(storageKey).filter((view) => view.id !== viewId);
  persistSavedViews(storageKey, next);
  return next;
}
