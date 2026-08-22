import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useRBAC } from '../hooks/useRBAC';
import {
  useCreateReferralCodeMutation,
  useReferralCodeUsageQuery,
  useReferralCodesQuery,
  useToggleReferralCodeMutation,
} from '../domains/referralCodes/api';
import type { ReferralCodeContract } from '../domains/referralCodes/contracts';
import { getErrorMessage } from '../lib/errors';
import { toastError, toastSuccess } from '../lib/toast';
import Modal from '../components/Modal';
import SavedViewsToolbar from '../components/SavedViewsToolbar';

const PAGE_SIZE = 20;

function parsePositiveInt(value: string | null, fallback: number) {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export default function ReferralCodesPage() {
  const { can } = useRBAC();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showUsageModal, setShowUsageModal] = useState<ReferralCodeContract | null>(null);
  const page = parsePositiveInt(searchParams.get('page'), 1);
  const filter = searchParams.get('filter') || 'all';
  const referralCodesQuery = useReferralCodesQuery({
    page,
    limit: PAGE_SIZE,
    filter,
  });
  const toggleReferralCodeMutation = useToggleReferralCodeMutation();
  const canManageReferralCodes = can('referral_codes.manage');

  const codes = referralCodesQuery.data?.codes || [];
  const total = referralCodesQuery.data?.total || 0;
  const error = referralCodesQuery.error?.message || null;

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

  const handleToggle = async (code: ReferralCodeContract) => {
    try {
      await toggleReferralCodeMutation.mutateAsync({
        codeId: code.id,
        isActive: !code.isActive,
      });
      toastSuccess(code.isActive ? 'Referral code disabled' : 'Referral code enabled');
    } catch (toggleError) {
      toastError('Failed to update referral code: ' + getErrorMessage(toggleError));
    }
  };

  const getStatusBadge = (code: ReferralCodeContract) => {
    if (!code.isActive) {
      return <span className="badge badge-slate">Deactivated</span>;
    }
    if (code.expiresAt && new Date(code.expiresAt) < new Date()) {
      return <span className="badge badge-warning">Expired</span>;
    }
    if (code.currentUses >= code.maxUses) {
      return <span className="badge badge-warning">Exhausted</span>;
    }
    return <span className="badge badge-success">Active</span>;
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toastSuccess('Copied to clipboard');
    } catch {
      toastError('Clipboard copy failed');
    }
  };

  return (
    <div className="page-shell">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Referral Codes</h1>
          <p className="text-slate-600">Manage referral codes for web user registration</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => void referralCodesQuery.refetch()}
            disabled={referralCodesQuery.isFetching}
            className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50"
          >
            {referralCodesQuery.isFetching ? 'Refreshing...' : 'Refresh'}
          </button>
          {canManageReferralCodes && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
            >
              Create Code
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
        <div className="flex items-center gap-4">
          <label className="text-sm text-slate-600">Filter:</label>
          <select
            value={filter}
            onChange={(event) => updateParams({ filter: event.target.value || undefined })}
            className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm"
          >
            <option value="all">All Codes</option>
            <option value="active">Active Only</option>
            <option value="expired">Expired</option>
            <option value="exhausted">Exhausted</option>
            <option value="inactive">Deactivated</option>
          </select>
        </div>
      </div>

      <SavedViewsToolbar
        storageKey="referral-codes"
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
        {referralCodesQuery.isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          </div>
        ) : codes.length === 0 ? (
          <div className="flex items-center justify-center h-64">
            <p className="text-slate-500">No referral codes found</p>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Code</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Usage</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Created</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Expires</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {codes.map((code) => (
                <tr key={code.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <code className="text-sm font-mono font-semibold text-slate-800 bg-slate-100 px-2 py-1 rounded">
                        {code.code}
                      </code>
                      <button
                        onClick={() => void copyToClipboard(code.code)}
                        className="text-slate-400 hover:text-slate-600"
                        title="Copy to clipboard"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                        </svg>
                      </button>
                    </div>
                    {code.notes && (
                      <p className="text-xs text-slate-500 mt-1">{code.notes}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`badge ${code.creatorType === 'admin' ? 'badge-purple' : code.creatorType === 'user' ? 'badge-blue' : 'badge-slate'}`}>
                      {code.creatorType}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-24 bg-slate-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${code.currentUses >= code.maxUses ? 'bg-red-500' : 'bg-green-500'}`}
                          style={{ width: `${Math.min(100, (code.currentUses / code.maxUses) * 100)}%` }}
                        ></div>
                      </div>
                      <span className="text-sm text-slate-600">
                        {code.currentUses} / {code.maxUses}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">{getStatusBadge(code)}</td>
                  <td className="px-4 py-3">
                    <p className="text-sm text-slate-600">
                      {new Date(code.createdAt).toLocaleDateString()}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    {code.expiresAt ? (
                      <p className="text-sm text-slate-600">
                        {new Date(code.expiresAt).toLocaleDateString()}
                      </p>
                    ) : (
                      <span className="text-sm text-slate-400">Never</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => setShowUsageModal(code)}
                        className="text-primary-600 hover:text-primary-700 text-sm"
                      >
                        View Usage
                      </button>
                      {canManageReferralCodes && (
                        <button
                          onClick={() => void handleToggle(code)}
                          disabled={toggleReferralCodeMutation.isPending}
                          className={`text-sm ${code.isActive ? 'text-red-600 hover:text-red-700' : 'text-green-600 hover:text-green-700'} disabled:opacity-50`}
                        >
                          {toggleReferralCodeMutation.isPending ? '...' : code.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                      )}
                    </div>
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
        <CreateCodeModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false);
          }}
        />
      )}

      {showUsageModal && (
        <UsageModal
          code={showUsageModal}
          onClose={() => setShowUsageModal(null)}
        />
      )}
    </div>
  );
}

function CreateCodeModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const createReferralCodeMutation = useCreateReferralCodeMutation();
  const [customCode, setCustomCode] = useState('');
  const [maxUses, setMaxUses] = useState('100');
  const [expiresAt, setExpiresAt] = useState('');
  const [notes, setNotes] = useState('');

  const handleSubmit = async () => {
    try {
      await createReferralCodeMutation.mutateAsync({
        code: customCode.trim() || undefined,
        maxUses: Number.parseInt(maxUses, 10) || 100,
        expiresAt: expiresAt || undefined,
        notes: notes.trim() || undefined,
      });
      onCreated();
      toastSuccess('Referral code created');
    } catch (createError) {
      toastError('Failed to create referral code: ' + getErrorMessage(createError));
    }
  };

  return (
    <Modal open onClose={onClose} ariaLabel="Create referral code">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">Create Referral Code</h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Custom Code (optional)</label>
            <input
              type="text"
              value={customCode}
              onChange={(event) => setCustomCode(event.target.value.toUpperCase())}
              placeholder="Leave empty for auto-generated"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              maxLength={20}
            />
            <p className="text-xs text-slate-500 mt-1">3-20 alphanumeric characters</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Maximum Uses</label>
            <input
              type="number"
              value={maxUses}
              onChange={(event) => setMaxUses(event.target.value)}
              min="1"
              max="10000"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Expires At (optional)</label>
            <input
              type="datetime-local"
              value={expiresAt}
              onChange={(event) => setExpiresAt(event.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Internal notes about this code"
              rows={2}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg resize-none"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleSubmit()}
            disabled={createReferralCodeMutation.isPending}
            className="px-4 py-2 text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50"
          >
            {createReferralCodeMutation.isPending ? 'Creating...' : 'Create Code'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function UsageModal({
  code,
  onClose,
}: {
  code: ReferralCodeContract;
  onClose: () => void;
}) {
  const usageQuery = useReferralCodeUsageQuery(code.id);
  const usage = usageQuery.data?.usage || [];

  return (
    <Modal open onClose={onClose} ariaLabel="Referral code usage">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-lg mx-4 max-h-[80vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-800">Usage Details</h3>
            <code className="text-sm font-mono text-primary-600">{code.code}</code>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {usageQuery.isLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
            </div>
          ) : usage.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              This code has not been used yet.
            </div>
          ) : (
            <div className="space-y-2">
              {usage.map((entry, index) => (
                <div key={`${entry.userId}-${index}`} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div>
                    <p className="font-medium text-slate-800">{entry.nickname}</p>
                    <p className="text-xs text-slate-500">User ID: {entry.userId}</p>
                  </div>
                  <p className="text-sm text-slate-500">
                    {new Date(entry.usedAt).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end mt-4 pt-4 border-t border-slate-200">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
