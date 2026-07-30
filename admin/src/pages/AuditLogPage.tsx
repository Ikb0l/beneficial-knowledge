import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuditLogsQuery } from '../domains/audit/api';
import type { AuditLogEntryContract } from '../domains/audit/contracts';
import Modal from '../components/Modal';
import SavedViewsToolbar from '../components/SavedViewsToolbar';
import { Button, DataTableShell, EmptyState, Input, PageHeader, Select, Spinner } from '../components/ui';

const PAGE_SIZE = 50;

function parsePositiveInt(value: string | null, fallback: number) {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export default function AuditLogPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedLog, setSelectedLog] = useState<AuditLogEntryContract | null>(null);

  const page = parsePositiveInt(searchParams.get('page'), 1);
  const actionType = searchParams.get('actionType') || '';
  const targetType = searchParams.get('targetType') || '';
  const adminId = searchParams.get('adminId') || '';
  const targetId = searchParams.get('targetId') || '';
  const fromDate = searchParams.get('fromDate') || '';
  const toDate = searchParams.get('toDate') || '';

  const { data, isLoading, error, refetch, isFetching } = useAuditLogsQuery({
    page,
    pageSize: PAGE_SIZE,
    actionType: actionType || undefined,
    targetType: targetType || undefined,
    adminId: adminId || undefined,
    targetId: targetId || undefined,
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
  });

  const logs = data?.logs || [];
  const total = data?.total || 0;
  const totalPages = Math.max(1, data?.totalPages || Math.ceil(total / PAGE_SIZE) || 1);
  const actionTypes = data?.actionTypes || [];
  const targetTypes = data?.targetTypes || [];
  const activeFilterCount = [actionType, targetType, adminId, targetId, fromDate, toDate].filter(Boolean).length;

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

  const clearFilters = () => {
    setSearchParams(new URLSearchParams());
  };

  const showingFrom = total === 0 ? 0 : ((page - 1) * PAGE_SIZE) + 1;
  const showingTo = total === 0 ? 0 : Math.min(page * PAGE_SIZE, total);

  return (
    <div className="page-shell">
      <PageHeader
        title="Audit Log"
        subtitle="Searchable record of admin actions, targets, and change payloads"
        actions={(
          <Button variant="secondary" onClick={() => void refetch()} loading={isFetching}>
            Refresh
          </Button>
        )}
      />

      {error && (
        <div className="rounded-xl border border-yellow-300/75 bg-yellow-100/70 p-4">
          <p className="text-sm text-yellow-800">
            Showing the latest successful result. Refresh warning: {error.message}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <SummaryCard label="Entries" value={total} detail={`${showingFrom}-${showingTo} on this page`} />
        <SummaryCard label="Filter presets" value={actionTypes.length} detail="Server-discovered action types" />
        <SummaryCard label="Active filters" value={activeFilterCount} detail={activeFilterCount > 0 ? 'URL-synced for reload/share' : 'No filters applied'} />
      </div>

      <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Action Type</label>
            <Select
              value={actionType}
              onChange={(event) => updateParams({ actionType: event.target.value || undefined })}
            >
              <option value="">All Actions</option>
              {actionTypes.map((type) => (
                <option key={type} value={type}>
                  {type.replace(/_/g, ' ')}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Target Type</label>
            <Select
              value={targetType}
              onChange={(event) => updateParams({ targetType: event.target.value || undefined })}
            >
              <option value="">All Targets</option>
              {targetTypes.map((type) => (
                <option key={type} value={type}>
                  {type.replace(/_/g, ' ')}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Admin ID</label>
            <Input
              value={adminId}
              onChange={(event) => updateParams({ adminId: event.target.value || undefined })}
              placeholder="Admin user id"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Target ID</label>
            <Input
              value={targetId}
              onChange={(event) => updateParams({ targetId: event.target.value || undefined })}
              placeholder="Entity id"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">From Date</label>
            <Input
              type="date"
              value={fromDate}
              onChange={(event) => updateParams({ fromDate: event.target.value || undefined })}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">To Date</label>
            <Input
              type="date"
              value={toDate}
              onChange={(event) => updateParams({ toDate: event.target.value || undefined })}
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-500">
            Filters stay in the URL so you can reload or share this exact audit view.
          </p>
          <Button variant="ghost" onClick={clearFilters} disabled={activeFilterCount === 0}>
            Clear Filters
          </Button>
        </div>
      </div>

      <SavedViewsToolbar
        storageKey="audit-log"
        searchParams={searchParams}
        onApply={(next) => setSearchParams(next)}
      />

      <DataTableShell>
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Spinner size="lg" />
          </div>
        ) : logs.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <EmptyState
              title="No audit entries found"
              subtitle={activeFilterCount > 0 ? 'Try clearing filters or widening the date range.' : 'Admin actions will appear here as changes are made.'}
            />
          </div>
        ) : (
          <>
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Time</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Admin</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Action</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Target</th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase text-slate-500">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{log.adminName}</p>
                        <p className="text-xs text-slate-500">Telegram ID: {log.adminTelegramId}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`rounded px-2 py-1 text-xs font-medium ${getActionColor(log.actionType)}`}>
                        {log.actionType.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {log.targetType ? (
                        <div>
                          <p className="text-sm capitalize text-slate-900">{log.targetType.replace(/_/g, ' ')}</p>
                          {log.targetId ? (
                            <p className="max-w-[220px] truncate font-mono text-xs text-slate-500">{log.targetId}</p>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-sm text-slate-400">N/A</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedLog(log)}
                        className="text-sm text-primary-600 hover:text-primary-900"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-slate-200 px-6 py-4">
                <p className="text-sm text-slate-500">
                  Page {page} of {totalPages}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setPage(Math.max(1, page - 1))}
                    disabled={page === 1}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setPage(Math.min(totalPages, page + 1))}
                    disabled={page >= totalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </DataTableShell>

      {selectedLog ? (
        <LogDetailModal log={selectedLog} onClose={() => setSelectedLog(null)} />
      ) : null}
    </div>
  );
}

function SummaryCard({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white/60 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
      <p className="mt-1 text-sm text-slate-500">{detail}</p>
    </div>
  );
}

function getActionColor(actionType: string): string {
  if (actionType.includes('delete')) return 'bg-red-100 text-red-800';
  if (actionType.includes('create') || actionType.includes('start')) return 'bg-green-100 text-green-800';
  if (actionType.includes('update') || actionType.includes('set')) return 'bg-blue-100 text-blue-800';
  if (actionType.includes('ban') || actionType.includes('cancel')) return 'bg-orange-100 text-orange-800';
  return 'bg-slate-100 text-slate-800';
}

function hasEntries(value: Record<string, unknown> | null | undefined) {
  return !!value && Object.keys(value).length > 0;
}

function LogDetailModal({
  log,
  onClose,
}: {
  log: AuditLogEntryContract;
  onClose: () => void;
}) {
  return (
    <Modal open onClose={onClose} ariaLabel="Audit log details">
      <div className="mx-auto max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 p-6">
          <h2 className="text-xl font-bold text-slate-900">Audit Log Details</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="space-y-6 p-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <DetailCell label="Timestamp" value={new Date(log.createdAt).toLocaleString()} />
            <div>
              <p className="mb-1 text-xs font-medium text-slate-500">Action Type</p>
              <span className={`rounded px-2 py-1 text-xs font-medium ${getActionColor(log.actionType)}`}>
                {log.actionType.replace(/_/g, ' ')}
              </span>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-slate-500">Admin</p>
              <p className="text-sm text-slate-900">{log.adminName}</p>
              <p className="text-xs text-slate-500">Telegram ID: {log.adminTelegramId}</p>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-slate-500">Target</p>
              {log.targetType ? (
                <>
                  <p className="text-sm capitalize text-slate-900">{log.targetType.replace(/_/g, ' ')}</p>
                  {log.targetId ? (
                    <p className="font-mono text-xs text-slate-500">{log.targetId}</p>
                  ) : null}
                </>
              ) : (
                <p className="text-sm text-slate-400">N/A</p>
              )}
            </div>
          </div>

          {hasEntries(log.oldValue) ? (
            <PayloadBlock
              label="Previous Value"
              value={log.oldValue ?? {}}
              className="border-red-200 bg-red-50"
            />
          ) : null}

          {hasEntries(log.newValue) ? (
            <PayloadBlock
              label="New Value"
              value={log.newValue ?? {}}
              className="border-green-200 bg-green-50"
            />
          ) : null}

          {hasEntries(log.metadata) ? (
            <PayloadBlock
              label="Additional Metadata"
              value={log.metadata ?? {}}
              className="border-slate-200 bg-slate-50"
            />
          ) : null}
        </div>

        <div className="flex justify-end border-t border-slate-200 p-6">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function DetailCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-slate-500">{label}</p>
      <p className="text-sm text-slate-900">{value}</p>
    </div>
  );
}

function PayloadBlock({
  label,
  value,
  className,
}: {
  label: string;
  value: Record<string, unknown>;
  className: string;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium text-slate-500">{label}</p>
      <pre className={`overflow-x-auto rounded-lg border p-3 text-xs ${className}`}>
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}
