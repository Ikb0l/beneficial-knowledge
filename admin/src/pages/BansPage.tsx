import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useRBAC } from '../hooks/useRBAC';
import {
  useBanUserMutation,
  useBansQuery,
  useSearchUsersMutation,
  useUnbanUserMutation,
} from '../domains/users/api';
import type { UserContract } from '../domains/users/contracts';
import { getErrorMessage } from '../lib/errors';
import { confirmAction } from '../lib/confirm';
import { toastError, toastSuccess } from '../lib/toast';
import Modal from '../components/Modal';
import SavedViewsToolbar from '../components/SavedViewsToolbar';

const PAGE_SIZE = 20;

function parsePositiveInt(value: string | null, fallback: number) {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export default function BansPage() {
  const { canPerform } = useRBAC();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const page = parsePositiveInt(searchParams.get('page'), 1);
  const showActive = searchParams.get('active') !== '0';
  const bansQuery = useBansQuery({
    page,
    pageSize: PAGE_SIZE,
    active: showActive,
  });
  const unbanUserMutation = useUnbanUserMutation();

  const bans = bansQuery.data?.items || [];
  const total = bansQuery.data?.total || 0;
  const error = bansQuery.error?.message || null;

  const updateParams = (updates: Record<string, string | undefined>, options?: { resetPage?: boolean }) => {
    const next = new URLSearchParams(searchParams);

    Object.entries(updates).forEach(([key, value]) => {
      if (value) {
        next.set(key, value);
      } else {
        next.delete(key);
      }
    });

    if (options?.resetPage !== false) {
      next.delete('page');
    }

    setSearchParams(next);
  };

  const setPage = (nextPage: number) => {
    const next = new URLSearchParams(searchParams);
    if (nextPage <= 1) {
      next.delete('page');
    } else {
      next.set('page', String(nextPage));
    }
    setSearchParams(next);
  };

  const handleUnban = async (userId: string) => {
    const confirmed = await confirmAction({
      title: 'Unban user?',
      message: 'Are you sure you want to unban this user?',
      confirmLabel: 'Unban',
      tone: 'danger',
    });

    if (!confirmed) {
      return;
    }

    try {
      await unbanUserMutation.mutateAsync(userId);
      toastSuccess('User unbanned');
    } catch (mutationError) {
      toastError('Failed to unban user: ' + getErrorMessage(mutationError));
    }
  };

  return (
    <div className="page-shell">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Ban Management</h1>
          <p className="text-slate-600">View active sanctions and create new bans</p>
        </div>
        {canPerform('ban_user') && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            Create Ban
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={showActive}
              onChange={(event) => updateParams({ active: event.target.checked ? undefined : '0' })}
              className="rounded border-slate-300"
            />
            <span className="text-sm text-slate-600">Show active bans only</span>
          </label>
          <button
            onClick={() => void bansQuery.refetch()}
            disabled={bansQuery.isFetching}
            className="px-3 py-1 text-sm border border-slate-300 rounded-lg disabled:opacity-50"
          >
            {bansQuery.isFetching ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      <SavedViewsToolbar
        storageKey="bans"
        searchParams={searchParams}
        onApply={(next) => setSearchParams(next)}
      />

      {error && (
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-sm text-yellow-700">
            Showing the latest successful result. Refresh warning: {error}
          </p>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {bansQuery.isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          </div>
        ) : bans.length === 0 ? (
          <div className="flex items-center justify-center h-64">
            <p className="text-slate-500">No bans found</p>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">User</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Reason</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Banned By</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Duration</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {bans.map((ban) => (
                <tr key={ban.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-slate-800">{ban.username || 'Unknown'}</p>
                      <p className="text-xs text-slate-500">Telegram ID: {ban.telegramId || 'n/a'}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm text-slate-600 max-w-xs truncate">{ban.reason}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm text-slate-600">{ban.bannedByName || 'Unknown'}</p>
                    <p className="text-xs text-slate-500">
                      {ban.createdAt ? new Date(ban.createdAt).toLocaleDateString() : 'Unknown'}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    {ban.isPermanent ? (
                      <span className="badge badge-error">Permanent</span>
                    ) : (
                      <div>
                        <span className="badge badge-warning">Temporary</span>
                        {ban.expiresAt && (
                          <p className="text-xs text-slate-500 mt-1">
                            Until {new Date(ban.expiresAt).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {ban.isActive ? (
                      <span className="badge badge-error">Active</span>
                    ) : (
                      <div>
                        <span className="badge badge-success">Lifted</span>
                        {ban.unbannedAt && (
                          <p className="text-xs text-slate-500 mt-1">
                            {new Date(ban.unbannedAt).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {ban.isActive && canPerform('unban_user') && (
                      <button
                        onClick={() => void handleUnban(ban.userId)}
                        disabled={unbanUserMutation.isPending}
                        className="text-primary-600 hover:text-primary-700 text-sm disabled:opacity-50"
                      >
                        {unbanUserMutation.isPending ? 'Unbanning...' : 'Unban'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200">
            <p className="text-sm text-slate-600">
              Showing {((page - 1) * PAGE_SIZE) + 1} to {Math.min(page * PAGE_SIZE, total)} of {total}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="px-3 py-1 text-sm border border-slate-300 rounded disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(page + 1)}
                disabled={page * PAGE_SIZE >= total}
                className="px-3 py-1 text-sm border border-slate-300 rounded disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {showCreateModal && (
        <CreateBanModal
          onClose={() => setShowCreateModal(false)}
          onBanned={() => setShowCreateModal(false)}
        />
      )}
    </div>
  );
}

function CreateBanModal({ onClose, onBanned }: { onClose: () => void; onBanned: () => void }) {
  const searchUsersMutation = useSearchUsersMutation();
  const banUserMutation = useBanUserMutation();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserContract | null>(null);
  const [reason, setReason] = useState('');
  const [duration, setDuration] = useState('permanent');
  const searchResults = searchUsersMutation.data || [];

  const handleSearch = async () => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      return;
    }

    try {
      await searchUsersMutation.mutateAsync(trimmed);
    } catch (mutationError) {
      toastError('Failed to search users: ' + getErrorMessage(mutationError));
    }
  };

  const handleSubmit = async () => {
    if (!selectedUser || !reason.trim()) {
      toastError('Please select a user and provide a reason');
      return;
    }

    try {
      await banUserMutation.mutateAsync({
        userId: selectedUser.userId,
        reason: reason.trim(),
        permanent: duration === 'permanent',
        duration: duration !== 'permanent' ? Number.parseInt(duration, 10) * 86400 : undefined,
      });
      onBanned();
      toastSuccess('User banned');
    } catch (mutationError) {
      toastError('Failed to ban user: ' + getErrorMessage(mutationError));
    }
  };

  return (
    <Modal open onClose={onClose} ariaLabel="Ban user">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-lg mx-4">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">Ban User</h3>

        {!selectedUser ? (
          <div className="space-y-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search by username, Telegram ID, or user ID"
                className="flex-1 px-3 py-2 border border-slate-300 rounded-lg"
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void handleSearch();
                  }
                }}
              />
              <button
                onClick={() => void handleSearch()}
                disabled={searchUsersMutation.isPending || !searchQuery.trim()}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg disabled:opacity-50"
              >
                {searchUsersMutation.isPending ? '...' : 'Search'}
              </button>
            </div>
            {searchResults.length > 0 && (
              <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg">
                {searchResults.map((user) => (
                  <button
                    key={user.userId}
                    onClick={() => setSelectedUser(user)}
                    className="w-full text-left p-3 hover:bg-slate-50 border-b border-slate-100 last:border-b-0"
                  >
                    <p className="font-medium text-slate-800">{user.displayName || 'Unknown'}</p>
                    <p className="text-xs text-slate-500">
                      {user.username ? `@${user.username}` : user.userId} | Telegram: {user.telegramId || 'n/a'}
                    </p>
                  </button>
                ))}
              </div>
            )}
            {searchQuery && searchResults.length === 0 && !searchUsersMutation.isPending && (
              <p className="text-sm text-slate-500 text-center py-4">No users found</p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-slate-50 p-3 rounded-lg flex justify-between items-center">
              <div>
                <p className="font-medium text-slate-800">{selectedUser.displayName || 'Unknown'}</p>
                <p className="text-xs text-slate-500">
                  {selectedUser.username ? `@${selectedUser.username}` : selectedUser.userId} | Telegram: {selectedUser.telegramId || 'n/a'}
                </p>
              </div>
              <button
                onClick={() => setSelectedUser(null)}
                className="text-slate-600 hover:text-slate-800 text-sm"
              >
                Change
              </button>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Ban Duration</label>
              <select
                value={duration}
                onChange={(event) => setDuration(event.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              >
                <option value="1">1 day</option>
                <option value="3">3 days</option>
                <option value="7">7 days</option>
                <option value="14">14 days</option>
                <option value="30">30 days</option>
                <option value="permanent">Permanent</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Reason</label>
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                placeholder="Why are you banning this user?"
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={banUserMutation.isPending}
                className="px-4 py-2 bg-red-600 text-white rounded-lg disabled:opacity-50"
              >
                {banUserMutation.isPending ? 'Banning...' : 'Ban User'}
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
