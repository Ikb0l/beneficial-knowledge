import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import SavedViewsToolbar from './SavedViewsToolbar';
import { persistSavedViews } from '../lib/savedViews';
import {
  useAdminPreferencesQuery,
  useDeleteAdminSavedViewMutation,
  useUpsertAdminSavedViewMutation,
} from '../domains/preferences/api';

vi.mock('../domains/preferences/api', () => ({
  useAdminPreferencesQuery: vi.fn(),
  useUpsertAdminSavedViewMutation: vi.fn(),
  useDeleteAdminSavedViewMutation: vi.fn(),
}));

const mockedUseAdminPreferencesQuery = vi.mocked(useAdminPreferencesQuery);
const mockedUseUpsertAdminSavedViewMutation = vi.mocked(useUpsertAdminSavedViewMutation);
const mockedUseDeleteAdminSavedViewMutation = vi.mocked(useDeleteAdminSavedViewMutation);

describe('SavedViewsToolbar', () => {
  beforeEach(() => {
    mockedUseAdminPreferencesQuery.mockReturnValue({
      isSuccess: true,
      isLoading: false,
      data: {
        savedViews: {
          questions: [
            { id: 'remote-1', label: 'Popular', query: 'category=science', updatedAt: 100 },
          ],
        },
        pagePreferences: {},
      },
    } as never);
    mockedUseUpsertAdminSavedViewMutation.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({}),
      isPending: false,
    } as never);
    mockedUseDeleteAdminSavedViewMutation.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({}),
      isPending: false,
    } as never);
  });

  it('applies and mutates remote saved views', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const upsertSpy = vi.fn().mockResolvedValue({});
    const deleteSpy = vi.fn().mockResolvedValue({});

    mockedUseUpsertAdminSavedViewMutation.mockReturnValue({
      mutateAsync: upsertSpy,
      isPending: false,
    } as never);
    mockedUseDeleteAdminSavedViewMutation.mockReturnValue({
      mutateAsync: deleteSpy,
      isPending: false,
    } as never);

    render(
      <SavedViewsToolbar
        storageKey="questions"
        searchParams={new URLSearchParams('page=2&search=prophets&category=science')}
        onApply={onApply}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Popular' }));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0][0]).toBeInstanceOf(URLSearchParams);
    expect(onApply.mock.calls[0][0].toString()).toBe('category=science');

    await user.click(screen.getByRole('button', { name: 'Save Current View' }));
    await user.type(screen.getByPlaceholderText('View name'), 'My Queue');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(upsertSpy).toHaveBeenCalledWith({
      storageKey: 'questions',
      label: 'My Queue',
      query: 'category=science&search=prophets',
    });

    await user.click(screen.getByRole('button', { name: 'Delete Popular' }));
    expect(deleteSpy).toHaveBeenCalledWith({
      storageKey: 'questions',
      viewId: 'remote-1',
    });
  });

  it('migrates legacy local views into the backend model', async () => {
    const upsertSpy = vi.fn().mockResolvedValue({});
    mockedUseAdminPreferencesQuery.mockReturnValue({
      isSuccess: true,
      isLoading: false,
      data: {
        savedViews: {},
        pagePreferences: {},
      },
    } as never);
    mockedUseUpsertAdminSavedViewMutation.mockReturnValue({
      mutateAsync: upsertSpy,
      isPending: false,
    } as never);

    persistSavedViews('audit-log', [
      { id: 'legacy-1', label: 'Recent Failures', query: 'targetType=job', updatedAt: 1 },
    ]);

    render(
      <SavedViewsToolbar
        storageKey="audit-log"
        searchParams={new URLSearchParams('targetType=job')}
        onApply={vi.fn()}
      />,
    );

    expect(screen.getByText('Recent Failures')).toBeTruthy();

    await waitFor(() => {
      expect(upsertSpy).toHaveBeenCalledWith({
        storageKey: 'audit-log',
        label: 'Recent Failures',
        query: 'targetType=job',
      });
    });
  });
});
