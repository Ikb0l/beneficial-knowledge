import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useRBAC } from '../hooks/useRBAC';
import { useCategories } from '../hooks/useCategories';
import type { TournamentStatus } from '../types';
import { getErrorMessage } from '../lib/errors';
import { confirmAction } from '../lib/confirm';
import { toastError, toastSuccess } from '../lib/toast';
import { BEST_OF_OPTIONS, buildBestOfConfig } from '../lib/tournamentBestOf';
import {
  useCancelTournamentMutation,
  useCreateTournamentMutation,
  useDeleteTournamentMutation,
  useStartTournamentMutation,
  useTournamentsQuery,
} from '../domains/tournaments/api';
import type { TournamentSummary } from '../domains/tournaments/contracts';
import Modal from '../components/Modal';
import SavedViewsToolbar from '../components/SavedViewsToolbar';
import { Button, Input, Select } from '../components/ui';

type Tournament = TournamentSummary & { status: TournamentStatus };

function toUtcISOString(localDateTime: string): string {
  if (!localDateTime) return '';
  const date = new Date(localDateTime);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString();
}

export default function TournamentsPage() {
  const { canPerform } = useRBAC();
  const [searchParams, setSearchParams] = useSearchParams();
  const { categories } = useCategories();
  const statusFilter = searchParams.get('status') || '';
  const categoryFilter = searchParams.get('category') || '';
  const search = searchParams.get('search') || '';
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ tournament: Tournament; confirmName: string } | null>(null);
  const tournamentsQuery = useTournamentsQuery({
    status: statusFilter || undefined,
    category: categoryFilter || undefined,
    search: search || undefined,
    limit: 100,
  });
  const startTournamentMutation = useStartTournamentMutation();
  const cancelTournamentMutation = useCancelTournamentMutation();
  const deleteTournamentMutation = useDeleteTournamentMutation();

  const tournaments = (tournamentsQuery.data?.tournaments || []) as Tournament[];
  const isLoading = tournamentsQuery.isLoading;
  const error = tournamentsQuery.error?.message || null;

  const updateParams = (updates: Record<string, string | undefined>) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([key, value]) => {
      if (value) next.set(key, value);
      else next.delete(key);
    });
    setSearchParams(next);
  };

  async function handleStartTournament(tournamentId: string) {
    if (!(await confirmAction({
      title: 'Start tournament?',
      message: 'This will generate the bracket and begin the first round.',
      confirmLabel: 'Start',
    }))) return;
    try {
      await startTournamentMutation.mutateAsync(tournamentId);
      toastSuccess('Tournament started');
    } catch (error: unknown) {
      console.error('Error starting tournament:', error);
      toastError('Failed to start tournament: ' + getErrorMessage(error));
    }
  }

  async function handleCancelTournament(tournamentId: string) {
    if (!(await confirmAction({
      title: 'Cancel tournament?',
      message: 'This action cannot be undone.',
      confirmLabel: 'Cancel tournament',
      tone: 'danger',
    }))) return;
    try {
      await cancelTournamentMutation.mutateAsync(tournamentId);
      toastSuccess('Tournament cancelled');
    } catch (error) {
      console.error('Error cancelling tournament:', error);
      toastError('Failed to cancel tournament: ' + getErrorMessage(error));
    }
  }

  async function handleDeleteTournament() {
    if (!deleteConfirm) return;
    if (deleteConfirm.confirmName !== deleteConfirm.tournament.name) {
      toastError('Tournament name does not match');
      return;
    }

    try {
      await deleteTournamentMutation.mutateAsync(deleteConfirm.tournament.id);
      setDeleteConfirm(null);
      toastSuccess('Tournament deleted');
    } catch (error) {
      console.error('Error deleting tournament:', error);
      toastError('Failed to delete tournament: ' + getErrorMessage(error));
    }
  }

  const statusColors: { [key: string]: string } = {
    upcoming: 'bg-blue-100 text-blue-800',
    registration: 'bg-green-100 text-green-800',
    in_progress: 'bg-yellow-100 text-yellow-800',
    paused: 'bg-orange-100 text-orange-800',
    completed: 'bg-gray-100 text-gray-800',
    cancelled: 'bg-red-100 text-red-800',
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Tournaments</h1>
        <Button onClick={() => setShowCreateModal(true)}>
          Create Tournament
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap gap-4">
        <Input
          value={search}
          onChange={(event) => updateParams({ search: event.target.value || undefined })}
          placeholder="Search tournaments by name or description..."
          className="min-w-[240px] flex-1"
        />
        <Select
          value={statusFilter}
          onChange={(event) => updateParams({ status: event.target.value || undefined })}
        >
          <option value="">All Statuses</option>
          <option value="upcoming">Upcoming</option>
          <option value="registration">Registration Open</option>
          <option value="in_progress">In Progress</option>
          <option value="paused">Paused</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </Select>
        <Select
          value={categoryFilter}
          onChange={(event) => updateParams({ category: event.target.value || undefined })}
        >
          <option value="">All Categories</option>
          {categories.map((category) => (
            <option key={category.id} value={category.categoryKey}>
              {category.name}
            </option>
          ))}
        </Select>
      </div>

      <SavedViewsToolbar
        storageKey="tournaments"
        searchParams={searchParams}
        onApply={(next) => setSearchParams(next)}
      />

      {/* Error */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between">
          <p className="text-sm text-red-700">{error}</p>
          <button
            onClick={() => void tournamentsQuery.refetch()}
            className="text-sm text-red-600 hover:text-red-800 underline"
          >
            Refresh
          </button>
        </div>
      )}

      {/* Tournaments Table */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : tournaments.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          No tournaments found
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Format</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Size</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">MMR Range</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Participants</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Start Time</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {tournaments.map((tournament) => (
                <tr key={tournament.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4">
                    <Link to={`/tournaments/${tournament.id}`} className="text-primary-600 hover:text-primary-800 font-medium">
                      {tournament.name}
                    </Link>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600 capitalize">
                    {tournament.format.replace(/_/g, ' ')}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">
                    {tournament.bracketSize}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">
                    {tournament.minMmr} - {tournament.maxMmr}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 text-xs rounded-full ${statusColors[tournament.status] || 'bg-slate-100'}`}>
                      {tournament.status.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">
                    {tournament.participantCount} / {tournament.bracketSize}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">
                    {tournament.tournamentStart ? new Date(tournament.tournamentStart).toLocaleString() : 'TBD'}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2">
                      <Link
                        to={`/tournaments/${tournament.id}`}
                        className="text-slate-600 hover:text-slate-900"
                      >
                        View
                      </Link>
                      {tournament.status === 'registration' && canPerform('start_tournament') && (
                        <button
                          onClick={() => handleStartTournament(tournament.id)}
                          className="text-green-600 hover:text-green-800"
                        >
                          Start
                        </button>
                      )}
                      {(tournament.status === 'upcoming' || tournament.status === 'registration') && canPerform('cancel_tournament') && (
                        <button
                          onClick={() => handleCancelTournament(tournament.id)}
                          className="text-red-600 hover:text-red-800"
                        >
                          Cancel
                        </button>
                      )}
                      {tournament.status !== 'in_progress' && canPerform('delete_tournament') && (
                        <button
                          onClick={() => setDeleteConfirm({ tournament, confirmName: '' })}
                          className="text-red-600 hover:text-red-800"
                        >
                          Delete
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

      {/* Create Tournament Modal */}
      {showCreateModal && (
        <CreateTournamentModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false);
          }}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <Modal open onClose={() => setDeleteConfirm(null)} ariaLabel="Delete tournament">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold text-red-600 mb-4">Delete Tournament</h2>
            <p className="text-slate-600 mb-4">
              This action is permanent and cannot be undone. All participants and matches will be deleted.
            </p>
            <p className="text-sm text-slate-700 mb-2">
              To confirm, type the tournament name: <strong>{deleteConfirm.tournament.name}</strong>
            </p>
            <input
              type="text"
              value={deleteConfirm.confirmName}
              onChange={(e) => setDeleteConfirm({ ...deleteConfirm, confirmName: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 mb-4"
              placeholder="Type tournament name to confirm"
            />
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteTournament}
                disabled={deleteTournamentMutation.isPending || deleteConfirm.confirmName !== deleteConfirm.tournament.name}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {deleteTournamentMutation.isPending ? 'Deleting...' : 'Delete Tournament'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function CreateTournamentModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { categories, isLoading: categoriesLoading, error: categoriesError } = useCategories();
  const createTournamentMutation = useCreateTournamentMutation();
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    format: 'single_elimination',
    bracketSize: 16,
    seedingMode: 'random_opening_round',
    grandFinalReset: false,
    bestOfByRound: buildBestOfConfig(16, 'single_elimination', 'random_opening_round'),
    category: '',
    questionPoolIds: '',
    minMmr: 0,
    maxMmr: 10000,
    questionCount: 10,
    timePerQuestionSeconds: 15,
    registrationStart: '',
    registrationEnd: '',
    tournamentStart: '',
    allowSpectators: true,
    enableBots: true,
    botPolicyJson: '',
  });
  const selectedCategory = categories.find((cat) => cat.categoryKey === formData.category);

  const bestOfConfig = buildBestOfConfig(
    formData.bracketSize,
    formData.format,
    formData.seedingMode,
    formData.bestOfByRound
  );
  const hasOpeningRound = formData.seedingMode === 'random_opening_round';
  const updateBestOfByRound = (mutator: (current: ReturnType<typeof buildBestOfConfig>) => ReturnType<typeof buildBestOfConfig>) => {
    setFormData((prev) => {
      const current = buildBestOfConfig(
        prev.bracketSize,
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (formData.minMmr > formData.maxMmr) {
      toastError('Min MMR cannot exceed Max MMR');
      return;
    }

    if (formData.timePerQuestionSeconds < 5 || formData.timePerQuestionSeconds > 200) {
      toastError('Time per question must be between 5 and 200 seconds');
      return;
    }

    if (formData.questionCount < 1 || formData.questionCount > 1000) {
      toastError('Questions per match must be between 1 and 1000');
      return;
    }

    // Validate dates are in correct order
    if (formData.registrationStart && formData.registrationEnd) {
      const regStart = new Date(formData.registrationStart);
      const regEnd = new Date(formData.registrationEnd);
      if (regStart >= regEnd) {
        toastError('Registration start date must be before registration end date');
        return;
      }
    }

    if (formData.registrationEnd && formData.tournamentStart) {
      const regEnd = new Date(formData.registrationEnd);
      const tourneyStart = new Date(formData.tournamentStart);
      if (regEnd > tourneyStart) {
        toastError('Registration must end before tournament starts');
        return;
      }
    }

    if (formData.registrationStart && formData.tournamentStart) {
      const regStart = new Date(formData.registrationStart);
      const tourneyStart = new Date(formData.tournamentStart);
      if (regStart >= tourneyStart) {
        toastError('Registration start must be before tournament start');
        return;
      }
    }

    const registrationStartIso = toUtcISOString(formData.registrationStart);
    const registrationEndIso = toUtcISOString(formData.registrationEnd);
    const tournamentStartIso = toUtcISOString(formData.tournamentStart);

    if (!registrationStartIso || !registrationEndIso || !tournamentStartIso) {
      toastError('Please enter valid registration and tournament start dates');
      return;
    }

    let botPolicyOverride: Record<string, unknown> | undefined = undefined;
    if (formData.botPolicyJson.trim().length > 0) {
      try {
        const parsed = JSON.parse(formData.botPolicyJson);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          toastError('Tournament bot policy JSON must be an object');
          return;
        }
        botPolicyOverride = parsed as Record<string, unknown>;
      } catch {
        toastError('Tournament bot policy JSON is invalid');
        return;
      }
    }
    // Toggle always overrides the enabled flag
    if (!formData.enableBots) {
      if (!botPolicyOverride) botPolicyOverride = {};
      (botPolicyOverride as Record<string, unknown>).enabled = false;
    }

    try {
      await createTournamentMutation.mutateAsync({
        ...formData,
        category: formData.category || null,
        timePerQuestionMs: formData.timePerQuestionSeconds * 1000,
        registrationStart: registrationStartIso,
        registrationEnd: registrationEndIso,
        tournamentStart: tournamentStartIso,
        seedingMode: formData.seedingMode,
        grandFinalReset: formData.grandFinalReset,
        bestOfByRound: bestOfConfig,
        botPolicy: botPolicyOverride,
      });
      onCreated();
      toastSuccess('Tournament created');
    } catch (error) {
      console.error('Error creating tournament:', error);
      toastError('Failed to create tournament: ' + getErrorMessage(error));
    }
  }

  return (
    <Modal open onClose={onClose} ariaLabel="Create tournament">
      <div className="bg-white rounded-lg p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold mb-4">Create Tournament</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
              required
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
              <label className="block text-sm font-medium text-slate-700 mb-1">Bracket Size</label>
              <select
                value={formData.bracketSize}
                onChange={(e) => setFormData({ ...formData, bracketSize: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
              >
                <option value={8}>8 Players</option>
                <option value={16}>16 Players</option>
                <option value={32}>32 Players</option>
                <option value={64}>64 Players</option>
                <option value={128}>128 Players</option>
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
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
            <select
              value={formData.category}
              onChange={(e) => {
                const nextCategory = e.target.value;
                const nextSelectedCategory = categories.find((cat) => cat.categoryKey === nextCategory);
                const recommendedCount = nextSelectedCategory ? nextSelectedCategory.questionsPerMatch : 10;
                setFormData({
                  ...formData,
                  category: nextCategory,
                  questionCount: recommendedCount,
                });
              }}
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
            disabled={categoriesLoading && categories.length === 0}
          >
              <option value="">Mixed Question Pool</option>
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
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Tournament Bot Policy Override <span className="text-slate-400">(optional JSON)</span>
            </label>
            <textarea
              value={formData.botPolicyJson}
              onChange={(e) => setFormData({ ...formData, botPolicyJson: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 font-mono text-xs"
              rows={4}
              placeholder='{"enabled": true, "difficulty": {"baseAccuracy": 0.92}}'
            />
            <p className="text-xs text-slate-500 mt-1">
              Leave empty to use global bot policy from Game Settings.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Min MMR</label>
              <input
                type="number"
                value={formData.minMmr}
                onChange={(e) => setFormData({ ...formData, minMmr: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Max MMR</label>
              <input
                type="number"
                value={formData.maxMmr}
                onChange={(e) => setFormData({ ...formData, maxMmr: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Questions per Match</label>
            <input
              type="number"
              value={formData.questionCount}
              onChange={(e) => {
                setFormData({ ...formData, questionCount: parseInt(e.target.value, 10) || 1 });
              }}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
              min={1}
              max={1000}
            />
            {selectedCategory && (
              <p className="text-xs text-slate-500 mt-1">
                Default for selected category: {selectedCategory.questionsPerMatch}
              </p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Time Per Question (seconds)</label>
            <input
              type="number"
              value={formData.timePerQuestionSeconds}
              onChange={(e) => setFormData({ ...formData, timePerQuestionSeconds: parseInt(e.target.value) })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
              min={5}
              max={200}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Registration Start *</label>
            <input
              type="datetime-local"
              value={formData.registrationStart}
              onChange={(e) => setFormData({ ...formData, registrationStart: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Registration End *</label>
            <input
              type="datetime-local"
              value={formData.registrationEnd}
              onChange={(e) => setFormData({ ...formData, registrationEnd: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Tournament Start *</label>
            <input
              type="datetime-local"
              value={formData.tournamentStart}
              onChange={(e) => setFormData({ ...formData, tournamentStart: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
              required
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={formData.allowSpectators}
              onChange={(e) => setFormData({ ...formData, allowSpectators: e.target.checked })}
              className="rounded border-slate-300"
            />
            <span className="text-sm text-slate-700">Allow spectators</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={formData.enableBots}
              onChange={(e) => setFormData({ ...formData, enableBots: e.target.checked })}
              className="rounded border-slate-300"
            />
            <span className="text-sm text-slate-700">Enable Tournament Bots</span>
            <span className="text-xs text-slate-400">
              {formData.enableBots
                ? '(fills empty slots, replaces no-shows)'
                : '(no bots — tournament requires all human players)'}
            </span>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createTournamentMutation.isPending}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
            >
              {createTournamentMutation.isPending ? 'Creating...' : 'Create Tournament'}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
