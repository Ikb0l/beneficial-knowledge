// Home Page Store - Fetches banners, featured items, and section config from server
import { create } from 'zustand';
import nakama from '../shared/lib/nakama';

export interface HomeBanner {
  id: string;
  title: string;
  body?: string;
  imageUrl?: string;
  actionUrl?: string;
  actionType: 'url' | 'category' | 'tournament' | 'screen';
  actionData?: Record<string, unknown>;
  displayOrder: number;
}

export interface FeaturedItem {
  id: string;
  itemType: 'category' | 'tournament';
  itemId: string;
  itemName?: string;
  categoryKey?: string;
  categoryIcon?: string;
  tournamentStatus?: string;
  displayOrder: number;
}

export interface HomeSection {
  sectionKey: string;
  name: string;
  isVisible: boolean;
  displayOrder: number;
}

interface HomeConfig {
  banners: HomeBanner[];
  featuredCategories: FeaturedItem[];
  featuredTournaments: FeaturedItem[];
  sections: HomeSection[];
}

interface HomeState {
  config: HomeConfig | null;
  isLoading: boolean;
  error: string | null;
  lastFetched: number | null;
  fetchHomeConfig: () => Promise<void>;
  getBanners: () => HomeBanner[];
  getFeaturedCategories: () => FeaturedItem[];
  getSectionVisibility: (sectionKey: string) => boolean;
  getSectionOrder: () => HomeSection[];
}

const DEFAULT_SECTIONS: HomeSection[] = [
  { sectionKey: 'banners', name: 'Announcement Banners', isVisible: true, displayOrder: 1 },
  { sectionKey: 'featured_categories', name: 'Featured Categories', isVisible: true, displayOrder: 2 },
  { sectionKey: 'quick_match', name: 'Quick Match', isVisible: true, displayOrder: 3 },
  { sectionKey: 'featured_tournaments', name: 'Featured Tournaments', isVisible: true, displayOrder: 4 },
  { sectionKey: 'leaderboard_preview', name: 'Leaderboard Preview', isVisible: true, displayOrder: 5 },
  { sectionKey: 'daily_challenge', name: 'Daily Challenge', isVisible: true, displayOrder: 6 },
];

export const useHomeStore = create<HomeState>((set, get) => ({
  config: null,
  isLoading: false,
  error: null,
  lastFetched: null,

  fetchHomeConfig: async () => {
    // Cache for 2 minutes
    const now = Date.now();
    const lastFetched = get().lastFetched;
    if (lastFetched && now - lastFetched < 2 * 60 * 1000) {
      return;
    }

    try {
      set({ isLoading: true, error: null });
      const data = await nakama.rpc<{
        banners: HomeBanner[];
        featuredCategories: FeaturedItem[];
        featuredTournaments: FeaturedItem[];
        sections: HomeSection[];
      }>('get_home_config', {});

      const config: HomeConfig = {
        banners: (data.banners || []).sort((a, b) => a.displayOrder - b.displayOrder),
        featuredCategories: (data.featuredCategories || []).sort((a, b) => a.displayOrder - b.displayOrder),
        featuredTournaments: (data.featuredTournaments || []).sort((a, b) => a.displayOrder - b.displayOrder),
        sections: (data.sections || DEFAULT_SECTIONS).sort((a, b) => a.displayOrder - b.displayOrder),
      };

      set({ config, isLoading: false, lastFetched: now });
    } catch (error) {
      console.error('Error fetching home config:', error);
      set({
        config: {
          banners: [],
          featuredCategories: [],
          featuredTournaments: [],
          sections: DEFAULT_SECTIONS,
        },
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to load home config',
        lastFetched: now,
      });
    }
  },

  getBanners: () => {
    const { config } = get();
    return config?.banners || [];
  },

  getFeaturedCategories: () => {
    const { config } = get();
    return config?.featuredCategories || [];
  },

  getSectionVisibility: (sectionKey: string) => {
    const { config } = get();
    const section = config?.sections.find(s => s.sectionKey === sectionKey);
    return section?.isVisible ?? true;
  },

  getSectionOrder: () => {
    const { config } = get();
    return (config?.sections || DEFAULT_SECTIONS).sort((a, b) => a.displayOrder - b.displayOrder);
  },
}));

export default useHomeStore;
