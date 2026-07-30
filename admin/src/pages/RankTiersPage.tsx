import { useState } from 'react';
import { useRBAC } from '../hooks/useRBAC';
import {
  useCreateRankTierMutation,
  useDeleteRankTierMutation,
  useRankTiersQuery,
  useUpdateRankTierMutation,
  type RankTierInput,
} from '../domains/rankTiers/api';
import type { RankTierContract } from '../domains/rankTiers/contracts';
import { getErrorMessage } from '../lib/errors';
import { confirmAction } from '../lib/confirm';
import { toastError, toastSuccess } from '../lib/toast';
import Modal from '../components/Modal';

interface RankTierModalProps {
  tier: RankTierContract | null;
  onClose: () => void;
  onSave: (tier: RankTierInput) => Promise<void>;
  existingTiers: RankTierContract[];
}

function RankTierModal({ tier, onClose, onSave, existingTiers }: RankTierModalProps) {
  const [formData, setFormData] = useState<RankTierInput>({
    tierKey: tier?.tierKey || '',
    name: tier?.name || '',
    minMmr: tier?.minMmr ?? 0,
    maxMmr: tier?.maxMmr ?? 0,
    color: tier?.color || '#CD7F32',
    iconUrl: tier?.iconUrl || '',
    displayOrder: tier?.displayOrder ?? existingTiers.length + 1,
    isActive: tier?.isActive ?? true,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!/^[a-z][a-z0-9_]*$/.test(formData.tierKey)) {
      setError('Tier key must start with a lowercase letter and contain only lowercase letters, numbers, and underscores');
      return;
    }

    if (formData.minMmr > formData.maxMmr) {
      setError('Minimum MMR cannot be greater than maximum MMR');
      return;
    }

    for (const existingTier of existingTiers) {
      if (tier && existingTier.id === tier.id) continue;
      if (formData.minMmr <= existingTier.maxMmr && formData.maxMmr >= existingTier.minMmr) {
        setError(`MMR range overlaps with ${existingTier.name} (${existingTier.minMmr}-${existingTier.maxMmr})`);
        return;
      }
    }

    try {
      setIsSaving(true);
      await onSave(formData);
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save tier');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} ariaLabel={tier ? 'Edit rank tier' : 'Create rank tier'}>
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-auto max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-slate-200">
          <h2 className="text-xl font-bold text-slate-900">
            {tier ? 'Edit Rank Tier' : 'Create Rank Tier'}
          </h2>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Tier Key *</label>
              <input
                type="text"
                value={formData.tierKey}
                onChange={(event) => setFormData({ ...formData, tierKey: event.target.value.toLowerCase() })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                placeholder="e.g., diamond"
                required
                disabled={Boolean(tier)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Display Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(event) => setFormData({ ...formData, name: event.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                placeholder="e.g., Diamond"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Min MMR *</label>
              <input
                type="number"
                value={formData.minMmr}
                onChange={(event) => setFormData({ ...formData, minMmr: Number.parseInt(event.target.value, 10) || 0 })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                min="0"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Max MMR *</label>
              <input
                type="number"
                value={formData.maxMmr}
                onChange={(event) => setFormData({ ...formData, maxMmr: Number.parseInt(event.target.value, 10) || 0 })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                min="0"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Color</label>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={formData.color || '#CD7F32'}
                  onChange={(event) => setFormData({ ...formData, color: event.target.value })}
                  className="w-12 h-10 border rounded cursor-pointer"
                />
                <input
                  type="text"
                  value={formData.color || ''}
                  onChange={(event) => setFormData({ ...formData, color: event.target.value })}
                  className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                  placeholder="#CD7F32"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Display Order</label>
              <input
                type="number"
                value={formData.displayOrder}
                onChange={(event) => setFormData({ ...formData, displayOrder: Number.parseInt(event.target.value, 10) || 1 })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                min="1"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Icon URL</label>
            <input
              type="url"
              value={formData.iconUrl || ''}
              onChange={(event) => setFormData({ ...formData, iconUrl: event.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
              placeholder="https://example.com/icon.png"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isActive"
              checked={formData.isActive !== false}
              onChange={(event) => setFormData({ ...formData, isActive: event.target.checked })}
              className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
            />
            <label htmlFor="isActive" className="text-sm text-slate-700">
              Active (visible to players)
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : tier ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}

export default function RankTiersPage() {
  const { can } = useRBAC();
  const [showModal, setShowModal] = useState(false);
  const [editingTier, setEditingTier] = useState<RankTierContract | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const rankTiersQuery = useRankTiersQuery(showInactive);
  const createRankTierMutation = useCreateRankTierMutation();
  const updateRankTierMutation = useUpdateRankTierMutation();
  const deleteRankTierMutation = useDeleteRankTierMutation();
  const canManageRankTiers = can('rank_tiers.manage');

  const tiers = rankTiersQuery.data?.tiers || [];
  const filteredTiers = showInactive ? tiers : tiers.filter((tier) => tier.isActive);

  async function handleSaveTier(tierInput: RankTierInput) {
    if (editingTier) {
      await updateRankTierMutation.mutateAsync({
        tierId: editingTier.id,
        updates: tierInput,
      });
    } else {
      await createRankTierMutation.mutateAsync(tierInput);
    }
  }

  async function handleDeleteTier(tier: RankTierContract) {
    const confirmed = await confirmAction({
      title: 'Delete rank tier?',
      message: `Are you sure you want to delete the "${tier.name}" rank tier?`,
      confirmLabel: 'Delete',
      tone: 'danger',
    });

    if (!confirmed) {
      return;
    }

    try {
      await deleteRankTierMutation.mutateAsync(tier.id);
      toastSuccess('Rank tier deleted');
    } catch (deleteError) {
      toastError('Failed to delete tier: ' + getErrorMessage(deleteError));
    }
  }

  async function handleToggleActive(tier: RankTierContract) {
    try {
      await updateRankTierMutation.mutateAsync({
        tierId: tier.id,
        updates: { isActive: !tier.isActive },
      });
    } catch (toggleError) {
      toastError('Failed to update tier: ' + getErrorMessage(toggleError));
    }
  }

  if (rankTiersQuery.isLoading) {
    return (
      <div className="p-6 flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Rank Tiers</h1>
          <p className="text-slate-600 mt-1">Configure MMR-based rank tiers for display</p>
        </div>
        <div className="flex gap-3">
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
            onClick={() => void rankTiersQuery.refetch()}
            disabled={rankTiersQuery.isFetching}
            className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50"
          >
            {rankTiersQuery.isFetching ? 'Refreshing...' : 'Refresh'}
          </button>
          {canManageRankTiers && (
            <button
              onClick={() => {
                setEditingTier(null);
                setShowModal(true);
              }}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
            >
              Add Tier
            </button>
          )}
        </div>
      </div>

      {rankTiersQuery.error && (
        <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-sm text-yellow-700">
            Showing the latest successful result. Refresh warning: {rankTiersQuery.error.message}
          </p>
        </div>
      )}

      <div className="bg-white rounded-lg shadow mb-6 p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">MMR Range Visualization</h2>
        <div className="relative h-12 bg-slate-100 rounded-lg overflow-hidden">
          {filteredTiers
            .slice()
            .sort((a, b) => a.minMmr - b.minMmr)
            .map((tier) => {
              const maxDisplay = 10000;
              const left = (tier.minMmr / maxDisplay) * 100;
              const width = ((Math.min(tier.maxMmr, maxDisplay) - tier.minMmr) / maxDisplay) * 100;
              return (
                <div
                  key={tier.id}
                  className="absolute h-full flex items-center justify-center text-white text-xs font-medium"
                  style={{
                    left: `${Math.min(left, 100)}%`,
                    width: `${Math.min(width, 100 - left)}%`,
                    backgroundColor: tier.color || '#666',
                  }}
                  title={`${tier.name}: ${tier.minMmr}-${tier.maxMmr}`}
                >
                  {width > 5 && tier.name}
                </div>
              );
            })}
        </div>
        <div className="flex justify-between mt-2 text-xs text-slate-500">
          <span>0</span>
          <span>2000</span>
          <span>4000</span>
          <span>6000</span>
          <span>8000</span>
          <span>10000+</span>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Order</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Tier</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Key</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">MMR Range</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Color</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-200">
            {filteredTiers
              .slice()
              .sort((a, b) => a.displayOrder - b.displayOrder)
              .map((tier) => (
                <tr key={tier.id} className={!tier.isActive ? 'bg-slate-50 opacity-60' : ''}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{tier.displayOrder}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs"
                        style={{ backgroundColor: tier.color || '#666' }}
                      >
                        {tier.name[0]}
                      </div>
                      <span className="font-medium text-slate-900">{tier.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 font-mono">{tier.tierKey}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                    {tier.minMmr.toLocaleString()} - {tier.maxMmr.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-6 h-6 rounded border border-slate-200"
                        style={{ backgroundColor: tier.color || '#666' }}
                      />
                      <span className="text-sm text-slate-500 font-mono">{tier.color}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <button
                      onClick={() => canManageRankTiers && void handleToggleActive(tier)}
                      disabled={!canManageRankTiers || updateRankTierMutation.isPending}
                      className={`px-2 py-1 text-xs font-medium rounded-full ${
                        tier.isActive ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-600'
                      } disabled:opacity-50`}
                    >
                      {tier.isActive ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                    {canManageRankTiers && (
                      <>
                        <button
                          onClick={() => {
                            setEditingTier(tier);
                            setShowModal(true);
                          }}
                          className="text-primary-600 hover:text-primary-900 mr-4"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => void handleDeleteTier(tier)}
                          className="text-red-600 hover:text-red-900"
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <RankTierModal
          tier={editingTier}
          onClose={() => {
            setShowModal(false);
            setEditingTier(null);
          }}
          onSave={handleSaveTier}
          existingTiers={tiers.filter((tier) => !editingTier || tier.id !== editingTier.id)}
        />
      )}
    </div>
  );
}
