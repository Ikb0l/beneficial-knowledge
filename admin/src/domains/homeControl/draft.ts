import type { FeaturedItem, HomeBanner, HomeSection } from '../../types';

export interface TournamentSummary {
  id: string;
  name: string;
  status: string;
}

export interface HomeControlCategory {
  id: string;
  categoryKey: string;
  name: string;
  icon: string;
  isActive: boolean;
  questionCount: number;
}

export type BannerActionType = HomeBanner['actionType'];

export interface DraftBanner {
  id: string | null;
  clientId: string;
  title: string;
  body: string;
  imageUrl: string;
  actionUrl: string;
  actionType: BannerActionType;
  displayOrder: number;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

export interface DraftFeaturedItem {
  itemType: 'category' | 'tournament';
  itemId: string;
  displayOrder: number;
}

export interface DraftSection {
  sectionKey: string;
  name: string;
  isVisible: boolean;
  displayOrder: number;
}

export interface HomeControlDraft {
  banners: DraftBanner[];
  featuredItems: DraftFeaturedItem[];
  sections: DraftSection[];
}

export interface HomeControlDraftWarning {
  id: string;
  tone: 'info' | 'warning' | 'danger';
  title: string;
  description: string;
}

interface BannerComparable {
  title: string;
  body?: string;
  imageUrl?: string;
  actionUrl?: string;
  actionType: BannerActionType;
  displayOrder: number;
  startDate?: string | null;
  endDate?: string | null;
  isActive: boolean;
}

export function sortByDisplayOrder<T extends { displayOrder: number }>(items: T[]) {
  return [...items].sort((left, right) => {
    if (left.displayOrder === right.displayOrder) return 0;
    return left.displayOrder - right.displayOrder;
  });
}

export function reindexFeaturedItems(items: DraftFeaturedItem[]) {
  return items.map((item, index) => ({
    ...item,
    displayOrder: index + 1,
  }));
}

function createDraftBanner(banner: HomeBanner): DraftBanner {
  return {
    id: banner.id,
    clientId: banner.id,
    title: banner.title,
    body: banner.body || '',
    imageUrl: banner.imageUrl || '',
    actionUrl: banner.actionUrl || '',
    actionType: banner.actionType,
    displayOrder: banner.displayOrder,
    startDate: banner.startDate || '',
    endDate: banner.endDate || '',
    isActive: banner.isActive,
  };
}

export function normalizeBannerComparable(
  banner: BannerComparable,
) {
  return {
    title: banner.title.trim(),
    body: banner.body?.trim() || '',
    imageUrl: banner.imageUrl?.trim() || '',
    actionUrl: banner.actionUrl?.trim() || '',
    actionType: banner.actionType,
    displayOrder: Number(banner.displayOrder) || 0,
    startDate: banner.startDate || '',
    endDate: banner.endDate || '',
    isActive: banner.isActive,
  };
}

function findDuplicateOrders(values: number[]) {
  const counts = new Map<number, number>();
  values.forEach((value) => {
    counts.set(value, (counts.get(value) || 0) + 1);
  });
  return Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([value]) => value)
    .sort((left, right) => left - right);
}

export function normalizeFeaturedComparable(items: DraftFeaturedItem[] | FeaturedItem[]) {
  return sortByDisplayOrder(items).map((item) => ({
    itemType: item.itemType,
    itemId: item.itemId,
    displayOrder: item.displayOrder,
  }));
}

export function normalizeSectionComparable(items: DraftSection[] | HomeSection[]) {
  return sortByDisplayOrder(items).map((section) => ({
    sectionKey: section.sectionKey,
    isVisible: section.isVisible,
    displayOrder: section.displayOrder,
  }));
}

export function normalizeDraftState(draft: HomeControlDraft) {
  return {
    banners: sortByDisplayOrder(draft.banners).map(normalizeBannerComparable),
    featuredItems: normalizeFeaturedComparable(draft.featuredItems),
    sections: normalizeSectionComparable(draft.sections),
  };
}

export function normalizeSnapshotState(
  banners: HomeBanner[],
  featuredItems: FeaturedItem[],
  sections: HomeSection[],
) {
  return {
    banners: sortByDisplayOrder(banners).map(normalizeBannerComparable),
    featuredItems: normalizeFeaturedComparable(featuredItems),
    sections: normalizeSectionComparable(sections),
  };
}

export function createHomeControlDraft(
  banners: HomeBanner[],
  featuredItems: FeaturedItem[],
  sections: HomeSection[],
): HomeControlDraft {
  return {
    banners: sortByDisplayOrder(banners).map(createDraftBanner),
    featuredItems: reindexFeaturedItems(
      sortByDisplayOrder(featuredItems)
        .filter((item) => item.itemType === 'category' || item.itemType === 'tournament')
        .map((item) => ({
          itemType: item.itemType,
          itemId: item.itemId,
          displayOrder: item.displayOrder,
        })),
    ),
    sections: sortByDisplayOrder(sections).map((section) => ({
      sectionKey: section.sectionKey,
      name: section.name,
      isVisible: section.isVisible,
      displayOrder: section.displayOrder,
    })),
  };
}

export function buildDraftWarnings(
  draft: HomeControlDraft,
  categories: HomeControlCategory[],
  tournaments: TournamentSummary[],
): HomeControlDraftWarning[] {
  const warnings: HomeControlDraftWarning[] = [];
  const activeBannerCount = draft.banners.filter((banner) => banner.isActive).length;
  const visibleSectionCount = draft.sections.filter((section) => section.isVisible).length;
  const featuredCategoryCount = draft.featuredItems.filter((item) => item.itemType === 'category').length;
  const featuredTournamentCount = draft.featuredItems.filter((item) => item.itemType === 'tournament').length;
  const activeCategories = categories.filter((item) => item.isActive).length;

  if (activeBannerCount === 0) {
    warnings.push({
      id: 'draft-no-active-banners',
      tone: 'warning',
      title: 'Draft has no active banners',
      description: 'The published home page would lose all active hero or announcement banners.',
    });
  }

  if (visibleSectionCount === 0) {
    warnings.push({
      id: 'draft-no-visible-sections',
      tone: 'danger',
      title: 'Draft hides every home section',
      description: 'Publishing this draft would remove all configurable home sections from the player homepage.',
    });
  }

  if (featuredCategoryCount === 0 && activeCategories > 0) {
    warnings.push({
      id: 'draft-no-featured-categories',
      tone: 'info',
      title: 'No featured categories in draft',
      description: 'Category discovery would rely entirely on other entry points.',
    });
  }

  if (featuredTournamentCount === 0 && tournaments.length > 0) {
    warnings.push({
      id: 'draft-no-featured-tournaments',
      tone: 'info',
      title: 'No featured tournaments in draft',
      description: 'Tournament discovery would not be curated on the homepage.',
    });
  }

  const duplicateBannerOrders = findDuplicateOrders(draft.banners.map((banner) => banner.displayOrder));
  if (duplicateBannerOrders.length > 0) {
    warnings.push({
      id: 'draft-duplicate-banner-order',
      tone: 'warning',
      title: 'Multiple banners share the same display order',
      description: `Duplicate banner order values: ${duplicateBannerOrders.join(', ')}.`,
    });
  }

  const invalidDateRanges = draft.banners.filter((banner) => {
    if (!banner.startDate || !banner.endDate) return false;
    return new Date(banner.startDate).getTime() > new Date(banner.endDate).getTime();
  });
  if (invalidDateRanges.length > 0) {
    warnings.push({
      id: 'draft-invalid-banner-dates',
      tone: 'danger',
      title: 'One or more banners have an invalid schedule',
      description: `${invalidDateRanges.length} banner${invalidDateRanges.length === 1 ? '' : 's'} start after their end date.`,
    });
  }

  const missingTargets = draft.banners.filter((banner) => (
    (banner.actionType === 'category' || banner.actionType === 'tournament' || banner.actionType === 'screen')
    && !banner.actionUrl.trim()
  ));
  if (missingTargets.length > 0) {
    warnings.push({
      id: 'draft-missing-banner-target',
      tone: 'warning',
      title: 'Some banners are missing an action target',
      description: `${missingTargets.length} banner${missingTargets.length === 1 ? '' : 's'} use an in-app action type without a target value.`,
    });
  }

  const invalidCategoryTargets = draft.banners.filter((banner) => (
    banner.actionType === 'category'
    && banner.actionUrl.trim()
    && !categories.some((category) => category.id === banner.actionUrl.trim() || category.categoryKey === banner.actionUrl.trim())
  ));
  if (invalidCategoryTargets.length > 0) {
    warnings.push({
      id: 'draft-missing-category-target',
      tone: 'warning',
      title: 'Some banner category targets do not resolve',
      description: `${invalidCategoryTargets.length} banner${invalidCategoryTargets.length === 1 ? '' : 's'} reference a category key or id that is not in the current catalog.`,
    });
  }

  const invalidTournamentTargets = draft.banners.filter((banner) => (
    banner.actionType === 'tournament'
    && banner.actionUrl.trim()
    && !tournaments.some((tournament) => tournament.id === banner.actionUrl.trim())
  ));
  if (invalidTournamentTargets.length > 0) {
    warnings.push({
      id: 'draft-missing-tournament-target',
      tone: 'warning',
      title: 'Some banner tournament targets do not resolve',
      description: `${invalidTournamentTargets.length} banner${invalidTournamentTargets.length === 1 ? '' : 's'} reference a tournament id that is not available in the snapshot.`,
    });
  }

  return warnings;
}

export function computeBannerDiff(liveBanners: HomeBanner[], draftBanners: DraftBanner[]) {
  const liveById = new Map(liveBanners.map((banner) => [banner.id, banner]));
  const retainedIds = new Set<string>();
  let created = 0;
  let updated = 0;

  draftBanners.forEach((banner) => {
    if (banner.id && liveById.has(banner.id)) {
      retainedIds.add(banner.id);
      const liveBanner = liveById.get(banner.id);
      if (liveBanner && JSON.stringify(normalizeBannerComparable(liveBanner)) !== JSON.stringify(normalizeBannerComparable(banner))) {
        updated += 1;
      }
      return;
    }
    created += 1;
  });

  const deleted = liveBanners.filter((banner) => !retainedIds.has(banner.id)).length;
  return { created, updated, deleted };
}

export function getFeaturedItemLabel(
  item: DraftFeaturedItem | FeaturedItem,
  categories: HomeControlCategory[],
  tournaments: TournamentSummary[],
) {
  if (item.itemType === 'category') {
    const category = categories.find((entry) => entry.id === item.itemId);
    return category?.name || `Category ${item.itemId}`;
  }
  const tournament = tournaments.find((entry) => entry.id === item.itemId);
  return tournament?.name || `Tournament ${item.itemId}`;
}
