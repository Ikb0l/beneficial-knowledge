import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useRBAC } from '../hooks/useRBAC';
import { useCategories } from '../hooks/useCategories';
import {
  useBanUserMutation,
  useUnbanUserMutation,
  useUpdateUserMmrMutation,
  useUserDetailQuery,
} from '../domains/users/api';
import { getErrorMessage } from '../lib/errors';
import { confirmAction } from '../lib/confirm';
import { toastError, toastSuccess } from '../lib/toast';
import Modal from '../components/Modal';

function formatDateTime(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : 'Unknown';
}

function formatDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleDateString() : 'Unknown';
}

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { canPerform } = useRBAC();
  const { categories } = useCategories();
  const userQuery = useUserDetailQuery(id);
  const updateUserMmrMutation = useUpdateUserMmrMutation();
  const banUserMutation = useBanUserMutation();
  const unbanUserMutation = useUnbanUserMutation();
  const [showMmrModal, setShowMmrModal] = useState(false);
  const [showBanModal, setShowBanModal] = useState(false);
  const [newMmr, setNewMmr] = useState('');
  const [mmrReason, setMmrReason] = useState('');
  const [banReason, setBanReason] = useState('');
  const [banDuration, setBanDuration] = useState('permanent');

  const user = userQuery.data?.user || null;
  const error = userQuery.error?.message || null;
  const categoryNameByKey = new Map(categories.map((category) => [category.categoryKey, category.name]));
  const categoryStatsEntries = Object.entries(user?.categoryStats || {}).sort(
    (left, right) => right[1].gamesPlayed - left[1].gamesPlayed,
  );
  const activeBan = (user?.banHistory || []).find((entry) => entry.isActive) || null;

  async function handleMmrAdjust() {
    if (!id || !user) {
      return;
    }

    const mmrValue = Number(newMmr);
    if (!Number.isFinite(mmrValue)) {
      toastError('Please enter a valid MMR value');
      return;
    }

    const reason = mmrReason.trim();
    if (reason.length < 5) {
      toastError('Reason must be at least 5 characters');
      return;
    }
    if (reason.length > 500) {
      toastError('Reason must be less than 500 characters');
      return;
    }

    try {
      await updateUserMmrMutation.mutateAsync({
        userId: id,
        newMmr: mmrValue,
        reason,
      });
      setShowMmrModal(false);
      setNewMmr('');
      setMmrReason('');
      toastSuccess('MMR updated');
    } catch (mutationError) {
      toastError('Failed to adjust MMR: ' + getErrorMessage(mutationError));
    }
  }

  async function handleBan() {
    if (!id) {
      return;
    }

    const reason = banReason.trim();
    if (!reason) {
      toastError('Please provide a reason');
      return;
    }

    try {
      await banUserMutation.mutateAsync({
        userId: id,
        reason,
        permanent: banDuration === 'permanent',
        duration: banDuration !== 'permanent' ? Number.parseInt(banDuration, 10) * 86400 : undefined,
      });
      setShowBanModal(false);
      setBanReason('');
      toastSuccess('User banned');
    } catch (mutationError) {
      toastError('Failed to ban user: ' + getErrorMessage(mutationError));
    }
  }

  async function handleUnban() {
    if (!id) {
      return;
    }

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
      await unbanUserMutation.mutateAsync(id);
      toastSuccess('User unbanned');
    } catch (mutationError) {
      toastError('Failed to unban user: ' + getErrorMessage(mutationError));
    }
  }

  if (userQuery.isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-500">{error || 'User not found'}</p>
        <Link to="/users" className="text-primary-600 hover:text-primary-700 mt-2 inline-block">
          Back to Users
        </Link>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <div className="flex items-center gap-4">
        <Link to="/users" className="text-slate-600 hover:text-slate-800">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-800">{user.displayName || 'Unknown User'}</h1>
          <p className="text-slate-600">
            {user.username ? `@${user.username}` : user.userId}
          </p>
        </div>
        <div className="flex gap-2">
          {canPerform('adjust_mmr') && (
            <button
              onClick={() => {
                setNewMmr(String(user.mmr));
                setShowMmrModal(true);
              }}
              className="px-4 py-2 text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Adjust MMR
            </button>
          )}
          {user.isBanned ? (
            canPerform('unban_user') && (
              <button
                onClick={() => void handleUnban()}
                disabled={unbanUserMutation.isPending}
                className="px-4 py-2 text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {unbanUserMutation.isPending ? 'Unbanning...' : 'Unban User'}
              </button>
            )
          ) : (
            canPerform('ban_user') && (
              <button
                onClick={() => setShowBanModal(true)}
                className="px-4 py-2 text-white bg-red-600 rounded-lg hover:bg-red-700"
              >
                Ban User
              </button>
            )
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-sm text-yellow-700">
            Showing the latest successful result. Refresh warning: {error}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard label="MMR" value={String(user.mmr)} detail={`Peak: ${user.peakMmr}`} />
        <StatCard label="Games" value={String(user.gamesPlayed)} detail={`${user.wins}W / ${user.losses}L`} />
        <StatCard label="Win Rate" value={`${(user.winRate ?? 0).toFixed(1)}%`} />
        <StatCard label="Best Streak" value={String(user.bestStreak)} detail={`Rank: ${user.rankTier || 'unranked'}`} />
        <StatCard label="Average Score" value={(user.averageScore ?? 0).toFixed(1)} detail={`Total score: ${user.totalScore || 0}`} />
      </div>

      <div className="bg-white rounded-[clamp(12px,2.6vw,18px)] shadow-sm border border-slate-200 p-[clamp(16px,3vw,22px)]">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Profile Information</h2>
        <dl className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <InfoRow label="Telegram ID" value={String(user.telegramId || 'n/a')} />
          <InfoRow label="Status" value={user.isBanned ? 'Banned' : 'Active'} badge={user.isBanned ? 'badge-error' : 'badge-success'} />
          <InfoRow label="Joined" value={formatDate(user.createdAt)} />
          <InfoRow label="Last Active" value={formatDateTime(user.lastActiveAt)} />
        </dl>
        {activeBan && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-medium text-red-800">Current Ban</p>
            <p className="mt-1 text-sm text-red-700">{activeBan.reason}</p>
            <p className="mt-1 text-xs text-red-600">
              Issued by {activeBan.bannedByName || 'Unknown'} on {formatDateTime(activeBan.createdAt)}
              {activeBan.isPermanent ? ' • Permanent' : activeBan.expiresAt ? ` • Expires ${formatDateTime(activeBan.expiresAt)}` : ''}
            </p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200">
            <h2 className="text-lg font-semibold text-slate-800">Category Performance</h2>
          </div>
          {categoryStatsEntries.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">No category-specific history yet.</p>
          ) : (
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Category</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">MMR</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Games</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Wins</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {categoryStatsEntries.map(([categoryKey, stats]) => (
                  <tr key={categoryKey}>
                    <td className="px-4 py-3 text-sm text-slate-800">
                      {categoryNameByKey.get(categoryKey) || categoryKey}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">{stats.mmr}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{stats.gamesPlayed}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {stats.wins} ({stats.gamesPlayed > 0 ? `${Math.round((stats.wins / stats.gamesPlayed) * 100)}%` : '0%'})
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200">
            <h2 className="text-lg font-semibold text-slate-800">Recent Matches</h2>
          </div>
          {user.recentMatches.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">No recent matches recorded.</p>
          ) : (
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Match</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Score</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">When</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-slate-500">Open</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {user.recentMatches.map((match) => (
                  <tr key={match.matchId}>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-slate-800">
                        {match.player1Name} vs {match.player2Name}
                      </p>
                      <p className="text-xs text-slate-500 capitalize">{match.category.replace(/_/g, ' ')}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {match.player1Score} - {match.player2Score}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {formatDateTime(match.completedAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        to={`/matches/${match.matchId}`}
                        className="text-sm text-primary-600 hover:text-primary-700"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200">
            <h2 className="text-lg font-semibold text-slate-800">MMR Adjustment History</h2>
          </div>
          {user.mmrHistory.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">No manual MMR adjustments have been recorded.</p>
          ) : (
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">When</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Change</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Admin</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {user.mmrHistory.map((entry) => (
                  <tr key={entry.id}>
                    <td className="px-4 py-3 text-sm text-slate-600">{formatDateTime(entry.createdAt)}</td>
                    <td className="px-4 py-3 text-sm text-slate-800">
                      {entry.oldMmr} → {entry.newMmr}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">{entry.adjustedByName || 'Unknown'}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{entry.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200">
            <h2 className="text-lg font-semibold text-slate-800">Ban History</h2>
          </div>
          {user.banHistory.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">No bans recorded for this user.</p>
          ) : (
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Reason</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Issued</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Lifted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {user.banHistory.map((entry) => (
                  <tr key={entry.id}>
                    <td className="px-4 py-3">
                      <span className={`badge ${entry.isActive ? 'badge-error' : 'badge-success'}`}>
                        {entry.isActive ? 'Active' : 'Lifted'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">{entry.reason}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {entry.bannedByName || 'System'}<br />
                      <span className="text-xs text-slate-500">{formatDateTime(entry.createdAt)}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {entry.unbannedAt ? formatDateTime(entry.unbannedAt) : entry.isPermanent ? 'Permanent' : entry.expiresAt ? `Expires ${formatDateTime(entry.expiresAt)}` : 'n/a'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <Modal open={showMmrModal} onClose={() => setShowMmrModal(false)} ariaLabel="Adjust MMR">
        <div className="bg-white rounded-[clamp(12px,2.6vw,18px)] shadow-xl p-[clamp(16px,3vw,22px)] w-full max-w-[min(92vw,32rem)] md:max-w-md mx-4">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Adjust MMR</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Current MMR: {user.mmr}</label>
              <input
                type="number"
                value={newMmr}
                onChange={(event) => setNewMmr(event.target.value)}
                placeholder="New MMR value"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Reason</label>
              <textarea
                value={mmrReason}
                onChange={(event) => setMmrReason(event.target.value)}
                placeholder="Why are you adjusting this user's MMR?"
                rows={3}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button
              type="button"
              onClick={() => setShowMmrModal(false)}
              disabled={updateUserMmrMutation.isPending}
              className="px-4 py-2 text-slate-700 bg-white border border-slate-300 rounded-lg disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleMmrAdjust()}
              disabled={updateUserMmrMutation.isPending}
              className="px-4 py-2 text-white bg-primary-600 rounded-lg disabled:opacity-50"
            >
              {updateUserMmrMutation.isPending ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={showBanModal} onClose={() => setShowBanModal(false)} ariaLabel="Ban user">
        <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Ban User</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Duration</label>
              <select
                value={banDuration}
                onChange={(event) => setBanDuration(event.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              >
                <option value="1">1 day</option>
                <option value="7">7 days</option>
                <option value="30">30 days</option>
                <option value="permanent">Permanent</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Reason</label>
              <textarea
                value={banReason}
                onChange={(event) => setBanReason(event.target.value)}
                placeholder="Why are you banning this user?"
                rows={3}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button
              type="button"
              onClick={() => setShowBanModal(false)}
              disabled={banUserMutation.isPending}
              className="px-4 py-2 text-slate-700 bg-white border border-slate-300 rounded-lg disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleBan()}
              disabled={banUserMutation.isPending}
              className="px-4 py-2 text-white bg-red-600 rounded-lg disabled:opacity-50"
            >
              {banUserMutation.isPending ? 'Banning...' : 'Ban User'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function StatCard({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="bg-white rounded-[clamp(12px,2.6vw,18px)] shadow-sm border border-slate-200 p-[clamp(12px,2.6vw,18px)]">
      <p className="text-sm text-slate-600">{label}</p>
      <p className="text-2xl font-bold text-slate-800">{value}</p>
      {detail ? <p className="text-xs text-slate-500">{detail}</p> : null}
    </div>
  );
}

function InfoRow({
  label,
  value,
  badge,
}: {
  label: string;
  value: string;
  badge?: string;
}) {
  return (
    <div>
      <dt className="text-sm text-slate-600">{label}</dt>
      <dd className={badge ? undefined : 'text-sm font-medium text-slate-800'}>
        {badge ? <span className={`badge ${badge}`}>{value}</span> : value}
      </dd>
    </div>
  );
}
