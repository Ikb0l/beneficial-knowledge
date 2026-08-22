import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useCategories } from '../hooks/useCategories';
import { useMatchesQuery } from '../domains/matches/api';
import SavedViewsToolbar from '../components/SavedViewsToolbar';

const PAGE_SIZE = 20;

function parsePositiveInt(value: string | null, fallback: number) {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export default function MatchesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { categories } = useCategories();
  const page = parsePositiveInt(searchParams.get('page'), 1);
  const category = searchParams.get('category') || 'all';
  const userId = searchParams.get('userId') || '';
  const [userIdInput, setUserIdInput] = useState(userId);
  const matchesQuery = useMatchesQuery({
    page,
    pageSize: PAGE_SIZE,
    category: category === 'all' ? undefined : category,
    userId: userId || undefined,
  });

  useEffect(() => {
    setUserIdInput(userId);
  }, [userId]);

  const matches = matchesQuery.data?.items || [];
  const total = matchesQuery.data?.total || 0;
  const error = matchesQuery.error?.message || null;

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

  const handleApplyFilters = () => {
    updateParams({
      userId: userIdInput.trim() || undefined,
    });
  };

  return (
    <div className="page-shell">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Match History</h1>
        <p className="text-slate-600">Review completed matches across categories and users</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
        <div className="flex flex-wrap gap-4">
          <select
            value={category}
            onChange={(event) => updateParams({ category: event.target.value === 'all' ? undefined : event.target.value })}
            className="px-3 py-2 border border-slate-300 rounded-lg"
          >
            <option value="all">Any Category</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.categoryKey}>{cat.name}</option>
            ))}
          </select>
          <div className="flex-1 min-w-[200px]">
            <input
              type="text"
              value={userIdInput}
              onChange={(event) => setUserIdInput(event.target.value)}
              placeholder="Filter by user ID..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>
          <button
            onClick={handleApplyFilters}
            className="px-4 py-2 text-white bg-primary-600 rounded-lg hover:bg-primary-700"
          >
            Apply
          </button>
          <button
            onClick={() => void matchesQuery.refetch()}
            disabled={matchesQuery.isFetching}
            className="px-4 py-2 border border-slate-300 rounded-lg disabled:opacity-50"
          >
            {matchesQuery.isFetching ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      <SavedViewsToolbar
        storageKey="matches"
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
        {matchesQuery.isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          </div>
        ) : matches.length === 0 ? (
          <div className="flex items-center justify-center h-64">
            <p className="text-slate-500">No matches found</p>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Match</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Category</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Score</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Result</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Date</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {matches.map((match) => (
                <tr key={match.matchId} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-slate-800">{match.player1Name}</p>
                      <p className="text-xs text-slate-500">vs {match.player2Name}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-slate-600 capitalize">{match.category.replace(/_/g, ' ')}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm font-medium text-slate-800">
                      {match.player1Score} - {match.player2Score}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {match.winnerId === null ? (
                      <span className="badge badge-warning">Draw</span>
                    ) : (
                      <span className="badge badge-success">
                        {match.winnerId === match.player1Id ? match.player1Name : match.player2Name} won
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-slate-600">
                      {match.completedAt ? new Date(match.completedAt).toLocaleString() : 'Unknown'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      to={`/matches/${match.matchId}`}
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
    </div>
  );
}
