import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useUsersQuery } from '../domains/users/api';
import { useDebounce } from '../hooks/useDebounce';
import SavedViewsToolbar from '../components/SavedViewsToolbar';
import { Button, DataTableShell, EmptyState, Input, PageHeader, Select, Spinner } from '../components/ui';

const PAGE_SIZE = 20;
const RANK_TIER_OPTIONS = ['all', 'bronze', 'silver', 'gold', 'platinum', 'diamond', 'master', 'grandmaster'] as const;

function parsePositiveInt(value: string | null, fallback: number) {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export default function UsersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = parsePositiveInt(searchParams.get('page'), 1);
  const search = searchParams.get('search') || '';
  const banStatus = searchParams.get('banStatus') || 'all';
  const activityBucket = searchParams.get('activityBucket') || 'all';
  const rankTier = searchParams.get('rankTier') || 'all';
  const sortBy = searchParams.get('sortBy') || 'lastActiveAt';
  const sortOrder = searchParams.get('sortOrder') === 'asc' ? 'asc' : 'desc';
  const [searchInput, setSearchInput] = useState(search);
  const debouncedSearch = useDebounce(searchInput, 500);

  const { data, isLoading, error, refetch, isFetching } = useUsersQuery({
    page,
    pageSize: PAGE_SIZE,
    search: search || undefined,
    banStatus: banStatus === 'all' ? 'all' : (banStatus as 'active' | 'banned'),
    activityBucket: activityBucket as 'all' | 'active_24h' | 'active_7d' | 'active_30d' | 'dormant_30d',
    rankTier: rankTier === 'all' ? undefined : rankTier,
    sortBy,
    sortOrder,
  });

  useEffect(() => {
    setSearchInput(search);
  }, [search]);

  useEffect(() => {
    if (debouncedSearch === search) {
      return;
    }

    updateParams({ search: debouncedSearch || undefined }, { resetPage: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, search]);

  const users = data?.items || [];
  const total = data?.total || 0;

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

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
    updateParams({ search: searchInput.trim() || undefined }, { resetPage: true });
  };

  const getRankBadgeColor = (rank: string) => {
    const colors: Record<string, string> = {
      bronze: 'bg-amber-100 text-amber-800',
      silver: 'bg-slate-100 text-slate-800',
      gold: 'bg-yellow-100 text-yellow-800',
      platinum: 'bg-cyan-100 text-cyan-800',
      diamond: 'bg-blue-100 text-blue-800',
      master: 'bg-purple-100 text-purple-800',
      grandmaster: 'bg-red-100 text-red-800',
    };
    return colors[rank] || 'bg-slate-100 text-slate-800';
  };

  return (
    <div className="page-shell">
      <PageHeader
        title="Users"
        subtitle="Support console for player accounts, bans, and ranking signals"
        actions={(
          <Button variant="secondary" onClick={() => void refetch()} loading={isFetching}>
            Refresh
          </Button>
        )}
      />

      <div className="panel-card p-4">
        <form onSubmit={handleSearch} className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <Input
              type="text"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search by username, Telegram ID, or user ID..."
            />
          </div>
          <Select
            value={banStatus}
            onChange={(event) => updateParams({ banStatus: event.target.value === 'all' ? undefined : event.target.value })}
          >
            <option value="all">All Statuses</option>
            <option value="active">Active Only</option>
            <option value="banned">Banned Only</option>
          </Select>
          <Select
            value={activityBucket}
            onChange={(event) => updateParams({ activityBucket: event.target.value === 'all' ? undefined : event.target.value })}
          >
            <option value="all">Any Activity</option>
            <option value="active_24h">Active 24h</option>
            <option value="active_7d">Active 7d</option>
            <option value="active_30d">Active 30d</option>
            <option value="dormant_30d">Dormant 30d+</option>
          </Select>
          <Select
            value={rankTier}
            onChange={(event) => updateParams({ rankTier: event.target.value === 'all' ? undefined : event.target.value })}
          >
            {RANK_TIER_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option === 'all' ? 'Any Rank' : option.charAt(0).toUpperCase() + option.slice(1)}
              </option>
            ))}
          </Select>
          <Select
            value={sortBy}
            onChange={(event) => updateParams({ sortBy: event.target.value })}
          >
            <option value="lastActiveAt">Last Active</option>
            <option value="mmr">MMR</option>
            <option value="gamesPlayed">Games Played</option>
            <option value="winRate">Win Rate</option>
            <option value="createdAt">Join Date</option>
          </Select>
          <Select
            value={sortOrder}
            onChange={(event) => updateParams({ sortOrder: event.target.value })}
          >
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </Select>
          <Button type="submit">Search</Button>
        </form>
      </div>

      <SavedViewsToolbar
        storageKey="users"
        searchParams={searchParams}
        onApply={(next) => setSearchParams(next)}
      />

      {error && (
        <div className="rounded-xl border border-yellow-300/75 bg-yellow-100/70 p-4">
          <p className="text-sm text-yellow-800">
            Showing the latest successful result. Refresh warning: {error.message}
          </p>
        </div>
      )}

      <DataTableShell>
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Spinner />
          </div>
        ) : users.length === 0 ? (
          <div className="flex items-center justify-center h-64">
            <EmptyState title="No users found" />
          </div>
        ) : (
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">User</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Telegram ID</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Rank</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Stats</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {users.map((user) => (
                <tr key={user.userId} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-100">
                        <span className="font-medium text-primary-600">
                          {user.displayName?.[0]?.toUpperCase() || 'U'}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-800">{user.displayName || 'Unknown'}</p>
                        <p className="text-xs text-slate-500">
                          {user.username ? `@${user.username}` : user.userId}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-slate-600">{user.telegramId || 'n/a'}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div>
                      <span className={`badge ${getRankBadgeColor(user.rankTier)} capitalize`}>
                        {user.rankTier || 'unranked'}
                      </span>
                      <p className="text-xs text-slate-500 mt-1">MMR: {user.mmr}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-xs text-slate-500">
                      <p>Games: {user.gamesPlayed}</p>
                      <p>Win Rate: {(user.winRate ?? 0).toFixed(1)}%</p>
                      <p>Last Active: {user.lastActiveAt ? new Date(user.lastActiveAt).toLocaleString() : 'Unknown'}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`badge ${user.isBanned ? 'badge-error' : 'badge-success'}`}>
                      {user.isBanned ? 'Banned' : 'Active'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      to={`/users/${user.userId}`}
                      className="text-primary-600 hover:text-primary-700 text-sm"
                    >
                      View Details
                    </Link>
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
                className="btn btn-secondary px-3 py-1 text-sm"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(page + 1)}
                disabled={page * PAGE_SIZE >= total}
                className="btn btn-secondary px-3 py-1 text-sm"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </DataTableShell>
    </div>
  );
}
