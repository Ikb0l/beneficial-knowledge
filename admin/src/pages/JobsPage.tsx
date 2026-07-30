import { useState } from 'react';
import { Link } from 'react-router-dom';
import Modal from '../components/Modal';
import {
  useContinueRankedResetMutation,
  useJobsSnapshot,
  useStartRankedResetMutation,
} from '../domains/jobs/api';
import type { RecentJob } from '../domains/jobs/contracts';
import { confirmAction } from '../lib/confirm';
import { getErrorMessage } from '../lib/errors';
import { toastError, toastSuccess } from '../lib/toast';
import { Button, EmptyState, Input, PageHeader, Section, Spinner, StatCard, Textarea } from '../components/ui';

const RANKED_RESET_CONFIRM_TEXT = 'RESET RANKED DATA';

function formatTimestamp(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === '') return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleString();
}

function formatRankedResetStage(stage: string) {
  if (stage === 'reset_players') return 'Reset player MMR';
  if (stage === 'wipe_ranked_history') return 'Clear ranked history';
  if (stage === 'clear_category_leaderboards') return 'Clear category leaderboards';
  if (stage === 'complete') return 'Completed';
  return stage || 'Unknown';
}

function getStatusBadgeClass(status: string) {
  if (status === 'failed' || status === 'cancelled') return 'badge-error';
  if (status === 'completed' || status === 'committed') return 'badge-success';
  if (status === 'validated') return 'badge-info';
  if (status === 'running' || status === 'in_progress') return 'badge-warning';
  return 'badge';
}

function shortId(value: string) {
  return value.length > 8 ? value.slice(0, 8) : value;
}

function getRankedResetToast(result: { status: string; error: string | null }) {
  if (result.status === 'completed') {
    return { type: 'success' as const, message: 'Ranked reset completed successfully.' };
  }
  if (result.status === 'failed') {
    return { type: 'error' as const, message: result.error || 'Ranked reset failed.' };
  }
  return { type: 'info' as const, message: 'Ranked reset is still in progress. Continue again if needed.' };
}

export default function JobsPage() {
  const { data, isLoading, error, refetch, isFetching } = useJobsSnapshot();
  const continueRankedResetMutation = useContinueRankedResetMutation();
  const startRankedResetMutation = useStartRankedResetMutation();

  const [showStartResetModal, setShowStartResetModal] = useState(false);
  const [rankedResetReason, setRankedResetReason] = useState('');
  const [rankedResetConfirmText, setRankedResetConfirmText] = useState('');

  const isRankedResetBusy = continueRankedResetMutation.isPending || startRankedResetMutation.isPending;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="page-shell">
        <PageHeader title="Jobs Center" subtitle="Monitor long-running admin work in one place" />
        <EmptyState
          title="Jobs snapshot unavailable"
          subtitle={error?.message || 'The admin API did not return a valid jobs snapshot.'}
          action={<Button onClick={() => void refetch()}>Retry</Button>}
        />
      </div>
    );
  }

  const { summary, warnings, recentJobs, aiJobs, rankedReset, canViewRankedReset } = data;
  const rankedResetIsRunning = rankedReset?.status === 'in_progress' || rankedReset?.status === 'pending';

  async function handleContinueRankedReset() {
    if (!rankedReset?.jobId) return;

    try {
      const result = await continueRankedResetMutation.mutateAsync(rankedReset.jobId);
      const feedback = getRankedResetToast(result);
      if (feedback.type === 'success') toastSuccess(feedback.message);
      else if (feedback.type === 'error') toastError(feedback.message);
      else toastSuccess(feedback.message);
      await refetch();
    } catch (mutationError) {
      toastError('Failed to continue ranked reset: ' + getErrorMessage(mutationError));
    }
  }

  async function handleStartRankedReset() {
    const reason = rankedResetReason.trim();
    if (reason.length < 10) {
      toastError('Reason must be at least 10 characters.');
      return;
    }
    if (reason.length > 500) {
      toastError('Reason must be less than 500 characters.');
      return;
    }
    if (rankedResetConfirmText.trim() !== RANKED_RESET_CONFIRM_TEXT) {
      toastError(`Type "${RANKED_RESET_CONFIRM_TEXT}" exactly to unlock reset.`);
      return;
    }

    const confirmed = await confirmAction({
      title: 'Start ranked reset?',
      message:
        'This will reset all player MMR to defaults, clear ranked match history, and clear category leaderboards.\n' +
        'Run this only in a maintenance window with no active matches.',
      confirmLabel: 'Start reset',
      tone: 'danger',
    });
    if (!confirmed) {
      return;
    }

    try {
      const result = await startRankedResetMutation.mutateAsync({
        reason,
        confirmText: rankedResetConfirmText.trim(),
        maintenanceConfirmed: true,
      });

      const feedback = getRankedResetToast(result);
      if (feedback.type === 'success') toastSuccess(feedback.message);
      else if (feedback.type === 'error') toastError(feedback.message);
      else toastSuccess(feedback.message);

      setShowStartResetModal(false);
      setRankedResetReason('');
      setRankedResetConfirmText('');
      await refetch();
    } catch (mutationError) {
      toastError('Failed to start ranked reset: ' + getErrorMessage(mutationError));
    }
  }

  return (
    <div className="page-shell">
      <PageHeader
        title="Jobs Center"
        subtitle="Monitor destructive operations and AI generation"
        actions={(
          <Button variant="secondary" onClick={() => void refetch()} loading={isFetching}>
            Refresh
          </Button>
        )}
      />

      {error && (
        <div className="rounded-xl border border-yellow-300/75 bg-yellow-100/70 p-4">
          <p className="text-sm text-yellow-800">
            Showing the latest successful snapshot. Refresh warning: {error.message}
          </p>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {warnings.map((warning) => (
            <div
              key={warning.id}
              className={`rounded-2xl border p-4 ${
                warning.tone === 'danger'
                  ? 'border-rose-200 bg-rose-50/80'
                  : warning.tone === 'warning'
                    ? 'border-amber-200 bg-amber-50/80'
                    : 'border-sky-200 bg-sky-50/80'
              }`}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{warning.tone}</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">{warning.title}</p>
              <p className="mt-1 text-sm text-slate-600">{warning.description}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard title="Active Jobs" value={summary.activeJobs} subtitle="Running or in-flight work" tone="warning" />
        <StatCard title="Failed Jobs" value={summary.failedJobs} subtitle="Needs operator review" tone="warning" />
        <StatCard title="Queued Jobs" value={summary.queuedJobs} subtitle="Scheduled or pending execution" tone="info" />
      </div>

      <Section
        title="Recent Jobs"
        subtitle="Latest tracked operations across the admin platform"
        actions={<Link to="/audit-log" className="text-sm font-medium text-primary-700 hover:text-primary-900">Open audit log</Link>}
      >
        {recentJobs.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {recentJobs.map((job) => (
              <RecentJobCard key={`${job.kind}-${job.id}`} job={job} />
            ))}
          </div>
        ) : (
          <EmptyState title="No recent jobs" subtitle="Jobs will appear here once longer-running work is triggered." />
        )}
      </Section>

      <div className={`grid gap-6 ${canViewRankedReset ? 'xl:grid-cols-[1fr_1.15fr]' : 'xl:grid-cols-1'}`}>
        {canViewRankedReset && (
          <Section
            title="Ranked Reset"
            subtitle="Single destructive maintenance job for ranked data"
            actions={(
              <div className="flex flex-wrap gap-2">
                {rankedResetIsRunning ? (
                  <Button
                    variant="secondary"
                    onClick={() => void handleContinueRankedReset()}
                    loading={continueRankedResetMutation.isPending}
                  >
                    Continue
                  </Button>
                ) : (
                  <Button
                    variant="danger"
                    onClick={() => setShowStartResetModal(true)}
                    disabled={isRankedResetBusy}
                  >
                    Start New Reset
                  </Button>
                )}
                <Link to="/game-settings" className="text-sm font-medium text-primary-700 hover:text-primary-900">Open game settings</Link>
              </div>
            )}
          >
            {rankedReset ? (
              <div className="space-y-4 rounded-2xl border border-slate-200/80 bg-white/60 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{formatRankedResetStage(rankedReset.stage)}</p>
                    <p className="mt-1 text-xs text-slate-500">Job {rankedReset.jobId}</p>
                  </div>
                  <span className={`badge ${getStatusBadgeClass(rankedReset.status)}`}>
                    {rankedReset.status.replace(/_/g, ' ')}
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <MetricCell label="Updated" value={formatTimestamp(rankedReset.updatedAt)} />
                  <MetricCell label="Completed" value={formatTimestamp(rankedReset.completedAt)} />
                </div>

                <div>
                  <div className="mb-1 flex items-center justify-between text-sm text-slate-600">
                    <span>Players reset</span>
                    <span>{rankedReset.progress.playersProcessed} / {rankedReset.progress.playersTotal || rankedReset.totals.players}</span>
                  </div>
                  <ProgressBar
                    value={rankedReset.progress.playersProcessed}
                    total={rankedReset.progress.playersTotal || rankedReset.totals.players}
                  />
                </div>

                <div>
                  <div className="mb-1 flex items-center justify-between text-sm text-slate-600">
                    <span>Category leaderboards cleared</span>
                    <span>{rankedReset.progress.categoryBoardsProcessed} / {rankedReset.progress.categoryBoardsTotal || rankedReset.totals.categoryLeaderboards}</span>
                  </div>
                  <ProgressBar
                    value={rankedReset.progress.categoryBoardsProcessed}
                    total={rankedReset.progress.categoryBoardsTotal || rankedReset.totals.categoryLeaderboards}
                  />
                </div>

                {rankedReset.reason ? (
                  <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
                    <span className="font-medium text-slate-800">Reason:</span> {rankedReset.reason}
                  </p>
                ) : null}

                {rankedReset.error ? (
                  <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                    <span className="font-medium">Error:</span> {rankedReset.error}
                  </p>
                ) : null}
              </div>
            ) : (
              <EmptyState title="No ranked reset job" subtitle="No ranked reset has been run yet." />
            )}
          </Section>
        )}

        <Section
          title="AI Generation Jobs"
          subtitle="Recent AI generation runs, schedules, and failures"
          actions={<Link to="/ai-questions" className="text-sm font-medium text-primary-700 hover:text-primary-900">Open AI workspace</Link>}
        >
          {aiJobs.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Job</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Category</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Status</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Counts</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {aiJobs.map((job) => {
                    const stats = job.stats || {};
                    const imported = typeof stats.imported === 'number' ? stats.imported : 0;
                    const queued = typeof stats.queuedForReview === 'number' ? stats.queuedForReview : 0;
                    const failed = typeof stats.failed === 'number' ? stats.failed : 0;

                    return (
                      <tr key={job.id}>
                        <td className="px-3 py-2 text-sm">
                          <div className="font-medium text-slate-900">{shortId(job.id)}</div>
                          <div className="text-xs text-slate-500">{job.triggerType}</div>
                        </td>
                        <td className="px-3 py-2 text-sm text-slate-700">{job.categoryKey}</td>
                        <td className="px-3 py-2 text-sm">
                          <span className={`badge ${getStatusBadgeClass(job.status)}`}>{job.status}</span>
                        </td>
                        <td className="px-3 py-2 text-sm text-slate-600">
                          imported={imported}, review={queued}, failed={failed}
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-500">
                          <div>Updated: {formatTimestamp(job.updatedAt)}</div>
                          {job.errorSummary ? <div className="text-rose-700">Error: {job.errorSummary}</div> : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No AI jobs" subtitle="AI generation activity will appear here once jobs are queued." />
          )}
        </Section>
      </div>

      <Section title="Relevant Consoles" subtitle="Jump to the workspace responsible for each job type">
        <div className="flex flex-wrap gap-3">
          <Link to="/game-settings" className="btn btn-secondary">Game Settings</Link>
          <Link to="/ai-questions" className="btn btn-secondary">AI Questions</Link>
          <Link to="/audit-log" className="btn btn-secondary">Audit Log</Link>
        </div>
      </Section>

      <RankedResetStartModal
        open={showStartResetModal}
        reason={rankedResetReason}
        confirmText={rankedResetConfirmText}
        isSubmitting={startRankedResetMutation.isPending}
        onClose={() => setShowStartResetModal(false)}
        onReasonChange={setRankedResetReason}
        onConfirmTextChange={setRankedResetConfirmText}
        onSubmit={() => void handleStartRankedReset()}
      />

    </div>
  );
}

function RankedResetStartModal({
  open,
  reason,
  confirmText,
  isSubmitting,
  onClose,
  onReasonChange,
  onConfirmTextChange,
  onSubmit,
}: {
  open: boolean;
  reason: string;
  confirmText: string;
  isSubmitting: boolean;
  onClose: () => void;
  onReasonChange: (value: string) => void;
  onConfirmTextChange: (value: string) => void;
  onSubmit: () => void;
}) {
  if (!open) return null;

  return (
    <Modal open onClose={onClose} ariaLabel="Start ranked reset">
      <div className="mx-auto w-full max-w-xl rounded-xl bg-white shadow-xl">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Start Ranked Reset</h2>
          <p className="mt-1 text-sm text-slate-600">
            This is a destructive maintenance action. Use only during a maintenance window with zero active matches.
          </p>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            This will reset all player MMR, clear ranked match history, and wipe category leaderboards.
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Reason</label>
            <Textarea
              rows={4}
              value={reason}
              onChange={(event) => onReasonChange(event.target.value)}
              placeholder="Explain why this ranked reset is being run."
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Type <code>{RANKED_RESET_CONFIRM_TEXT}</code> to confirm
            </label>
            <Input
              value={confirmText}
              onChange={(event) => onConfirmTextChange(event.target.value)}
              placeholder={RANKED_RESET_CONFIRM_TEXT}
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4">
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onSubmit} loading={isSubmitting}>
            Start reset
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-white/70 p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-2 text-sm text-slate-900">{value}</p>
    </div>
  );
}

function ProgressBar({ value, total }: { value: number; total: number }) {
  const width = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  return (
    <div className="h-2 rounded-full bg-slate-200">
      <div className="h-2 rounded-full bg-primary-600" style={{ width: `${width}%` }} />
    </div>
  );
}

function RecentJobCard({ job }: { job: RecentJob }) {
  return (
    <Link to={job.routePath} className="rounded-2xl border border-slate-200/80 bg-white/70 p-4 transition hover:border-primary-200 hover:bg-white">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">{job.title}</p>
          <p className="mt-1 text-xs text-slate-500">{job.label}</p>
        </div>
        <span className={`badge ${getStatusBadgeClass(job.status)}`}>{job.status.replace(/_/g, ' ')}</span>
      </div>
      <p className="mt-3 text-sm text-slate-600">{job.detail}</p>
      <p className="mt-2 text-xs text-slate-500">Updated: {formatTimestamp(job.updatedAt)}</p>
    </Link>
  );
}
