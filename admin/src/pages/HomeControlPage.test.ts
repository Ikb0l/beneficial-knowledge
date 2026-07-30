import {
  buildDraftWarnings,
  computeBannerDiff,
  createHomeControlDraft,
} from '../domains/homeControl/draft';

describe('HomeControlPage draft helpers', () => {
  it('creates a sorted draft and reindexes featured items', () => {
    const draft = createHomeControlDraft(
      [
        {
          id: 'banner-2',
          title: 'Second',
          actionType: 'url',
          displayOrder: 2,
          isActive: true,
        },
        {
          id: 'banner-1',
          title: 'First',
          actionType: 'url',
          displayOrder: 1,
          isActive: true,
        },
      ] as never,
      [
        {
          id: 'featured-2',
          itemType: 'tournament',
          itemId: 't2',
          displayOrder: 4,
          isActive: true,
        },
        {
          id: 'featured-1',
          itemType: 'category',
          itemId: 'c1',
          displayOrder: 2,
          isActive: true,
        },
      ] as never,
      [
        {
          id: 'section-1',
          sectionKey: 'announcements',
          name: 'Announcements',
          isVisible: true,
          displayOrder: 3,
          config: {},
        },
        {
          id: 'section-2',
          sectionKey: 'hero',
          name: 'Hero',
          isVisible: true,
          displayOrder: 1,
          config: {},
        },
      ] as never,
    );

    expect(draft.banners.map((banner) => banner.title)).toEqual(['First', 'Second']);
    expect(draft.featuredItems.map((item) => item.displayOrder)).toEqual([1, 2]);
    expect(draft.sections.map((section) => section.sectionKey)).toEqual(['hero', 'announcements']);
  });

  it('builds warnings for invalid draft states and computes banner diffs', () => {
    const draft = {
      banners: [
        {
          id: 'banner-1',
          clientId: 'banner-1',
          title: 'Broken Banner',
          body: '',
          imageUrl: '',
          actionUrl: 'missing-category',
          actionType: 'category',
          displayOrder: 1,
          startDate: '2026-03-22T12:00:00.000Z',
          endDate: '2026-03-22T10:00:00.000Z',
          isActive: false,
        },
        {
          id: null,
          clientId: 'new-banner',
          title: 'New Banner',
          body: '',
          imageUrl: '',
          actionUrl: '',
          actionType: 'screen',
          displayOrder: 1,
          startDate: '',
          endDate: '',
          isActive: false,
        },
      ],
      featuredItems: [],
      sections: [
        {
          sectionKey: 'hero',
          name: 'Hero',
          isVisible: false,
          displayOrder: 1,
        },
      ],
    };

    const warnings = buildDraftWarnings(
      draft as never,
      [
        { id: 'cat-1', categoryKey: 'science', name: 'Science', icon: 'S', isActive: true, questionCount: 5 },
      ] as never,
      [
        { id: 't-1', name: 'Weekend Cup', status: 'scheduled' },
      ] as never,
    );

    expect(warnings.map((warning) => warning.id)).toEqual(expect.arrayContaining([
      'draft-no-active-banners',
      'draft-no-visible-sections',
      'draft-invalid-banner-dates',
      'draft-missing-banner-target',
      'draft-missing-category-target',
      'draft-duplicate-banner-order',
      'draft-no-featured-categories',
      'draft-no-featured-tournaments',
    ]));

    const diff = computeBannerDiff(
      [
        {
          id: 'banner-1',
          title: 'Old Banner',
          body: '',
          imageUrl: '',
          actionUrl: '',
          actionType: 'url',
          displayOrder: 1,
          isActive: true,
        },
        {
          id: 'banner-2',
          title: 'Deleted Banner',
          body: '',
          imageUrl: '',
          actionUrl: '',
          actionType: 'url',
          displayOrder: 2,
          isActive: true,
        },
      ] as never,
      draft.banners as never,
    );

    expect(diff).toEqual({
      created: 1,
      updated: 1,
      deleted: 1,
    });
  });
});
