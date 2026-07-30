import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useRBAC } from '../hooks/useRBAC';
import { useCategories, type Category } from '../hooks/useCategories';
import type { TournamentStatus } from '../types';
import { getErrorMessage } from '../lib/errors';
import { confirmAction } from '../lib/confirm';
import { toastError, toastSuccess } from '../lib/toast';
import { BEST_OF_OPTIONS, buildBestOfConfig } from '../lib/tournamentBestOf';
import {
  useCancelTournamentMutation,
  useDisqualifyTournamentParticipantMutation,
  useForfeitTournamentParticipantMutation,
  usePauseTournamentMutation,
  useRepairTournamentBestOfMutation,
  useReportTournamentMatchResultMutation,
  useResumeTournamentMutation,
  useShuffleTournamentSeedsMutation,
  useStartTournamentMutation,
  useTournamentDetailQuery,
  useUpdateTournamentMutation,
  useUpdateTournamentParticipantSeedMutation,
} from '../domains/tournaments/api';
import type {
  TournamentDetail,
  TournamentMatch,
  TournamentParticipant as Participant,
} from '../domains/tournaments/contracts';
import Modal from '../components/Modal';
import { Input, Select } from '../components/ui';

interface RewardEntry {
  mmr_bonus?: number;
}

const statusColors: Record<string, string> = {
  upcoming: 'bg-blue-100 text-blue-800',
  registration: 'bg-green-100 text-green-800',
  in_progress: 'bg-yellow-100 text-yellow-800',
  paused: 'bg-orange-100 text-orange-800',
  completed: 'bg-gray-100 text-gray-800',
  cancelled: 'bg-red-100 text-red-800',
};

export default function TournamentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { canPerform } = useRBAC();
  const { categories, isLoading: categoriesLoading, error: categoriesError } = useCategories();
  const tournamentQuery = useTournamentDetailQuery(id);
  const startTournamentMutation = useStartTournamentMutation();
  const cancelTournamentMutation = useCancelTournamentMutation();
  const pauseTournamentMutation = usePauseTournamentMutation();
  const resumeTournamentMutation = useResumeTournamentMutation();
  const shuffleTournamentSeedsMutation = useShuffleTournamentSeedsMutation();
  const repairTournamentBestOfMutation = useRepairTournamentBestOfMutation();
  const disqualifyParticipantMutation = useDisqualifyTournamentParticipantMutation();
  const forfeitParticipantMutation = useForfeitTournamentParticipantMutation();
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [reportMatch, setReportMatch] = useState<TournamentMatch | null>(null);
  const [seedEditParticipant, setSeedEditParticipant] = useState<Participant | null>(null);
  const [participantAction, setParticipantAction] = useState<{ participant: Participant; action: 'disqualify' | 'forfeit' } | null>(null);
  const [participantSearch, setParticipantSearch] = useState('');
  const [participantStatusFilter, setParticipantStatusFilter] = useState('all');
  const [matchStatusFilter, setMatchStatusFilter] = useState('all');
  const data = tournamentQuery.data || null;
  const isLoading = tournamentQuery.isLoading;
  const error = tournamentQuery.error?.message || null;

  async function handleStartTournament() {
    if (!id) return;
    if (!canPerform('start_tournament')) {
      toastError('Only Super Admins can start tournaments');
      return;
    }
    if (!(await confirmAction({
      title: 'Start tournament?',
      message: 'This will generate the bracket and begin the first round.',
      confirmLabel: 'Start',
    }))) return;
    setActionLoading('start');
    try {
      await startTournamentMutation.mutateAsync(id);
      await tournamentQuery.refetch();
      toastSuccess('Tournament started');
    } catch (err: unknown) {
      console.error('Error starting tournament:', err);
      toastError('Failed to start tournament: ' + getErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  }

  async function handleCancelTournament() {
    if (!id) return;
    if (!canPerform('cancel_tournament')) {
      toastError('Only Super Admins can cancel tournaments');
      return;
    }
    if (!(await confirmAction({
      title: 'Cancel tournament?',
      message: 'This action cannot be undone.',
      confirmLabel: 'Cancel tournament',
      tone: 'danger',
    }))) return;
    setActionLoading('cancel');
    try {
      await cancelTournamentMutation.mutateAsync(id);
      await tournamentQuery.refetch();
      toastSuccess('Tournament cancelled');
    } catch (err) {
      console.error('Error cancelling tournament:', err);
      toastError('Failed to cancel tournament: ' + getErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  }

  async function handlePauseTournament() {
    if (!id) return;
    if (!canPerform('pause_tournament')) {
      toastError('Only Super Admins can pause tournaments');
      return;
    }
    if (!(await confirmAction({
      title: 'Pause tournament?',
      message: 'Matches in progress will continue, but new matches cannot start.',
      confirmLabel: 'Pause',
    }))) return;
    setActionLoading('pause');
    try {
      await pauseTournamentMutation.mutateAsync(id);
      await tournamentQuery.refetch();
      toastSuccess('Tournament paused');
    } catch (err) {
      console.error('Error pausing tournament:', err);
      toastError('Failed to pause tournament: ' + getErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  }

  async function handleResumeTournament() {
    if (!id) return;
    if (!canPerform('resume_tournament')) {
      toastError('Only Super Admins can resume tournaments');
      return;
    }
    if (!(await confirmAction({
      title: 'Resume tournament?',
      message: 'Do you want to resume this tournament?',
      confirmLabel: 'Resume',
    }))) return;
    setActionLoading('resume');
    try {
      await resumeTournamentMutation.mutateAsync(id);
      await tournamentQuery.refetch();
      toastSuccess('Tournament resumed');
    } catch (err) {
      console.error('Error resuming tournament:', err);
      toastError('Failed to resume tournament: ' + getErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  }

  async function handleShuffleSeeds() {
    if (!id) return;
    if (!canPerform('shuffle_tournament_seeds')) {
      toastError('Only Super Admins can shuffle seeds');
      return;
    }
    if (!(await confirmAction({
      title: 'Shuffle seeds?',
      message: 'This only works before the tournament starts.',
      confirmLabel: 'Shuffle',
      tone: 'danger',
    }))) return;
    setActionLoading('shuffle');
    try {
      await shuffleTournamentSeedsMutation.mutateAsync(id);
      await tournamentQuery.refetch();
      toastSuccess('Seeds shuffled');
    } catch (err) {
      console.error('Error shuffling seeds:', err);
      toastError('Failed to shuffle seeds: ' + getErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  }

  async function handleRepairBestOf() {
    if (!id) return;
    if (!canPerform('repair_tournament_best_of')) {
      toastError('Only Super Admins can repair tournament best-of settings');
      return;
    }
    if (!(await confirmAction({
      title: 'Repair best-of values?',
      message: 'This will re-sync pending and ready matches with the tournament best-of configuration.',
      confirmLabel: 'Repair',
    }))) return;
    setActionLoading('repair_best_of');
    try {
      const response = await repairTournamentBestOfMutation.mutateAsync(id);
      await tournamentQuery.refetch();
      const updated = Number(response?.bestOfResync?.updated || 0);
      const skipped = Number(response?.bestOfResync?.skipped || 0);
      toastSuccess(`Best-of repaired (${updated} updated, ${skipped} skipped)`);
    } catch (err) {
      console.error('Error repairing tournament best-of:', err);
      toastError('Failed to repair best-of: ' + getErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDisqualifyParticipant() {
    if (!id || !participantAction || participantAction.action !== 'disqualify') return;
    setActionLoading('disqualify');
    try {
      await disqualifyParticipantMutation.mutateAsync({
        tournamentId: id,
        participantId: participantAction.participant.id,
      });
      setParticipantAction(null);
      await tournamentQuery.refetch();
      toastSuccess('Participant disqualified');
    } catch (err) {
      console.error('Error disqualifying participant:', err);
      toastError('Failed to disqualify participant: ' + getErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  }

  async function handleForfeitParticipant() {
    if (!id || !participantAction || participantAction.action !== 'forfeit') return;
    setActionLoading('forfeit');
    try {
      await forfeitParticipantMutation.mutateAsync({
        tournamentId: id,
        participantId: participantAction.participant.id,
      });
      setParticipantAction(null);
      await tournamentQuery.refetch();
      toastSuccess('Participant forfeited');
    } catch (err) {
      console.error('Error forfeiting participant:', err);
      toastError('Failed to forfeit participant: ' + getErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  }

  // Get participant name by ID
  function getParticipantName(participantId: string | null | undefined): string {
    if (!participantId || !data) return 'TBD';
    const participant = data.participants.find(p => p.id === participantId);
    return participant?.displayName || 'Unknown';
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <p className="text-red-500 mb-4">{error || 'Tournament not found'}</p>
          <Link to="/tournaments" className="text-primary-600 hover:text-primary-700">
            Back to Tournaments
          </Link>
        </div>
      </div>
    );
  }

  const { tournament, participants, matches } = data;
  const canEditTournament = !['in_progress', 'completed'].includes(tournament.status);
  const canShuffleSeeds =
    ['upcoming', 'registration'].includes(tournament.status) &&
    tournament.seedingMode === 'random_opening_round' &&
    matches.length === 0;
  const participantSearchLower = participantSearch.trim().toLowerCase();
  const filteredParticipants = participants.filter((participant) => {
    if (participantStatusFilter !== 'all' && participant.status !== participantStatusFilter) {
      return false;
    }
    if (!participantSearchLower) {
      return true;
    }
    return [
      participant.displayName,
      participant.userId || '',
      participant.id,
    ].join(' ').toLowerCase().includes(participantSearchLower);
  });
  const filteredMatches = matches.filter((match) => matchStatusFilter === 'all' || match.status === matchStatusFilter);

  const matchesByBracket = filteredMatches.reduce((acc, match) => {
    const bracketType = match.bracketType || 'winners';
    const round = match.roundNumber;
    if (!acc[bracketType]) acc[bracketType] = {};
    if (!acc[bracketType][round]) acc[bracketType][round] = [];
    acc[bracketType][round].push(match);
    return acc;
  }, {} as Record<string, Record<number, TournamentMatch[]>>);

  const seedingMode = tournament.seedingMode || 'mmr';
  const hasOpeningRound = seedingMode === 'random_opening_round';
  const winnersRounds = matchesByBracket.winners || {};
  const openingMatches = hasOpeningRound ? (winnersRounds[1] || []) : [];
  const upperRoundsMap = { ...winnersRounds };
  if (hasOpeningRound && upperRoundsMap[1]) {
    delete upperRoundsMap[1];
  }

  const bracketSections = [
    ...(hasOpeningRound && openingMatches.length > 0
      ? [{ key: 'opening', label: 'Opening Round', rounds: { 1: openingMatches }, isGrandFinal: false }]
      : []),
    ...(Object.keys(upperRoundsMap).length > 0
      ? [{ key: 'winners', label: hasOpeningRound ? 'Upper Bracket' : 'Winners Bracket', rounds: upperRoundsMap, isGrandFinal: false }]
      : []),
    ...(tournament.format === 'double_elimination' && matchesByBracket.losers
      ? [{ key: 'losers', label: 'Lower Bracket', rounds: matchesByBracket.losers, isGrandFinal: false }]
      : []),
    ...(matchesByBracket.grand_final
      ? [{ key: 'grand_final', label: 'Grand Final', rounds: matchesByBracket.grand_final, isGrandFinal: true }]
      : []),
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/tournaments" className="text-slate-600 hover:text-slate-800">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900">{tournament.name}</h1>
            <span className={`px-2 py-1 text-xs rounded-full ${statusColors[tournament.status] || 'bg-slate-100'}`}>
              {tournament.status.replace(/_/g, ' ')}
            </span>
          </div>
          {tournament.description && (
            <p className="text-slate-600 mt-1">{tournament.description}</p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowEditModal(true)}
            disabled={!canEditTournament}
            title={!canEditTournament ? 'Cannot edit tournaments that are in progress or completed' : 'Edit tournament details'}
            className="px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Edit
          </button>
          {canShuffleSeeds && canPerform('shuffle_tournament_seeds') && (
            <button
              onClick={handleShuffleSeeds}
              disabled={actionLoading === 'shuffle'}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
            >
              {actionLoading === 'shuffle' ? 'Shuffling...' : 'Shuffle Seeds'}
            </button>
          )}
          {matches.length > 0 && canPerform('repair_tournament_best_of') && (
            <button
              onClick={handleRepairBestOf}
              disabled={actionLoading === 'repair_best_of'}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {actionLoading === 'repair_best_of' ? 'Repairing...' : 'Repair Best-of'}
            </button>
          )}
          {tournament.status === 'registration' && canPerform('start_tournament') && (
            <button
              onClick={handleStartTournament}
              disabled={actionLoading === 'start'}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              {actionLoading === 'start' ? 'Starting...' : 'Start Tournament'}
            </button>
          )}
          {['upcoming', 'registration'].includes(tournament.status) && canPerform('cancel_tournament') && (
            <button
              onClick={handleCancelTournament}
              disabled={actionLoading === 'cancel'}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              {actionLoading === 'cancel' ? 'Cancelling...' : 'Cancel Tournament'}
            </button>
          )}
          {tournament.status === 'in_progress' && canPerform('pause_tournament') && (
            <button
              onClick={handlePauseTournament}
              disabled={actionLoading === 'pause'}
              className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50"
            >
              {actionLoading === 'pause' ? 'Pausing...' : 'Pause Tournament'}
            </button>
          )}
          {tournament.status === 'paused' && canPerform('resume_tournament') && (
            <button
              onClick={handleResumeTournament}
              disabled={actionLoading === 'resume'}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              {actionLoading === 'resume' ? 'Resuming...' : 'Resume Tournament'}
            </button>
          )}
        </div>
      </div>

      {/* Tournament Info Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-slate-500">Format</p>
          <p className="text-lg font-medium capitalize">{tournament.format.replace(/_/g, ' ')}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-slate-500">Participants</p>
          <p className="text-lg font-medium">{participants.length} / {tournament.bracketSize}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-slate-500">MMR Range</p>
          <p className="text-lg font-medium">{tournament.minMmr} - {tournament.maxMmr}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-slate-500">Questions per Match</p>
          <p className="text-lg font-medium">{tournament.questionCount}</p>
        </div>
      </div>

      {/* Schedule Info */}
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="font-medium text-slate-900 mb-3">Schedule</h3>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-slate-500">Registration Opens</p>
            <p className="font-medium">{new Date(tournament.registrationStart).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-slate-500">Registration Closes</p>
            <p className="font-medium">{new Date(tournament.registrationEnd).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-slate-500">Tournament Starts</p>
            <p className="font-medium">{new Date(tournament.tournamentStart).toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* Participants Table */}
      <div className="bg-white rounded-lg shadow">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b p-4">
          <h2 className="text-lg font-semibold">
            Participants ({filteredParticipants.length}{filteredParticipants.length !== participants.length ? ` / ${participants.length}` : ''})
          </h2>
          <div className="flex flex-wrap gap-3">
            <Input
              value={participantSearch}
              onChange={(event) => setParticipantSearch(event.target.value)}
              placeholder="Search participant..."
              className="min-w-[220px]"
            />
            <Select
              value={participantStatusFilter}
              onChange={(event) => setParticipantStatusFilter(event.target.value)}
            >
              <option value="all">Any Status</option>
              <option value="active">Active</option>
              <option value="eliminated">Eliminated</option>
              <option value="forfeited">Forfeited</option>
              <option value="disqualified">Disqualified</option>
            </Select>
          </div>
        </div>
        {filteredParticipants.length === 0 ? (
          <p className="p-4 text-slate-500">No participants registered yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Seed</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Player</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">MMR at Reg.</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Record</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Score</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Placement</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredParticipants.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm">{p.seedNumber || '-'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {p.userId && !p.isBot ? (
                          <Link to={`/users/${p.userId}`} className="text-primary-600 hover:underline text-sm font-medium">
                            {p.displayName}
                          </Link>
                        ) : (
                          <span className="text-sm font-medium text-slate-800">{p.displayName}</span>
                        )}
                        {p.isBot && (
                          <span className="px-2 py-0.5 text-[10px] rounded-full bg-indigo-100 text-indigo-700 font-semibold">
                            BOT
                          </span>
                        )}
                        {p.botInfluenced && !p.isBot && (
                          <span className="px-2 py-0.5 text-[10px] rounded-full bg-amber-100 text-amber-700 font-semibold">
                            BOT INFLUENCED
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm">{p.mmrAtRegistration}</td>
                    <td className="px-4 py-3 text-sm">
                      {p.matchesPlayed > 0 ? `${p.matchesWon}W / ${p.matchesPlayed - p.matchesWon}L` : '-'}
                    </td>
                    <td className="px-4 py-3 text-sm">{p.totalScore}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        p.status === 'active' ? 'bg-green-100 text-green-800' :
                        p.status === 'eliminated' ? 'bg-red-100 text-red-800' :
                        p.status === 'disqualified' ? 'bg-purple-100 text-purple-800' :
                        p.status === 'forfeited' ? 'bg-orange-100 text-orange-800' :
                        'bg-slate-100 text-slate-800'
                      }`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm font-medium">
                      {p.finalPlacement ? `#${p.finalPlacement}` : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        {/* Edit Seed - only before tournament starts */}
                        {['upcoming', 'registration'].includes(tournament.status) && canPerform('update_participant_seed') && (
                          <button
                            onClick={() => setSeedEditParticipant(p)}
                            className="text-xs text-blue-600 hover:text-blue-800"
                          >
                            Edit Seed
                          </button>
                        )}
                        {/* Disqualify - only during tournament */}
                        {['in_progress', 'paused'].includes(tournament.status) &&
                         !p.isBot &&
                         !['eliminated', 'disqualified', 'forfeited'].includes(p.status) &&
                         canPerform('disqualify_participant') && (
                          <button
                            onClick={() => setParticipantAction({ participant: p, action: 'disqualify' })}
                            className="text-xs text-purple-600 hover:text-purple-800"
                          >
                            Disqualify
                          </button>
                        )}
                        {/* Forfeit - only during tournament */}
                        {['in_progress', 'paused'].includes(tournament.status) &&
                         !p.isBot &&
                         !['eliminated', 'disqualified', 'forfeited'].includes(p.status) &&
                         canPerform('forfeit_participant') && (
                          <button
                            onClick={() => setParticipantAction({ participant: p, action: 'forfeit' })}
                            className="text-xs text-orange-600 hover:text-orange-800"
                          >
                            Forfeit
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Bracket / Matches */}
      <div className="bg-white rounded-lg shadow">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b p-4">
          <h2 className="text-lg font-semibold">
            Bracket {tournament.currentRound > 0 && `(Round ${tournament.currentRound})`}
          </h2>
          <Select
            value={matchStatusFilter}
            onChange={(event) => setMatchStatusFilter(event.target.value)}
            className="min-w-[180px]"
          >
            <option value="all">All Match Statuses</option>
            <option value="ready">Ready</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="forfeit">Forfeit</option>
            <option value="bye">Bye</option>
          </Select>
        </div>
        {matches.length === 0 ? (
          <p className="p-4 text-slate-500">Bracket will be generated when the tournament starts</p>
        ) : filteredMatches.length === 0 ? (
          <p className="p-4 text-slate-500">No matches match the current filter.</p>
        ) : (
          <div className="p-4 space-y-6">
            {bracketSections.map((section) => {
              const roundsMap = section.rounds;
              const rounds = Object.keys(roundsMap).map(Number).sort((a, b) => a - b);
              const isGrandFinal = section.isGrandFinal;
              const matchesForBracket = isGrandFinal
                ? rounds.flatMap((round) => roundsMap[round] || [])
                : [];

              return (
                <div key={section.key}>
                  <h3 className="font-medium text-slate-700 mb-3">
                    {section.label}
                  </h3>
                  {(isGrandFinal ? [0] : rounds).map((round) => (
                    <div key={round} className="mb-4">
                      {!isGrandFinal && section.key !== 'opening' && (
                        <h4 className="text-sm text-slate-500 mb-3">
                          Round {round}
                          {section.key === 'winners' && tournament.totalRounds && ` of ${tournament.totalRounds}`}
                        </h4>
                      )}
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {(isGrandFinal ? matchesForBracket : roundsMap[round]).map((match) => {
                          const bestOf = match.bestOf || 1;
                          const seriesLabel = bestOf > 1
                            ? `Bo${bestOf} • ${match.seriesWinsPlayer1 || 0}-${match.seriesWinsPlayer2 || 0}`
                            : null;
                          return (
                            <div
                              key={match.id}
                              className={`border rounded-lg p-3 ${
                                match.status === 'completed' ? 'bg-slate-50' :
                                match.status === 'in_progress' ? 'bg-yellow-50 border-yellow-200' :
                                match.status === 'ready' ? 'bg-teal-50 border-teal-200' :
                                match.status === 'forfeit' ? 'bg-orange-50 border-orange-200' :
                                'bg-white'
                              }`}
                            >
                              <div className="flex justify-between items-center mb-2">
                                <span className="text-xs text-slate-500">
                                  {isGrandFinal
                                    ? (match.matchNumber === 2 ? 'Grand Final Reset' : 'Grand Final')
                                    : `Match #${match.matchNumber}`}
                                </span>
                                <span className={`px-2 py-0.5 text-xs rounded-full ${
                                  match.status === 'completed' ? 'bg-green-100 text-green-800' :
                                  match.status === 'in_progress' ? 'bg-yellow-100 text-yellow-800' :
                                  match.status === 'ready' ? 'bg-teal-100 text-teal-800' :
                                  match.status === 'bye' ? 'bg-slate-200 text-slate-800' :
                                  match.status === 'forfeit' ? 'bg-orange-100 text-orange-800' :
                                  'bg-slate-100 text-slate-800'
                                }`}>
                                  {match.status}
                                </span>
                              </div>
                              {seriesLabel && (
                                <div className="text-xs text-slate-500 mb-2">{seriesLabel}</div>
                              )}
                              <div className="space-y-1">
                                <div className={`flex justify-between items-center p-2 rounded ${
                                  match.winnerId === match.player1Id ? 'bg-green-100' : ''
                                }`}>
                                  <span className="text-sm font-medium">{getParticipantName(match.player1Id)}</span>
                                  <span className="text-sm">{match.player1Score ?? '-'}</span>
                                </div>
                                <div className={`flex justify-between items-center p-2 rounded ${
                                  match.winnerId === match.player2Id ? 'bg-green-100' : ''
                                }`}>
                                  <span className="text-sm font-medium">{getParticipantName(match.player2Id)}</span>
                                  <span className="text-sm">{match.player2Score ?? '-'}</span>
                                </div>
                              </div>
                              {match.spectatorCount > 0 && (
                                <p className="text-xs text-slate-500 mt-2">
                                  {match.spectatorCount} spectator{match.spectatorCount !== 1 ? 's' : ''}
                                </p>
                              )}
                              {match.status !== 'completed' && match.player1Id && match.player2Id && (
                                <div className="mt-3 flex justify-end">
                                  <button
                                    onClick={() => setReportMatch(match)}
                                    className="text-xs text-primary-600 hover:text-primary-800"
                                  >
                                    Report Result
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Placement Bonuses */}
      {tournament.rewards && Object.keys(tournament.rewards).length > 0 && (
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="font-medium text-slate-900 mb-3">Placement Bonuses</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(tournament.rewards).map(([place, reward]) => {
              const rewardValue = reward as RewardEntry;
              return (
              <div key={place} className="bg-slate-50 rounded-lg p-3 text-center">
                <p className="font-medium text-slate-800 capitalize">{place}</p>
                <p className="text-xs text-green-600">
                  +{rewardValue.mmr_bonus ? rewardValue.mmr_bonus : 0} MMR
                </p>
              </div>
              );
            })}
          </div>
        </div>
      )}

      {showEditModal && (
        <EditTournamentModal
          tournament={tournament}
          categories={categories}
          categoriesLoading={categoriesLoading}
          categoriesError={categoriesError}
          onClose={() => setShowEditModal(false)}
          onSaved={() => {
            setShowEditModal(false);
          }}
        />
      )}

      {reportMatch && (
        <ReportResultModal
          tournamentId={id!}
          match={reportMatch}
          participants={participants}
          onClose={() => setReportMatch(null)}
          onReported={() => {
            setReportMatch(null);
          }}
        />
      )}

      {/* Seed Edit Modal */}
      {seedEditParticipant && (
        <SeedEditModal
          participant={seedEditParticipant}
          tournamentId={id!}
          bracketSize={tournament.bracketSize}
          onClose={() => setSeedEditParticipant(null)}
          onSaved={() => {
            setSeedEditParticipant(null);
          }}
        />
      )}

      {/* Participant Action Confirmation Modal */}
      {participantAction && (
        <Modal open onClose={() => setParticipantAction(null)} ariaLabel="Participant action confirmation">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className={`text-xl font-bold mb-4 ${participantAction.action === 'disqualify' ? 'text-purple-600' : 'text-orange-600'}`}>
              {participantAction.action === 'disqualify' ? 'Disqualify' : 'Forfeit'} Participant
            </h2>
            <p className="text-slate-600 mb-4">
              Are you sure you want to {participantAction.action}{' '}
              <strong>{participantAction.participant.displayName}</strong>?
            </p>
            <p className="text-sm text-slate-500 mb-4">
              {participantAction.action === 'disqualify'
                ? 'Disqualification is typically for rule violations. The opponent will automatically advance.'
                : 'Forfeit is used when a player cannot continue. The opponent will automatically advance.'}
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setParticipantAction(null)}
                className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={participantAction.action === 'disqualify' ? handleDisqualifyParticipant : handleForfeitParticipant}
                disabled={actionLoading === 'disqualify' || actionLoading === 'forfeit'}
                className={`px-4 py-2 text-white rounded-lg disabled:opacity-50 ${
                  participantAction.action === 'disqualify'
                    ? 'bg-purple-600 hover:bg-purple-700'
                    : 'bg-orange-600 hover:bg-orange-700'
                }`}
              >
                {actionLoading === participantAction.action ? 'Processing...' : `Confirm ${participantAction.action === 'disqualify' ? 'Disqualify' : 'Forfeit'}`}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function toDateTimeLocal(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function toUtcISOString(localDateTime: string): string {
  if (!localDateTime) return '';
  const date = new Date(localDateTime);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString();
}

function EditTournamentModal({
  tournament,
  categories,
  categoriesLoading,
  categoriesError,
  onClose,
  onSaved,
}: {
  tournament: TournamentDetail['tournament'];
  categories: Category[];
  categoriesLoading: boolean;
  categoriesError: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const updateTournamentMutation = useUpdateTournamentMutation();
  const [formData, setFormData] = useState({
    name: tournament.name,
    description: tournament.description || '',
    format: tournament.format,
    seedingMode: tournament.seedingMode || 'mmr',
    grandFinalReset: tournament.grandFinalReset || false,
    bestOfByRound: buildBestOfConfig(
      tournament.bracketSize,
      tournament.format,
      tournament.seedingMode || 'mmr',
      tournament.bestOfByRound
    ),
    category: tournament.category || '',
    minMmr: tournament.minMmr,
    maxMmr: tournament.maxMmr,
    questionCount: tournament.questionCount,
    timePerQuestionSeconds: Math.round((tournament.timePerQuestionMs || 15000) / 1000),
    questionPoolIds: (tournament.questionPoolIds || []).join('\n'),
    registrationStart: toDateTimeLocal(tournament.registrationStart),
    registrationEnd: toDateTimeLocal(tournament.registrationEnd),
    tournamentStart: toDateTimeLocal(tournament.tournamentStart),
    allowSpectators: tournament.allowSpectators,
    status: tournament.status,
    botPolicyJson: JSON.stringify(tournament.botPolicy || {}, null, 2),
  });
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const currentCategory = formData.category || '';
  const hasMissingCategory = currentCategory.length > 0 && !categories.some((cat) => cat.categoryKey === currentCategory);
  const bestOfConfig = buildBestOfConfig(
    tournament.bracketSize,
    formData.format,
    formData.seedingMode,
    formData.bestOfByRound
  );
  const hasOpeningRound = formData.seedingMode === 'random_opening_round';
  const updateBestOfByRound = (mutator: (current: ReturnType<typeof buildBestOfConfig>) => ReturnType<typeof buildBestOfConfig>) => {
    setFormData((prev) => {
      const current = buildBestOfConfig(
        tournament.bracketSize,
        prev.format,
        prev.seedingMode,
        prev.bestOfByRound
      );
      return {
        ...prev,
        bestOfByRound: mutator(current),
      };
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);

    let botPolicyValue: Record<string, unknown> | undefined;
    if (formData.botPolicyJson.trim()) {
      try {
        const parsedBotPolicy = JSON.parse(formData.botPolicyJson);
        if (!parsedBotPolicy || typeof parsedBotPolicy !== 'object' || Array.isArray(parsedBotPolicy)) {
          setIsSaving(false);
          setError('Bot policy must be a JSON object');
          return;
        }
        botPolicyValue = parsedBotPolicy as Record<string, unknown>;
      } catch {
        setIsSaving(false);
        setError('Bot policy must be valid JSON');
        return;
      }
    }

    if (Number(formData.minMmr) > Number(formData.maxMmr)) {
      setIsSaving(false);
      setError('Min MMR cannot exceed Max MMR');
      return;
    }

    if (Number(formData.timePerQuestionSeconds) < 5 || Number(formData.timePerQuestionSeconds) > 200) {
      setIsSaving(false);
      setError('Time per question must be between 5 and 200 seconds');
      return;
    }

    if (Number(formData.questionCount) < 1 || Number(formData.questionCount) > 1000) {
      setIsSaving(false);
      setError('Questions per match must be between 1 and 1000');
      return;
    }

    if (formData.registrationStart && formData.registrationEnd) {
      const regStart = new Date(formData.registrationStart);
      const regEnd = new Date(formData.registrationEnd);
      if (regStart >= regEnd) {
        setIsSaving(false);
        setError('Registration start date must be before registration end date');
        return;
      }
    }

    if (formData.registrationEnd && formData.tournamentStart) {
      const regEnd = new Date(formData.registrationEnd);
      const tourneyStart = new Date(formData.tournamentStart);
      if (regEnd > tourneyStart) {
        setIsSaving(false);
        setError('Registration must end before tournament starts');
        return;
      }
    }

    if (formData.registrationStart && formData.tournamentStart) {
      const regStart = new Date(formData.registrationStart);
      const tourneyStart = new Date(formData.tournamentStart);
      if (regStart >= tourneyStart) {
        setIsSaving(false);
        setError('Registration start must be before tournament start');
        return;
      }
    }

    const registrationStartIso = toUtcISOString(formData.registrationStart);
    const registrationEndIso = toUtcISOString(formData.registrationEnd);
    const tournamentStartIso = toUtcISOString(formData.tournamentStart);

    if (!registrationStartIso || !registrationEndIso || !tournamentStartIso) {
      setIsSaving(false);
      setError('Please enter valid registration and tournament start dates');
      return;
    }

    try {
      const payload: Record<string, unknown> = {
        tournamentId: tournament.id,
        name: formData.name,
        description: formData.description || '',
        format: formData.format,
        seedingMode: formData.seedingMode,
        grandFinalReset: formData.grandFinalReset,
        bestOfByRound: bestOfConfig,
        category: formData.category || null,
        minMmr: Number(formData.minMmr),
        maxMmr: Number(formData.maxMmr),
        questionCount: Number(formData.questionCount),
        timePerQuestionMs: Number(formData.timePerQuestionSeconds) * 1000,
        registrationStart: registrationStartIso,
        registrationEnd: registrationEndIso,
        tournamentStart: tournamentStartIso,
        allowSpectators: formData.allowSpectators,
        status: formData.status,
      };

      if (formData.questionPoolIds !== undefined) {
        payload.questionPoolIds = formData.questionPoolIds;
      }

      if (botPolicyValue) {
        payload.botPolicy = botPolicyValue;
      }

      await updateTournamentMutation.mutateAsync(payload);
      onSaved();
    } catch (saveError: unknown) {
      console.error('Error updating tournament:', saveError);
      setError(getErrorMessage(saveError));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} ariaLabel="Edit tournament">
      <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold mb-4">Edit Tournament</h2>

        {error && (
          <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800 mb-4">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
              rows={2}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Format</label>
              <select
                value={formData.format}
                onChange={(e) => setFormData({ ...formData, format: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
              >
                <option value="single_elimination">Single Elimination</option>
                <option value="double_elimination">Double Elimination</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as TournamentStatus })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
              >
                <option value="upcoming">Upcoming</option>
                <option value="registration">Registration</option>
                <option value="in_progress">In Progress</option>
                <option value="paused">Paused</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Seeding Mode</label>
              <select
                value={formData.seedingMode}
                onChange={(e) => setFormData({ ...formData, seedingMode: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
              >
                <option value="mmr">MMR Seeding</option>
                <option value="random_opening_round">Random Opening Round</option>
                <option value="manual">Manual (Admin Seeds)</option>
              </select>
            </div>
            <div className="flex items-center gap-2 pt-6">
              <input
                type="checkbox"
                checked={formData.grandFinalReset}
                onChange={(e) => setFormData({ ...formData, grandFinalReset: e.target.checked })}
                className="rounded border-slate-300"
                disabled={formData.format !== 'double_elimination'}
              />
              <span className="text-sm text-slate-700">Grand Final Reset</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
              <select
                value={currentCategory}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                disabled={categoriesLoading && categories.length === 0}
              >
                <option value="">Mixed Question Pool</option>
                {hasMissingCategory && (
                  <option value={currentCategory}>
                    {currentCategory.replace(/_/g, ' ')} (not in list)
                  </option>
                )}
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.categoryKey}>
                    {cat.name}{cat.isActive ? '' : ' (inactive)'}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-500 mt-1">
                Leave empty for a mixed question pool.
              </p>
              {categoriesError && (
                <p className="text-xs text-amber-600 mt-1">Using fallback categories.</p>
              )}
            </div>
            <div className="flex items-center gap-2 pt-6">
              <input
                type="checkbox"
                checked={formData.allowSpectators}
                onChange={(e) => setFormData({ ...formData, allowSpectators: e.target.checked })}
                className="rounded border-slate-300"
              />
              <span className="text-sm text-slate-700">Allow spectators</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Question Pool IDs <span className="text-slate-400">(optional)</span>
            </label>
            <textarea
              value={formData.questionPoolIds}
              onChange={(e) => setFormData({ ...formData, questionPoolIds: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 font-mono text-xs"
              rows={4}
              placeholder={`One UUID per line (or comma-separated).\nIf set, tournament matches will pick questions only from these IDs (within the tournament category).`}
            />
            <p className="text-xs text-slate-500 mt-1">
              Leave empty to use the normal category question pool.
            </p>
          </div>
          <div className="border border-slate-200 rounded-lg p-3">
            <p className="text-sm font-medium text-slate-700 mb-2">Best-of per round</p>
            {hasOpeningRound && (
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-500">Opening Round</span>
                <select
                  value={bestOfConfig.opening}
                  onChange={(e) => {
                    const nextOpening = Number(e.target.value);
                    updateBestOfByRound((current) => ({
                      ...current,
                      opening: nextOpening as 1 | 3 | 5,
                    }));
                  }}
                  className="px-2 py-1 border rounded text-xs"
                >
                  {BEST_OF_OPTIONS.map((opt) => (
                    <option key={`opening-${opt}`} value={opt}>Bo{opt}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-xs font-semibold text-slate-600 mb-1">
                  {hasOpeningRound ? 'Upper Bracket' : 'Winners Bracket'}
                </p>
                {bestOfConfig.winners.map((value, idx) => {
                  const roundNumber = idx + 1;
                  if (hasOpeningRound && roundNumber === 1) return null;
                  return (
                    <div key={`w-${roundNumber}`} className="flex items-center justify-between mb-1">
                      <span className="text-xs text-slate-500">Round {roundNumber}</span>
                      <select
                        value={value}
                        onChange={(e) => {
                          const nextValue = Number(e.target.value);
                          updateBestOfByRound((current) => {
                            const next = { ...current, winners: [...current.winners] };
                            next.winners[idx] = nextValue as 1 | 3 | 5;
                            return next;
                          });
                        }}
                        className="px-2 py-1 border rounded text-xs"
                      >
                        {BEST_OF_OPTIONS.map((opt) => (
                          <option key={`w-${roundNumber}-${opt}`} value={opt}>Bo{opt}</option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
              {formData.format === 'double_elimination' && (
                <div>
                  <p className="text-xs font-semibold text-slate-600 mb-1">Lower Bracket</p>
                  {bestOfConfig.losers.map((value, idx) => (
                    <div key={`l-${idx + 1}`} className="flex items-center justify-between mb-1">
                      <span className="text-xs text-slate-500">Round {idx + 1}</span>
                      <select
                        value={value}
                        onChange={(e) => {
                          const nextValue = Number(e.target.value);
                          updateBestOfByRound((current) => {
                            const next = { ...current, losers: [...current.losers] };
                            next.losers[idx] = nextValue as 1 | 3 | 5;
                            return next;
                          });
                        }}
                        className="px-2 py-1 border rounded text-xs"
                      >
                        {BEST_OF_OPTIONS.map((opt) => (
                          <option key={`l-${idx + 1}-${opt}`} value={opt}>Bo{opt}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {formData.format === 'double_elimination' && (
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-slate-500">Grand Final</span>
                <select
                  value={bestOfConfig.grand_final}
                  onChange={(e) => {
                    const nextGrandFinal = Number(e.target.value);
                    updateBestOfByRound((current) => ({
                      ...current,
                      grand_final: nextGrandFinal as 1 | 3 | 5,
                    }));
                  }}
                  className="px-2 py-1 border rounded text-xs"
                >
                  {BEST_OF_OPTIONS.map((opt) => (
                    <option key={`gf-${opt}`} value={opt}>Bo{opt}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Min MMR</label>
              <input
                type="number"
                value={formData.minMmr}
                onChange={(e) => setFormData({ ...formData, minMmr: Number(e.target.value) })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Max MMR</label>
              <input
                type="number"
                value={formData.maxMmr}
                onChange={(e) => setFormData({ ...formData, maxMmr: Number(e.target.value) })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Questions per Match</label>
            <input
              type="number"
              value={formData.questionCount}
              onChange={(e) => setFormData({ ...formData, questionCount: Number(e.target.value) })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
              min={5}
              max={1000}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Time Per Question (seconds)</label>
            <input
              type="number"
              value={formData.timePerQuestionSeconds}
              onChange={(e) => setFormData({ ...formData, timePerQuestionSeconds: Number(e.target.value) })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
              min={5}
              max={200}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Registration Start</label>
            <input
              type="datetime-local"
              value={formData.registrationStart}
              onChange={(e) => setFormData({ ...formData, registrationStart: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Registration End</label>
            <input
              type="datetime-local"
              value={formData.registrationEnd}
              onChange={(e) => setFormData({ ...formData, registrationEnd: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Tournament Start</label>
            <input
              type="datetime-local"
              value={formData.tournamentStart}
              onChange={(e) => setFormData({ ...formData, tournamentStart: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Tournament Bot Policy Override (JSON)
            </label>
            <textarea
              value={formData.botPolicyJson}
              onChange={(e) => setFormData({ ...formData, botPolicyJson: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 font-mono text-sm"
              rows={4}
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 mt-4 border-t border-slate-200">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ReportResultModal({
  tournamentId,
  match,
  participants,
  onClose,
  onReported,
}: {
  tournamentId: string;
  match: TournamentMatch;
  participants: Participant[];
  onClose: () => void;
  onReported: () => void;
}) {
  const reportResultMutation = useReportTournamentMatchResultMutation();
  const player1 = participants.find((p) => p.id === match.player1Id) || null;
  const player2 = participants.find((p) => p.id === match.player2Id) || null;
  const [winnerChoice, setWinnerChoice] = useState<'player1' | 'player2' | ''>('');
  const [player1Score, setPlayer1Score] = useState(match.player1Score?.toString() || '');
  const [player2Score, setPlayer2Score] = useState(match.player2Score?.toString() || '');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!winnerChoice) {
      setError('Select a winner');
      return;
    }

    const winnerUserId = winnerChoice === 'player1' ? player1?.userId : player2?.userId;
    const winnerIsBot = winnerChoice === 'player1' ? !!player1?.isBot : !!player2?.isBot;
    const winnerId = winnerIsBot ? null : (winnerUserId || null);
    if (!winnerIsBot && !winnerId) {
      setError('Winner information missing');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await reportResultMutation.mutateAsync({
        tournamentId,
        tournamentMatchId: match.id,
        winnerId,
        player1Score: Number(player1Score || 0),
        player2Score: Number(player2Score || 0),
      });
      onReported();
    } catch (submitError: unknown) {
      console.error('Error reporting match result:', submitError);
      const errorMessage = submitError instanceof Error ? submitError.message : 'Failed to report result';
      setError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal open onClose={onClose} ariaLabel="Report match result">
      <div className="bg-white rounded-lg p-6 w-full max-w-lg">
        <h2 className="text-xl font-bold mb-4">Report Match Result</h2>

        {error && (
          <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800 mb-4">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-sm text-slate-500 mb-1">Player 1</p>
              <p className="font-medium text-slate-800">{player1?.displayName || 'TBD'}</p>
              <input
                type="number"
                value={player1Score}
                onChange={(e) => setPlayer1Score(e.target.value)}
                className="mt-2 w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                placeholder="Score"
              />
            </div>
            <div>
              <p className="text-sm text-slate-500 mb-1">Player 2</p>
              <p className="font-medium text-slate-800">{player2?.displayName || 'TBD'}</p>
              <input
                type="number"
                value={player2Score}
                onChange={(e) => setPlayer2Score(e.target.value)}
                className="mt-2 w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                placeholder="Score"
              />
            </div>
          </div>

          <div>
            <p className="text-sm text-slate-500 mb-2">Winner</p>
            <div className="flex gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={winnerChoice === 'player1'}
                  onChange={() => setWinnerChoice('player1')}
                />
                {player1?.displayName || 'Player 1'}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={winnerChoice === 'player2'}
                  onChange={() => setWinnerChoice('player2')}
                />
                {player2?.displayName || 'Player 2'}
              </label>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 mt-4 border-t border-slate-200">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
          >
            {isSubmitting ? 'Reporting...' : 'Report Result'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function SeedEditModal({
  participant,
  tournamentId,
  bracketSize,
  onClose,
  onSaved,
}: {
  participant: Participant;
  tournamentId: string;
  bracketSize: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const updateSeedMutation = useUpdateTournamentParticipantSeedMutation();
  const [newSeed, setNewSeed] = useState(participant.seedNumber?.toString() || '');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    const seedNum = parseInt(newSeed);
    if (isNaN(seedNum) || seedNum < 1) {
      setError('Please enter a valid seed number (1 or higher)');
      return;
    }
    if (seedNum > bracketSize) {
      setError(`Seed cannot exceed bracket size (${bracketSize})`);
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await updateSeedMutation.mutateAsync({
        tournamentId,
        participantId: participant.id,
        newSeed: seedNum,
      });
      onSaved();
    } catch (saveError: unknown) {
      console.error('Error updating seed:', saveError);
      const errorMessage = saveError instanceof Error ? saveError.message : 'Failed to update seed';
      setError(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} ariaLabel="Edit seed">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">Edit Seed</h2>
        <p className="text-slate-600 mb-4">
          Editing seed for <strong>{participant.displayName}</strong>
        </p>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800 mb-4">
            {error}
          </div>
        )}

        <div className="mb-4">
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Seed Number (1-{bracketSize})
          </label>
          <input
            type="number"
            value={newSeed}
            onChange={(e) => setNewSeed(e.target.value)}
            min={1}
            max={bracketSize}
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
          />
          <p className="text-xs text-slate-500 mt-1">
            Current seed: {participant.seedNumber || 'Not assigned'}
          </p>
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
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Save Seed'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
