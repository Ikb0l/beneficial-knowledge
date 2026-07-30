// Category Store - supports dynamic categories from server
import { create } from 'zustand';
import nakama from '../shared/lib/nakama';
import type { Category } from '../shared/types/game';

const CATEGORY_STALE_MS = 30_000;

interface FetchCategoriesOptions {
  force?: boolean;
}

interface CategoryState {
  categories: Category[];
  isLoading: boolean;
  error: string | null;
  lastFetchedAt: number | null;
  fetchCategories: (options?: FetchCategoriesOptions) => Promise<void>;
  invalidateCategories: () => void;
}

// Server category response type
interface ServerCategory {
  id: string;
  name?: string;
  icon?: string;
  description?: string;
  iconUrl?: string;
  parentId?: string | null;
  categoryType?: 'normal' | 'vocabulary';
  questionsPerMatch?: number;
  questionsPerMatchOverride?: number | null;
  useGlobalQuestionCount?: boolean;
  timePerQuestion?: number;
}

const ICON_ALIAS_TO_EMOJI: Record<string, string> = {
  BOOK: '📚',
  SCROLL: '📜',
  GLOBE: '🌍',
  SPARKLES: '✨',
};

function normalizeCategoryIcon(icon?: string): string {
  const raw = typeof icon === 'string' ? icon.trim() : '';
  if (!raw) return '📚';
  return ICON_ALIAS_TO_EMOJI[raw.toUpperCase()] || raw;
}

function mapServerCategories(serverCategories: ServerCategory[]): Category[] {
  return serverCategories.map((category) => ({
    id: category.id,
    name: category.name || category.id,
    icon: normalizeCategoryIcon(category.icon),
    description: category.description,
    iconUrl: category.iconUrl,
    parentId: category.parentId ?? null,
    categoryType: category.categoryType === 'vocabulary' ? 'vocabulary' : 'normal',
    questionsPerMatch: Number.isFinite(Number(category.questionsPerMatch))
      ? Math.max(1, Math.floor(Number(category.questionsPerMatch)))
      : undefined,
    questionsPerMatchOverride: category.questionsPerMatchOverride ?? null,
    useGlobalQuestionCount: category.useGlobalQuestionCount !== false,
    timePerQuestion: Number.isFinite(Number(category.timePerQuestion))
      ? Math.max(5, Math.floor(Number(category.timePerQuestion)))
      : undefined,
  }));
}

let inFlightFetch: Promise<Category[]> | null = null;

export const useCategoryStore = create<CategoryState>((set, get) => ({
  categories: [],
  isLoading: false,
  error: null,
  lastFetchedAt: null,

  fetchCategories: async (options) => {
    const force = options?.force === true;
    const state = get();
    const now = Date.now();
    const isFresh = !!state.lastFetchedAt && now - state.lastFetchedAt < CATEGORY_STALE_MS;

    if (!force && state.categories.length > 0 && isFresh) {
      return;
    }

    if (inFlightFetch) {
      try {
        const categories = await inFlightFetch;
        set({ categories, isLoading: false, error: null, lastFetchedAt: Date.now() });
      } catch (error) {
        set({
          isLoading: false,
          error: error instanceof Error ? error.message : 'Failed to load categories',
        });
      }
      return;
    }

    set({ isLoading: true, error: null });
    inFlightFetch = (async () => {
      const data = await nakama.rpc<{ categories: ServerCategory[] }>(
        'get_categories',
        {}
      );
      return mapServerCategories(data.categories || []);
    })();

    try {
      const categories = await inFlightFetch;
      set({ categories, isLoading: false, error: null, lastFetchedAt: Date.now() });
    } catch (error) {
      console.error('Error fetching categories:', error);
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to load categories',
      });
    } finally {
      inFlightFetch = null;
    }
  },

  invalidateCategories: () => {
    inFlightFetch = null;
    set({ lastFetchedAt: null });
  },
}));

export default useCategoryStore;
