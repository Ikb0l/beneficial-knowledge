import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  HOME_CONTROL_SNAPSHOT_QUERY_KEY,
  createBanner,
  deleteBanner,
  setFeaturedItems,
  updateBanner,
  updateHomeSections,
  useHomeControlSnapshot,
} from '../domains/homeControl/api';
import {
  buildDraftWarnings,
  computeBannerDiff,
  createHomeControlDraft,
  getFeaturedItemLabel,
  normalizeBannerComparable,
  normalizeDraftState,
  normalizeFeaturedComparable,
  normalizeSnapshotState,
  normalizeSectionComparable,
  reindexFeaturedItems,
  sortByDisplayOrder,
} from '../domains/homeControl/draft';
import type {
  BannerActionType,
  DraftBanner,
  DraftFeaturedItem,
  DraftSection,
  HomeControlCategory,
  HomeControlDraft,
  TournamentSummary,
} from '../domains/homeControl/draft';
import type { HomeBanner, HomeBannerInput, HomeSection, FeaturedItem } from '../types';
import { confirmAction } from '../lib/confirm';
import { getErrorMessage } from '../lib/errors';
import { toastError, toastSuccess } from '../lib/toast';
import Modal from '../components/Modal';
import { Button, EmptyState, PageHeader, Section } from '../components/ui';

type TabType = 'banners' | 'featured' | 'sections';

function createClientId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `draft-${Date.now()}`;
}

function buildBannerInput(banner: DraftBanner): HomeBannerInput {
  return {
    title: banner.title.trim(),
    body: banner.body.trim() || undefined,
    imageUrl: banner.imageUrl.trim() || undefined,
    actionUrl: banner.actionUrl.trim() || undefined,
    actionType: banner.actionType,
    displayOrder: Number(banner.displayOrder) || 0,
    startDate: banner.startDate || undefined,
    endDate: banner.endDate || undefined,
    isActive: banner.isActive,
  };
}

export default function HomeControlPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabType>('banners');
  const [draft, setDraft] = useState<HomeControlDraft | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const lastLiveStateRef = useRef<string | null>(null);
  const { data, isLoading, error, refetch, isFetching } = useHomeControlSnapshot();

  const banners = useMemo(() => ((data?.banners || []) as HomeBanner[]), [data?.banners]);
  const sections = useMemo(() => ((data?.sections || []) as HomeSection[]), [data?.sections]);
  const featuredItems = useMemo(() => ((data?.featuredItems || []) as FeaturedItem[]), [data?.featuredItems]);
  const categories = useMemo(() => ((data?.categories || []) as HomeControlCategory[]), [data?.categories]);
  const tournaments = useMemo(() => ((data?.tournaments || []) as TournamentSummary[]), [data?.tournaments]);
  const liveWarnings = useMemo(() => data?.warnings || [], [data?.warnings]);
  const liveStateKey = useMemo(() => (
    data
      ? JSON.stringify(normalizeSnapshotState(banners, featuredItems, sections))
      : null
  ), [banners, data, featuredItems, sections]);

  useEffect(() => {
    if (!data || !liveStateKey) return;
    const previousLiveState = lastLiveStateRef.current;
    const draftStateKey = draft ? JSON.stringify(normalizeDraftState(draft)) : null;

    if (!draft || draftStateKey === previousLiveState) {
      setDraft(createHomeControlDraft(banners, featuredItems, sections));
    }

    lastLiveStateRef.current = liveStateKey;
  }, [banners, data, draft, featuredItems, liveStateKey, sections]);

  const currentDraft = draft;
  const hasDraftChanges = useMemo(() => {
    if (!currentDraft || !data) return false;
    return JSON.stringify(normalizeDraftState(currentDraft)) !== JSON.stringify(normalizeSnapshotState(banners, featuredItems, sections));
  }, [banners, currentDraft, data, featuredItems, sections]);

  const draftWarnings = useMemo(() => {
    if (!currentDraft) return [];
    return buildDraftWarnings(currentDraft, categories, tournaments);
  }, [categories, currentDraft, tournaments]);

  const bannerDiff = useMemo(() => {
    if (!currentDraft) return { created: 0, updated: 0, deleted: 0 };
    return computeBannerDiff(banners, currentDraft.banners);
  }, [banners, currentDraft]);

  const featuredChanged = useMemo(() => {
    if (!currentDraft) return false;
    return JSON.stringify(normalizeFeaturedComparable(currentDraft.featuredItems)) !== JSON.stringify(normalizeFeaturedComparable(featuredItems));
  }, [currentDraft, featuredItems]);

  const sectionsChanged = useMemo(() => {
    if (!currentDraft) return false;
    return JSON.stringify(normalizeSectionComparable(currentDraft.sections)) !== JSON.stringify(normalizeSectionComparable(sections));
  }, [currentDraft, sections]);

  const resetDraftFromSnapshot = (snapshot: typeof data) => {
    if (!snapshot) return;
    lastLiveStateRef.current = JSON.stringify(normalizeSnapshotState(
      (snapshot.banners || []) as HomeBanner[],
      (snapshot.featuredItems || []) as FeaturedItem[],
      (snapshot.sections || []) as HomeSection[],
    ));
    setDraft(createHomeControlDraft(
      (snapshot.banners || []) as HomeBanner[],
      (snapshot.featuredItems || []) as FeaturedItem[],
      (snapshot.sections || []) as HomeSection[],
    ));
  };

  const refreshSnapshot = async () => {
    const result = await refetch();
    if (!hasDraftChanges && result.data) {
      resetDraftFromSnapshot(result.data);
    }
  };

  const handleDiscardDraft = async () => {
    if (!data || !hasDraftChanges) return;
    if (!(await confirmAction({
      title: 'Discard draft changes?',
      message: 'This will reset the home composer draft back to the latest saved snapshot.',
      confirmLabel: 'Discard draft',
      tone: 'danger',
    }))) {
      return;
    }

    resetDraftFromSnapshot(data);
    toastSuccess('Draft reset to the latest snapshot');
  };

  const handlePublishDraft = async () => {
    if (!data || !currentDraft || !hasDraftChanges) return;

    const changeSummary = [
      bannerDiff.created ? `${bannerDiff.created} banner create${bannerDiff.created === 1 ? '' : 's'}` : null,
      bannerDiff.updated ? `${bannerDiff.updated} banner update${bannerDiff.updated === 1 ? '' : 's'}` : null,
      bannerDiff.deleted ? `${bannerDiff.deleted} banner delete${bannerDiff.deleted === 1 ? '' : 's'}` : null,
      featuredChanged ? 'featured queue changes' : null,
      sectionsChanged ? 'section layout changes' : null,
    ].filter(Boolean).join(', ');

    if (!(await confirmAction({
      title: 'Publish home draft?',
      message: `Publish this draft${changeSummary ? ` with ${changeSummary}` : ''}?`,
      confirmLabel: 'Publish draft',
      tone: 'danger',
    }))) {
      return;
    }

    setIsPublishing(true);
    try {
      const liveBannerMap = new Map(banners.map((banner) => [banner.id, banner]));
      const retainedBannerIds = new Set<string>();

      for (const banner of currentDraft.banners) {
        const nextInput = buildBannerInput(banner);
        if (banner.id && liveBannerMap.has(banner.id)) {
          retainedBannerIds.add(banner.id);
          const liveBanner = liveBannerMap.get(banner.id);
          if (liveBanner && JSON.stringify(normalizeBannerComparable(liveBanner)) !== JSON.stringify(normalizeBannerComparable(banner))) {
            await updateBanner(banner.id, nextInput);
          }
          continue;
        }

        await createBanner(nextInput);
      }

      for (const banner of banners) {
        if (!retainedBannerIds.has(banner.id)) {
          await deleteBanner(banner.id);
        }
      }

      if (featuredChanged) {
        await setFeaturedItems(
          reindexFeaturedItems(currentDraft.featuredItems).map((item) => ({
            itemType: item.itemType,
            itemId: item.itemId,
            displayOrder: item.displayOrder,
          })),
        );
      }

      if (sectionsChanged) {
        await updateHomeSections(
          currentDraft.sections.map((section) => ({
            sectionKey: section.sectionKey,
            isVisible: section.isVisible,
            displayOrder: section.displayOrder,
          })),
        );
      }

      await queryClient.invalidateQueries({ queryKey: HOME_CONTROL_SNAPSHOT_QUERY_KEY });
      const refreshed = await refetch();
      if (refreshed.data) {
        resetDraftFromSnapshot(refreshed.data);
      }
      toastSuccess('Home draft published');
    } catch (publishError) {
      toastError('Failed to publish draft: ' + getErrorMessage(publishError));
    } finally {
      setIsPublishing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary-600" />
      </div>
    );
  }

  if (!data || !currentDraft) {
    return (
      <div className="page-shell">
        <PageHeader
          title="Home Control"
          subtitle="Visual composer for banners, sections, and featured content"
        />
        <EmptyState
          title="Home control snapshot unavailable"
          subtitle={error?.message || 'The admin API did not return a valid home-control snapshot.'}
          action={(
            <Button type="button" onClick={() => void refreshSnapshot()}>
              Retry
            </Button>
          )}
        />
      </div>
    );
  }

  const draftVisibleSections = sortByDisplayOrder(currentDraft.sections.filter((section) => section.isVisible));
  const draftBanners = sortByDisplayOrder(currentDraft.banners);
  const draftFeaturedItems = sortByDisplayOrder(currentDraft.featuredItems);
  const draftActiveBannerCount = currentDraft.banners.filter((banner) => banner.isActive).length;
  const draftFeaturedCategoryCount = currentDraft.featuredItems.filter((item) => item.itemType === 'category').length;
  const draftFeaturedTournamentCount = currentDraft.featuredItems.filter((item) => item.itemType === 'tournament').length;
  const draftChangeCount = bannerDiff.created + bannerDiff.updated + bannerDiff.deleted + (featuredChanged ? 1 : 0) + (sectionsChanged ? 1 : 0);

  return (
    <div className="page-shell">
      <PageHeader
        title="Home Control"
        subtitle="Draft, preview, validate, and publish homepage content from one workspace"
        actions={(
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void refreshSnapshot()} loading={isFetching}>
              Refresh Snapshot
            </Button>
            <Button
              variant="ghost"
              onClick={() => void handleDiscardDraft()}
              disabled={!hasDraftChanges || isPublishing}
            >
              Discard Draft
            </Button>
            <Button
              onClick={() => void handlePublishDraft()}
              loading={isPublishing}
              disabled={!hasDraftChanges || isPublishing}
            >
              Publish Draft
            </Button>
          </div>
        )}
      />

      {error && (
        <div className="rounded-xl border border-yellow-300/75 bg-yellow-100/70 p-4">
          <p className="text-sm text-yellow-800">
            Showing the latest successful snapshot. Refresh warning: {error.message}
          </p>
        </div>
      )}

      <Section
        title="Draft Status"
        subtitle={hasDraftChanges ? 'Local draft changes are ready to review and publish.' : 'Draft matches the latest saved home configuration.'}
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <SnapshotStat label="Draft changes" value={draftChangeCount} detail={hasDraftChanges ? 'Unpublished operations queued' : 'No unpublished changes'} />
          <SnapshotStat label="Active banners" value={draftActiveBannerCount} detail={`${currentDraft.banners.length} total banners`} />
          <SnapshotStat label="Visible sections" value={draftVisibleSections.length} detail="Homepage module order" />
          <SnapshotStat label="Featured queue" value={draftFeaturedItems.length} detail={`${draftFeaturedCategoryCount} categories, ${draftFeaturedTournamentCount} tournaments`} />
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <PreviewPanel title="Banner Preview" subtitle="Draft banner order and activation state">
            {draftBanners.length > 0 ? draftBanners.map((banner) => (
              <div key={banner.clientId} className="rounded-2xl border border-slate-200/80 bg-white/70 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{banner.title || 'Untitled banner'}</p>
                    <p className="mt-1 text-xs text-slate-500">{banner.actionType} · {banner.actionUrl || 'No target set'}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${banner.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}>
                    {banner.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-500">Order {banner.displayOrder}</p>
              </div>
            )) : (
              <p className="text-sm text-slate-500">No banners in draft.</p>
            )}
          </PreviewPanel>

          <PreviewPanel title="Featured Queue" subtitle="The order players will see curated discovery items">
            {draftFeaturedItems.length > 0 ? draftFeaturedItems.map((item, index) => (
              <div key={`${item.itemType}:${item.itemId}`} className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white/70 px-3 py-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{getFeaturedItemLabel(item, categories, tournaments)}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.12em] text-slate-500">{item.itemType}</p>
                </div>
                <span className="rounded-full bg-primary-50 px-2.5 py-1 text-xs font-semibold text-primary-700">
                  #{index + 1}
                </span>
              </div>
            )) : (
              <p className="text-sm text-slate-500">No featured items selected.</p>
            )}
          </PreviewPanel>

          <PreviewPanel title="Section Order" subtitle="Visible modules in draft homepage order">
            {draftVisibleSections.length > 0 ? draftVisibleSections.map((section) => (
              <div key={section.sectionKey} className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white/70 px-3 py-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{section.name}</p>
                  <p className="mt-1 font-mono text-xs text-slate-500">{section.sectionKey}</p>
                </div>
                <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700">
                  {section.displayOrder}
                </span>
              </div>
            )) : (
              <p className="text-sm text-slate-500">All sections are hidden in this draft.</p>
            )}
          </PreviewPanel>
        </div>
      </Section>

      {draftWarnings.length > 0 ? (
        <Section title="Draft Checks" subtitle="Validation signals before you publish this draft">
          <WarningGrid warnings={draftWarnings} />
        </Section>
      ) : (
        <Section title="Draft Checks" subtitle="Current validation status">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700">Ready</p>
            <p className="mt-2 text-sm font-semibold text-slate-900">Draft passes the current validation checks.</p>
            <p className="mt-1 text-sm text-slate-600">Publish will still require confirmation.</p>
          </div>
        </Section>
      )}

      {liveWarnings.length > 0 && (
        <Section title="Live Snapshot Warnings" subtitle="Issues detected in the currently published home configuration">
          <WarningGrid warnings={liveWarnings} />
        </Section>
      )}

      <div className="border-b border-slate-200">
        <nav className="flex gap-4">
          {(['banners', 'featured', 'sections'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab === 'banners' ? 'Banners' : tab === 'featured' ? 'Featured Items' : 'Sections'}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === 'banners' ? (
        <BannersTab
          banners={currentDraft.banners}
          categories={categories}
          tournaments={tournaments}
          onChange={(nextBanners) => setDraft((previous) => (
            previous
              ? { ...previous, banners: sortByDisplayOrder(nextBanners) }
              : previous
          ))}
        />
      ) : null}

      {activeTab === 'featured' ? (
        <FeaturedTab
          featuredItems={currentDraft.featuredItems}
          categories={categories}
          tournaments={tournaments}
          onChange={(nextFeaturedItems) => setDraft((previous) => (
            previous
              ? { ...previous, featuredItems: reindexFeaturedItems(nextFeaturedItems) }
              : previous
          ))}
        />
      ) : null}

      {activeTab === 'sections' ? (
        <SectionsTab
          sections={currentDraft.sections}
          onChange={(nextSections) => setDraft((previous) => (
            previous
              ? { ...previous, sections: nextSections }
              : previous
          ))}
        />
      ) : null}
    </div>
  );
}

function SnapshotStat({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white/60 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
      <p className="mt-1 text-sm text-slate-500">{detail}</p>
    </div>
  );
}

function PreviewPanel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/60 p-4">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      <div className="mt-4 space-y-3">{children}</div>
    </div>
  );
}

function WarningGrid({
  warnings,
}: {
  warnings: Array<{ id: string; tone: 'info' | 'warning' | 'danger'; title: string; description: string }>;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      {warnings.map((warning) => (
        <div
          key={warning.id}
          className={`rounded-2xl border p-4 ${
            warning.tone === 'danger'
              ? 'border-rose-200 bg-rose-50/80'
              : warning.tone === 'warning'
                ? 'border-amber-200 bg-amber-50/80'
                : 'border-sky-200 bg-sky-50/80'
          }`}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{warning.tone}</p>
          <p className="mt-2 text-sm font-semibold text-slate-900">{warning.title}</p>
          <p className="mt-1 text-sm text-slate-600">{warning.description}</p>
        </div>
      ))}
    </div>
  );
}

interface BannersTabProps {
  banners: DraftBanner[];
  categories: HomeControlCategory[];
  tournaments: TournamentSummary[];
  onChange: (banners: DraftBanner[]) => void;
}

type BannerEditorValues = Omit<DraftBanner, 'id' | 'clientId'>;

function BannersTab({ banners, categories, tournaments, onChange }: BannersTabProps) {
  const [showModal, setShowModal] = useState(false);
  const [editingBanner, setEditingBanner] = useState<DraftBanner | null>(null);
  const sortedBanners = sortByDisplayOrder(banners);

  const openCreateModal = () => {
    setEditingBanner(null);
    setShowModal(true);
  };

  const handleDeleteBanner = async (banner: DraftBanner) => {
    if (!(await confirmAction({
      title: 'Remove banner from draft?',
      message: `Remove "${banner.title}" from the current home draft?`,
      confirmLabel: 'Remove',
      tone: 'danger',
    }))) {
      return;
    }

    onChange(banners.filter((item) => item.clientId !== banner.clientId));
  };

  const handleToggleActive = (banner: DraftBanner) => {
    onChange(
      banners.map((item) => (
        item.clientId === banner.clientId
          ? { ...item, isActive: !item.isActive }
          : item
      )),
    );
  };

  const moveBanner = (banner: DraftBanner, direction: 'up' | 'down') => {
    const currentIndex = sortedBanners.findIndex((item) => item.clientId === banner.clientId);
    const nextIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= sortedBanners.length) return;

    const next = [...sortedBanners];
    const temp = next[currentIndex];
    next[currentIndex] = next[nextIndex];
    next[nextIndex] = temp;

    onChange(next.map((item, index) => ({
      ...item,
      displayOrder: index + 1,
    })));
  };

  const handleSaveBanner = async (values: BannerEditorValues) => {
    if (editingBanner) {
      onChange(
        banners.map((item) => (
          item.clientId === editingBanner.clientId
            ? { ...item, ...values }
            : item
        )),
      );
      return;
    }

    const nextDisplayOrder = values.displayOrder || (banners.length > 0 ? Math.max(...banners.map((item) => item.displayOrder)) + 1 : 1);
    onChange([
      ...banners,
      {
        id: null,
        clientId: createClientId(),
        ...values,
        displayOrder: nextDisplayOrder,
      },
    ]);
  };

  return (
    <Section
      title="Banner Draft"
      subtitle="Edit banners locally, review the preview above, then publish when the set is ready."
      actions={(
        <Button type="button" onClick={openCreateModal}>
          Add Banner
        </Button>
      )}
    >
      <div className="overflow-hidden rounded-2xl border border-slate-200/80">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Order</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Title</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Action</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Schedule</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Status</th>
              <th className="px-6 py-3 text-right text-xs font-medium uppercase text-slate-500">Draft Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {sortedBanners.length > 0 ? sortedBanners.map((banner) => (
              <tr key={banner.clientId} className={!banner.isActive ? 'bg-slate-50/70 opacity-70' : ''}>
                <td className="px-6 py-4 text-sm text-slate-500">{banner.displayOrder}</td>
                <td className="px-6 py-4">
                  <p className="font-medium text-slate-900">{banner.title || 'Untitled banner'}</p>
                  {banner.body ? <p className="mt-1 max-w-xs truncate text-sm text-slate-500">{banner.body}</p> : null}
                </td>
                <td className="px-6 py-4">
                  <span className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                    {banner.actionType}
                  </span>
                  <p className="mt-1 max-w-[220px] truncate text-xs text-slate-500">{banner.actionUrl || 'No target'}</p>
                </td>
                <td className="px-6 py-4 text-sm text-slate-500">
                  {banner.startDate || banner.endDate ? (
                    <div>
                      {banner.startDate ? <div>From: {new Date(banner.startDate).toLocaleString()}</div> : null}
                      {banner.endDate ? <div>To: {new Date(banner.endDate).toLocaleString()}</div> : null}
                    </div>
                  ) : (
                    'Always'
                  )}
                </td>
                <td className="px-6 py-4">
                  <button
                    type="button"
                    onClick={() => handleToggleActive(banner)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      banner.isActive
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {banner.isActive ? 'Active' : 'Inactive'}
                  </button>
                </td>
                <td className="px-6 py-4 text-right text-sm">
                  <button
                    type="button"
                    onClick={() => moveBanner(banner, 'up')}
                    disabled={banner.displayOrder === 1}
                    className="mr-2 rounded px-2 py-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => moveBanner(banner, 'down')}
                    disabled={banner.displayOrder === sortedBanners.length}
                    className="mr-4 rounded px-2 py-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingBanner(banner);
                      setShowModal(true);
                    }}
                    className="mr-4 text-primary-600 hover:text-primary-900"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteBanner(banner)}
                    className="text-rose-600 hover:text-rose-800"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-sm text-slate-500">
                  No banners in the draft yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showModal ? (
        <BannerModal
          key={editingBanner?.clientId || 'new-banner'}
          banner={editingBanner}
          categories={categories}
          tournaments={tournaments}
          onClose={() => {
            setShowModal(false);
            setEditingBanner(null);
          }}
          onSave={handleSaveBanner}
        />
      ) : null}
    </Section>
  );
}

interface BannerModalProps {
  banner: DraftBanner | null;
  categories: HomeControlCategory[];
  tournaments: TournamentSummary[];
  onClose: () => void;
  onSave: (data: BannerEditorValues) => Promise<void> | void;
}

function BannerModal({ banner, categories, tournaments, onClose, onSave }: BannerModalProps) {
  const [formData, setFormData] = useState<BannerEditorValues>({
    title: banner?.title || '',
    body: banner?.body || '',
    imageUrl: banner?.imageUrl || '',
    actionUrl: banner?.actionUrl || '',
    actionType: banner?.actionType || 'url',
    displayOrder: banner?.displayOrder ?? 0,
    startDate: banner?.startDate || '',
    endDate: banner?.endDate || '',
    isActive: banner?.isActive ?? true,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedCategory = categories.find((category) => category.id === formData.actionUrl || category.categoryKey === formData.actionUrl) || null;
  const selectedTournament = tournaments.find((tournament) => tournament.id === formData.actionUrl) || null;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!formData.title.trim()) {
      setError('Title is required.');
      return;
    }

    try {
      setIsSaving(true);
      await onSave({
        ...formData,
        title: formData.title.trim(),
        body: formData.body.trim(),
        imageUrl: formData.imageUrl.trim(),
        actionUrl: formData.actionUrl.trim(),
      });
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to update banner draft.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} ariaLabel={banner ? 'Edit banner draft' : 'Create banner draft'}>
      <div className="mx-auto max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white shadow-xl">
        <div className="border-b border-slate-200 p-6">
          <h2 className="text-xl font-bold text-slate-900">{banner ? 'Edit Banner Draft' : 'Add Banner Draft'}</h2>
          <p className="mt-1 text-sm text-slate-500">This change stays local until you publish the home draft.</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          {error ? (
            <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div>
          ) : null}

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Title *</label>
            <input
              type="text"
              value={formData.title}
              onChange={(event) => setFormData({ ...formData, title: event.target.value })}
              className="w-full rounded-lg border px-3 py-2 focus:ring-2 focus:ring-primary-500"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Body</label>
            <textarea
              value={formData.body}
              onChange={(event) => setFormData({ ...formData, body: event.target.value })}
              rows={3}
              className="w-full rounded-lg border px-3 py-2 focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Image URL</label>
            <input
              type="url"
              value={formData.imageUrl}
              onChange={(event) => setFormData({ ...formData, imageUrl: event.target.value })}
              className="w-full rounded-lg border px-3 py-2 focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Action Type</label>
              <select
                value={formData.actionType}
                onChange={(event) => setFormData({ ...formData, actionType: event.target.value as BannerActionType })}
                className="w-full rounded-lg border px-3 py-2 focus:ring-2 focus:ring-primary-500"
              >
                <option value="url">URL</option>
                <option value="category">Category</option>
                <option value="tournament">Tournament</option>
                <option value="screen">Screen</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Action Target</label>
              {formData.actionType === 'category' ? (
                <select
                  value={selectedCategory?.id || ''}
                  onChange={(event) => setFormData({ ...formData, actionUrl: event.target.value })}
                  className="w-full rounded-lg border px-3 py-2 focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">Select category</option>
                  {categories.filter((category) => category.isActive).map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name} ({category.categoryKey})
                    </option>
                  ))}
                </select>
              ) : formData.actionType === 'tournament' ? (
                <select
                  value={selectedTournament?.id || ''}
                  onChange={(event) => setFormData({ ...formData, actionUrl: event.target.value })}
                  className="w-full rounded-lg border px-3 py-2 focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">Select tournament</option>
                  {tournaments.map((tournament) => (
                    <option key={tournament.id} value={tournament.id}>
                      {tournament.name} ({tournament.status})
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={formData.actionUrl}
                  onChange={(event) => setFormData({ ...formData, actionUrl: event.target.value })}
                  className="w-full rounded-lg border px-3 py-2 focus:ring-2 focus:ring-primary-500"
                  placeholder={formData.actionType === 'screen' ? 'route or screen key' : 'full url'}
                />
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Start Date</label>
              <input
                type="datetime-local"
                value={formData.startDate ? formData.startDate.slice(0, 16) : ''}
                onChange={(event) => setFormData({ ...formData, startDate: event.target.value })}
                className="w-full rounded-lg border px-3 py-2 focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">End Date</label>
              <input
                type="datetime-local"
                value={formData.endDate ? formData.endDate.slice(0, 16) : ''}
                onChange={(event) => setFormData({ ...formData, endDate: event.target.value })}
                className="w-full rounded-lg border px-3 py-2 focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Display Order</label>
            <input
              type="number"
              value={formData.displayOrder}
              onChange={(event) => setFormData({ ...formData, displayOrder: Number.parseInt(event.target.value, 10) || 0 })}
              className="w-full rounded-lg border px-3 py-2 focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={formData.isActive}
              onChange={(event) => setFormData({ ...formData, isActive: event.target.checked })}
              className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
            />
            <span className="text-sm text-slate-700">Active</span>
          </label>

          <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={isSaving}>
              {banner ? 'Update Draft' : 'Add To Draft'}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}

interface FeaturedTabProps {
  featuredItems: DraftFeaturedItem[];
  categories: HomeControlCategory[];
  tournaments: TournamentSummary[];
  onChange: (items: DraftFeaturedItem[]) => void;
}

function FeaturedTab({ featuredItems, categories, tournaments, onChange }: FeaturedTabProps) {
  const orderedItems = sortByDisplayOrder(featuredItems);

  function isSelected(itemType: DraftFeaturedItem['itemType'], itemId: string) {
    return orderedItems.some((item) => item.itemType === itemType && item.itemId === itemId);
  }

  function toggleItem(itemType: DraftFeaturedItem['itemType'], itemId: string) {
    if (isSelected(itemType, itemId)) {
      onChange(orderedItems.filter((item) => !(item.itemType === itemType && item.itemId === itemId)));
      return;
    }

    onChange([
      ...orderedItems,
      {
        itemType,
        itemId,
        displayOrder: orderedItems.length + 1,
      },
    ]);
  }

  function moveItem(index: number, direction: 'up' | 'down') {
    const nextIndex = direction === 'up' ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= orderedItems.length) return;

    const next = [...orderedItems];
    const temp = next[index];
    next[index] = next[nextIndex];
    next[nextIndex] = temp;
    onChange(reindexFeaturedItems(next));
  }

  return (
    <Section title="Featured Draft" subtitle="Curate the home discovery queue locally, then publish the draft when the order is ready.">
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-200/80 bg-slate-50/60 p-4">
          <p className="text-sm font-semibold text-slate-900">Selected Queue</p>
          <p className="mt-1 text-sm text-slate-500">The selected order becomes the featured carousel and discovery rail order.</p>

          <div className="mt-4 space-y-3">
            {orderedItems.length > 0 ? orderedItems.map((item, index) => (
              <div key={`${item.itemType}:${item.itemId}`} className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white px-3 py-3">
                <span className="rounded-full bg-primary-50 px-2.5 py-1 text-xs font-semibold text-primary-700">
                  #{index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">{getFeaturedItemLabel(item, categories, tournaments)}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.12em] text-slate-500">{item.itemType}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => moveItem(index, 'up')}
                    disabled={index === 0}
                    className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => moveItem(index, 'down')}
                    disabled={index === orderedItems.length - 1}
                    className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleItem(item.itemType, item.itemId)}
                    className="rounded p-1 text-rose-600 hover:bg-rose-50"
                  >
                    ×
                  </button>
                </div>
              </div>
            )) : (
              <p className="text-sm text-slate-500">No featured items selected.</p>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200/80 bg-white/70 p-4">
            <p className="text-sm font-semibold text-slate-900">Categories</p>
            <p className="mt-1 text-sm text-slate-500">Select active categories to surface on the homepage.</p>

            <div className="mt-4 space-y-2">
              {categories.filter((category) => category.isActive).length > 0 ? categories
                .filter((category) => category.isActive)
                .map((category) => (
                  <label
                    key={category.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-3 transition-colors ${
                      isSelected('category', category.id)
                        ? 'border-primary-500 bg-primary-50'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected('category', category.id)}
                      onChange={() => toggleItem('category', category.id)}
                      className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-2xl">{category.icon || '•'}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-slate-900">{category.name}</p>
                      <p className="mt-1 text-sm text-slate-500">{category.questionCount} questions</p>
                    </div>
                  </label>
                )) : (
                  <p className="text-sm text-slate-500">No active categories available.</p>
                )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white/70 p-4">
            <p className="text-sm font-semibold text-slate-900">Tournaments</p>
            <p className="mt-1 text-sm text-slate-500">Select tournaments to highlight live or upcoming competition.</p>

            <div className="mt-4 space-y-2">
              {tournaments.length > 0 ? tournaments.map((tournament) => (
                <label
                  key={tournament.id}
                  className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-3 transition-colors ${
                    isSelected('tournament', tournament.id)
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected('tournament', tournament.id)}
                    onChange={() => toggleItem('tournament', tournament.id)}
                    className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-slate-900">{tournament.name}</p>
                    <p className="mt-1 text-sm capitalize text-slate-500">{tournament.status.replace(/_/g, ' ')}</p>
                  </div>
                </label>
              )) : (
                <p className="text-sm text-slate-500">No tournaments available.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}

interface SectionsTabProps {
  sections: DraftSection[];
  onChange: (sections: DraftSection[]) => void;
}

function SectionsTab({ sections, onChange }: SectionsTabProps) {
  const sortedSections = sortByDisplayOrder(sections);

  function toggleVisibility(sectionKey: string) {
    onChange(
      sortedSections.map((section) => (
        section.sectionKey === sectionKey
          ? { ...section, isVisible: !section.isVisible }
          : section
      )),
    );
  }

  function moveSection(index: number, direction: 'up' | 'down') {
    const nextIndex = direction === 'up' ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= sortedSections.length) return;

    const next = [...sortedSections];
    const temp = next[index];
    next[index] = next[nextIndex];
    next[nextIndex] = temp;

    onChange(
      next.map((section, itemIndex) => ({
        ...section,
        displayOrder: itemIndex + 1,
      })),
    );
  }

  return (
    <Section title="Section Draft" subtitle="Adjust section visibility and order locally, then publish the draft to push the new layout live.">
      <div className="space-y-3">
        {sortedSections.map((section, index) => (
          <div
            key={section.sectionKey}
            className={`flex items-center gap-3 rounded-2xl border p-3 ${
              section.isVisible ? 'border-slate-200 bg-white/70' : 'border-slate-100 bg-slate-50 opacity-70'
            }`}
          >
            <div className="flex flex-col gap-1">
              <button
                type="button"
                onClick={() => moveSection(index, 'up')}
                disabled={index === 0}
                className="rounded p-1 hover:bg-slate-100 disabled:opacity-30"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => moveSection(index, 'down')}
                disabled={index === sortedSections.length - 1}
                className="rounded p-1 hover:bg-slate-100 disabled:opacity-30"
              >
                ↓
              </button>
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-slate-900">{section.name}</p>
              <p className="mt-1 font-mono text-xs text-slate-500">{section.sectionKey}</p>
            </div>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
              {section.displayOrder}
            </span>
            <button
              type="button"
              onClick={() => toggleVisibility(section.sectionKey)}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                section.isVisible
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-slate-100 text-slate-500'
              }`}
            >
              {section.isVisible ? 'Visible' : 'Hidden'}
            </button>
          </div>
        ))}
      </div>
    </Section>
  );
}
