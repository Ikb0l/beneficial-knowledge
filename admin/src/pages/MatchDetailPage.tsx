import { Link, useParams } from 'react-router-dom';
import { useMatchDetailQuery } from '../domains/matches/api';

export default function MatchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const matchQuery = useMatchDetailQuery(id);
  const match = matchQuery.data?.match || null;
  const error = matchQuery.error?.message || null;

  if (matchQuery.isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!match) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-500">{error || 'Match not found'}</p>
        <Link to="/matches" className="text-primary-600 hover:text-primary-700 mt-2 inline-block">
          Back to Matches
        </Link>
      </div>
    );
  }

  const isDraw = match.winnerId === null;

  return (
    <div className="page-shell">
      <div className="flex items-center gap-4">
        <Link to="/matches" className="text-slate-600 hover:text-slate-800">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Match Details</h1>
          <p className="text-slate-600 capitalize">{(match.category || 'Unknown').replace(/_/g, ' ')}</p>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-sm text-yellow-700">
            Showing the latest successful result. Refresh warning: {error}
          </p>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="grid grid-cols-3 gap-4 items-center">
          <div className="text-center">
            <div className="h-16 w-16 rounded-full bg-primary-100 flex items-center justify-center mx-auto mb-3">
              <span className="text-primary-600 text-xl font-bold">
                {match.player1Name?.[0] || '?'}
              </span>
            </div>
            <p className="font-semibold text-slate-800">{match.player1Name || 'Unknown'}</p>
            <p className="text-3xl font-bold text-slate-800 my-2">{match.player1Score}</p>
            <p className="text-sm text-slate-500">
              MMR: {match.player1MmrBefore ?? 0} → {match.player1MmrAfter ?? 0}
              <span className={(match.player1MmrAfter ?? 0) > (match.player1MmrBefore ?? 0) ? 'text-green-600' : 'text-red-600'}>
                {' '}({(match.player1MmrAfter ?? 0) > (match.player1MmrBefore ?? 0) ? '+' : ''}{(match.player1MmrAfter ?? 0) - (match.player1MmrBefore ?? 0)})
              </span>
            </p>
            {match.winnerId === match.player1Id && (
              <span className="inline-block mt-2 badge badge-success">Winner</span>
            )}
          </div>

          <div className="text-center">
            <p className="text-2xl font-bold text-slate-400">VS</p>
            <p className={`text-lg font-semibold mt-2 ${isDraw ? 'text-yellow-600' : 'text-green-600'}`}>
              {isDraw ? 'DRAW' : 'VICTORY'}
            </p>
            <p className="text-sm text-slate-500 mt-2">
              Duration: {Math.floor(match.durationSeconds / 60)}:{(match.durationSeconds % 60).toString().padStart(2, '0')}
            </p>
          </div>

          <div className="text-center">
            <div className="h-16 w-16 rounded-full bg-primary-100 flex items-center justify-center mx-auto mb-3">
              <span className="text-primary-600 text-xl font-bold">
                {match.player2Name?.[0] || '?'}
              </span>
            </div>
            <p className="font-semibold text-slate-800">{match.player2Name || 'Unknown'}</p>
            <p className="text-3xl font-bold text-slate-800 my-2">{match.player2Score}</p>
            <p className="text-sm text-slate-500">
              MMR: {match.player2MmrBefore ?? 0} → {match.player2MmrAfter ?? 0}
              <span className={(match.player2MmrAfter ?? 0) > (match.player2MmrBefore ?? 0) ? 'text-green-600' : 'text-red-600'}>
                {' '}({(match.player2MmrAfter ?? 0) > (match.player2MmrBefore ?? 0) ? '+' : ''}{(match.player2MmrAfter ?? 0) - (match.player2MmrBefore ?? 0)})
              </span>
            </p>
            {match.winnerId === match.player2Id && (
              <span className="inline-block mt-2 badge badge-success">Winner</span>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-800">Questions Breakdown</h2>
        </div>
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">#</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Question</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase">{match.player1Name}</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase">{match.player2Name}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {(match.questionsData || []).map((question, index) => (
              <tr key={question.questionId}>
                <td className="px-4 py-3 text-sm text-slate-600">{index + 1}</td>
                <td className="px-4 py-3">
                  <p className="text-sm text-slate-800">{question.questionText}</p>
                </td>
                <td className="px-4 py-3 text-center">
                  {question.player1Answer === null ? (
                    <span className="text-slate-400">No answer</span>
                  ) : question.player1Answer === question.correctIndex ? (
                    <div>
                      <span className="text-green-600">Correct</span>
                      <p className="text-xs text-slate-500">{((question.player1TimeMs ?? 0) / 1000).toFixed(1)}s</p>
                    </div>
                  ) : (
                    <span className="text-red-600">Wrong</span>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  {question.player2Answer === null ? (
                    <span className="text-slate-400">No answer</span>
                  ) : question.player2Answer === question.correctIndex ? (
                    <div>
                      <span className="text-green-600">Correct</span>
                      <p className="text-xs text-slate-500">{((question.player2TimeMs ?? 0) / 1000).toFixed(1)}s</p>
                    </div>
                  ) : (
                    <span className="text-red-600">Wrong</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Match Information</h2>
        <dl className="grid grid-cols-2 gap-4">
          <div>
            <dt className="text-sm text-slate-600">Match ID</dt>
            <dd className="text-sm font-mono text-slate-800">{match.matchId}</dd>
          </div>
          <div>
            <dt className="text-sm text-slate-600">Completed At</dt>
            <dd className="text-sm text-slate-800">
              {match.completedAt ? new Date(match.completedAt).toLocaleString() : 'Unknown'}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
