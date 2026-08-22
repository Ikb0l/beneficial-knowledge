// Category definitions - fallback data for when server is unavailable
import type { Category, DefaultCategoryKey } from '../types/game';

// Fallback categories - used when server categories unavailable
export const DEFAULT_CATEGORIES: Record<DefaultCategoryKey, Category> = {
  prophets: {
    id: 'prophets',
    name: 'Lives of the Prophets',
    icon: '📖',
    description: 'From Adam to Isa (AS)',
  },
  muhammad: {
    id: 'muhammad',
    name: 'Prophet Muhammad ﷺ',
    icon: '🕌',
    description: 'Seerah of the Final Messenger',
  },
  abu_bakr: {
    id: 'abu_bakr',
    name: 'Abu Bakr As-Siddiq',
    icon: '⭐',
    description: 'The First Caliph',
  },
  umar: {
    id: 'umar',
    name: 'Umar ibn Al-Khattab',
    icon: '⚔️',
    description: 'The Second Caliph',
  },
  uthman: {
    id: 'uthman',
    name: 'Uthman ibn Affan',
    icon: '📚',
    description: 'The Third Caliph',
  },
  ali: {
    id: 'ali',
    name: 'Ali ibn Abi Talib',
    icon: '🦁',
    description: 'The Fourth Caliph',
  },
  umar_ii_saladin: {
    id: 'umar_ii_saladin',
    name: 'Umar II & Saladin',
    icon: '🏰',
    description: 'Great Muslim Leaders',
  },
};

export const CATEGORY_LIST: Category[] = Object.values(DEFAULT_CATEGORIES);

// For backwards compatibility
export const CATEGORIES = DEFAULT_CATEGORIES;

export const getCategoryById = (id: string): Category | undefined => {
  return DEFAULT_CATEGORIES[id as DefaultCategoryKey];
};

// ============================================================================
// CATEGORY UI STYLES - Centralized styling for category display across the app
// ============================================================================

// Category icons mapping for default categories
export const CATEGORY_ICONS: Record<DefaultCategoryKey, string> = {
  prophets: '📖',
  muhammad: '🕌',
  abu_bakr: '⭐',
  umar: '⚔️',
  uthman: '📚',
  ali: '🦁',
  umar_ii_saladin: '🏰',
};

// Category gradient colors for profile/stats display
export const CATEGORY_COLORS: Record<DefaultCategoryKey, string> = {
  prophets: 'from-purple-500/30 to-purple-500/10',
  muhammad: 'from-cyan-500/30 to-cyan-500/10',
  abu_bakr: 'from-pink-500/30 to-pink-500/10',
  umar: 'from-amber-500/30 to-amber-500/10',
  uthman: 'from-emerald-500/30 to-emerald-500/10',
  ali: 'from-violet-500/30 to-violet-500/10',
  umar_ii_saladin: 'from-red-500/30 to-red-500/10',
};

// Topic colors for badges (indexed by position)
export const TOPIC_COLORS: Record<number, { bg: string; text: string; border: string }> = {
  0: { bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/30' },
  1: { bg: 'bg-cyan-500/20', text: 'text-cyan-400', border: 'border-cyan-500/30' },
  2: { bg: 'bg-pink-500/20', text: 'text-pink-400', border: 'border-pink-500/30' },
  3: { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/30' },
  4: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  5: { bg: 'bg-violet-500/20', text: 'text-violet-400', border: 'border-violet-500/30' },
  6: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30' },
};

// Category order for default categories (used for styling)
export const DEFAULT_CATEGORY_ORDER: DefaultCategoryKey[] = [
  'prophets',
  'muhammad',
  'abu_bakr',
  'umar',
  'uthman',
  'ali',
  'umar_ii_saladin',
];

// For backwards compatibility
export const CATEGORY_ORDER = DEFAULT_CATEGORY_ORDER;

// Helper functions - work with both default and dynamic categories
export const getCategoryIcon = (categoryId: string): string => {
  return CATEGORY_ICONS[categoryId as DefaultCategoryKey] || '📝';
};

export const getCategoryColor = (categoryId: string): string => {
  return CATEGORY_COLORS[categoryId as DefaultCategoryKey] || 'from-white/10 to-white/5';
};

export const getCategoryTopicColor = (categoryId: string): { bg: string; text: string; border: string } => {
  const index = DEFAULT_CATEGORY_ORDER.indexOf(categoryId as DefaultCategoryKey);
  // For dynamic categories, use index based on hash of categoryId for consistent coloring
  const colorIndex = index >= 0 ? index : Math.abs(categoryId.split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % 7;
  return TOPIC_COLORS[colorIndex] || TOPIC_COLORS[0];
};
