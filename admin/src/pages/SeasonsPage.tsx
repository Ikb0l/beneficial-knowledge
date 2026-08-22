import { useState } from 'react';
import { useRBAC } from '../hooks/useRBAC';
import { useCreateSeasonMutation, useEndSeasonMutation, useSeasonsQuery } from '../domains/seasons/api';
import { getErrorMessage } from '../lib/errors';
import { confirmAction } from '../lib/confirm';
import { toastError, toastSuccess } from '../lib/toast';
import Modal from '../components/Modal';

const SEASONS_RENDER_NOW = Date.now();

function buildDefaultSeasonFormData() {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  return {
    name: `Season ${startOfMonth.toLocaleString('default', { month: 'long' })} ${startOfMonth.getFullYear()}`,
    startDate: startOfMonth.toISOString().split('T')[0],
    endDate: endOfMonth.toISOString().split('T')[0],
  };
}

export default function SeasonsPage() {
  const { can, canPerform } = useRBAC();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showInactive, setShowInactive] = useState(true);
  const seasonsQuery = useSeasonsQuery({ includeInactive: showInactive });
  const endSeasonMutation = useEndSeasonMutation();

  const seasons = seasonsQuery.data?.seasons || [];
  const error = seasonsQuery.error?.message || null;
  const canCreateSeason = can('seasons.create');

  async function handleEndSeason(seasonId: string) {
    const confirmed = await confirmAction({
      title: 'End season?',
      message: 'This will calculate final rankings and close the season.',
      confirmLabel: 'End season',
      tone: 'danger',
    });

    if (!confirmed) {
      return;
    }

    try {
      await endSeasonMutation.mutateAsync(seasonId);
      toastSuccess('Season ended and final rankings were saved.');
    } catch (mutationError) {
      toastError('Failed to end season: ' + getErrorMessage(mutationError));
    }
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Seasons</h1>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(event) => setShowInactive(event.target.checked)}
              className="rounded text-primary-600"
            />
            Show inactive
          </label>
          <button
            onClick={() => void seasonsQuery.refetch()}
            disabled={seasonsQuery.isFetching}
            className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50"
          >
            {seasonsQuery.isFetching ? 'Refreshing...' : 'Refresh'}
          </button>
          {canCreateSeason && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
            >
              Create Season
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg mb-6">
          <p className="text-sm text-yellow-700">
            Showing the latest successful result. Refresh warning: {error}
          </p>
        </div>
      )}

      {seasonsQuery.isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : seasons.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-slate-500 mb-4">No seasons found</p>
          {canCreateSeason && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
            >
              Create First Season
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-6">
          {seasons.map((season) => (
            <div key={season.id} className="bg-white rounded-lg shadow p-6">
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-xl font-bold text-slate-900">{season.name}</h2>
                    {season.isActive && (
                      <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">Active</span>
                    )}
                  </div>
                  <p className="text-slate-600 mt-1">Season #{season.seasonNumber}</p>
                </div>
                {season.isActive && canPerform('end_season') && (
                  <button
                    onClick={() => void handleEndSeason(season.id)}
                    disabled={endSeasonMutation.isPending}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                  >
                    {endSeasonMutation.isPending ? 'Ending...' : 'End Season'}
                  </button>
                )}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-4">
                <div className="bg-slate-50 rounded-lg p-4">
                  <p className="text-sm text-slate-500">Start Date</p>
                  <p className="text-lg font-medium">{new Date(season.startDate).toLocaleDateString()}</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-4">
                  <p className="text-sm text-slate-500">End Date</p>
                  <p className="text-lg font-medium">{new Date(season.endDate).toLocaleDateString()}</p>
                </div>
              </div>

              {season.isActive && season.endDate && (
                <div className="mt-4">
                  <p className="text-sm text-slate-500">
                    {(() => {
                      const endTime = new Date(season.endDate).getTime();
                      if (Number.isNaN(endTime)) return 'End date unavailable';
                      const days = Math.max(0, Math.ceil((endTime - Date.now()) / (1000 * 60 * 60 * 24)));
                      return `${days} days remaining`;
                    })()}
                  </p>
                  <div className="mt-2 w-full bg-slate-200 rounded-full h-2">
                    <div
                      className="bg-primary-600 rounded-full h-2"
                      style={{
                        width: `${Math.min(100, Math.max(0,
                          ((SEASONS_RENDER_NOW - new Date(season.startDate).getTime()) /
                          (new Date(season.endDate).getTime() - new Date(season.startDate).getTime())) * 100
                        ))}%`,
                      }}
                    />
                  </div>
                </div>
              )}

              {!season.isActive && (
                <div className="mt-4 text-sm text-slate-500">
                  Finalized: {season.rewardsDistributed ? 'Yes' : 'No'}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showCreateModal && (
        <CreateSeasonModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false);
          }}
        />
      )}
    </div>
  );
}

function CreateSeasonModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const createSeasonMutation = useCreateSeasonMutation();
  const [formData, setFormData] = useState(buildDefaultSeasonFormData);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const start = new Date(formData.startDate);
    const end = new Date(formData.endDate);
    if (start >= end) {
      toastError('End date must be after start date');
      return;
    }

    try {
      await createSeasonMutation.mutateAsync(formData);
      onCreated();
      toastSuccess('Season created');
    } catch (mutationError) {
      toastError(getErrorMessage(mutationError));
    }
  }

  return (
    <Modal open onClose={onClose} ariaLabel="Create season">
      <div className="bg-white rounded-lg p-6 w-full max-w-md mx-auto">
        <h2 className="text-xl font-bold mb-4">Create Season</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(event) => setFormData({ ...formData, name: event.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Start Date *</label>
            <input
              type="date"
              value={formData.startDate}
              onChange={(event) => setFormData({ ...formData, startDate: event.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">End Date *</label>
            <input
              type="date"
              value={formData.endDate}
              onChange={(event) => setFormData({ ...formData, endDate: event.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
              required
            />
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
              disabled={createSeasonMutation.isPending}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
            >
              {createSeasonMutation.isPending ? 'Creating...' : 'Create Season'}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
