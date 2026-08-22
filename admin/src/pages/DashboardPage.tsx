import { Link } from 'react-router-dom';
import { useDashboardSnapshot } from '../domains/dashboard/api';
import type { DashboardSnapshot } from '../domains/dashboard/contracts';
import { EmptyState, PageHeader, Section, Spinner, StatCard } from '../components/ui';

export default function DashboardPage() {
  const { data, isLoading, error, refetch, isFetching } = useDashboardSnapshot();

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
        <PageHeader title="Dashboard" subtitle="Operations snapshot for the platform" />
        <EmptyState
          title="Dashboard snapshot unavailable"
          subtitle={error?.message || 'The admin API did not return a valid dashboard snapshot.'}
          action={(
            <button type="button" className="btn btn-primary" onClick={() => void refetch()}>
              Retry
            </button>
          )}
        />
      </div>
    );
  }

  const {
    summary,
    jobsSummary,
    recentJobs,
    healthCheck,
    serverStatus,
    onlineStats,
    recentMatches,
    recentActions,
    warnings,
  } = data;

  return (
    <div className="page-shell">
      <PageHeader
        title="Operations Center"
        subtitle="Live platform health, jobs, activity, and recent operator changes"
        actions={(
          <button type="button" className="btn btn-secondary" onClick={() => void refetch()} disabled={isFetching}>
            {isFetching ? 'Refreshing...' : 'Refresh snapshot'}
          </button>
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
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
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
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                {warning.tone}
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-900">{warning.title}</p>
              <p className="mt-1 text-sm text-slate-600">{warning.description}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Total Users"
          value={summary.totalUsers}
          subtitle={`${summary.newUsersToday} new today`}
          icon={<UsersIcon />}
          tone="primary"
        />
        <StatCard
          title="Active Users (24h)"
          value={summary.activeUsers24h}
          subtitle={`${summary.totalUsers > 0 ? ((summary.activeUsers24h / summary.totalUsers) * 100).toFixed(1) : '0.0'}% of total`}
          icon={<ActivityIcon />}
          tone="success"
        />
        <StatCard
          title="Matches Today"
          value={summary.matchesToday}
          subtitle={`${summary.totalMatches} total matches`}
          icon={<MatchIcon />}
          tone="info"
        />
        <StatCard
          title="Question Library"
          value={summary.totalQuestions}
          subtitle={`${summary.activeCategories} active categories`}
          icon={<QuestionIcon />}
          tone="warning"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.3fr_1fr]">
        <Section title="Platform Status" subtitle="Current runtime, matchmaking, and config state">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <StatusCell
              label="Health"
              value={healthCheck?.status || 'unknown'}
              detail={healthCheck ? `Version ${healthCheck.version}` : 'No health check response'}
              tone={healthCheck?.status === 'healthy' ? 'success' : 'warning'}
            />
            <StatusCell
              label="Online Now"
              value={onlineStats?.playersOnline ?? '--'}
              detail={`Active matches: ${onlineStats?.activeMatches ?? '--'}`}
              tone="info"
            />
            <StatusCell
              label="Config"
              value={`${serverStatus?.config.questionsPerMatch ?? '--'} Q`}
              detail={`${serverStatus?.config.timePerQuestion ?? '--'}s per question`}
              tone="primary"
            />
          </div>
        </Section>

        <Section
          title="Jobs Overview"
          subtitle="Long-running work and scheduled operations"
          actions={<Link to="/jobs" className="text-sm font-medium text-primary-700 hover:text-primary-900">Open jobs center</Link>}
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <StatusCell label="Active" value={jobsSummary.activeJobs} detail="Running or in-flight jobs" tone="warning" />
            <StatusCell label="Failed" value={jobsSummary.failedJobs} detail="Jobs needing review" tone={jobsSummary.failedJobs > 0 ? 'warning' : 'success'} />
            <StatusCell label="Queued" value={jobsSummary.queuedJobs} detail="Scheduled or pending AI runs" tone="info" />
          </div>

          <div className="mt-4 space-y-3">
            {recentJobs.length > 0 ? recentJobs.map((job) => (
              <JobCard key={`${job.kind}-${job.id}`} job={job} />
            )) : (
              <EmptyState title="No recent jobs" subtitle="Tracked jobs will appear here once operators trigger them." />
            )}
          </div>
        </Section>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.3fr_1fr]">
        <Section
          title="Recent Admin Actions"
          subtitle="Latest audit trail entries"
          actions={<Link to="/audit-log" className="text-sm font-medium text-primary-700 hover:text-primary-900">Open audit log</Link>}
        >
          {recentActions.length > 0 ? (
            <div className="space-y-3">
              {recentActions.map((action) => (
                <div key={action.id} className="rounded-xl border border-slate-200/80 bg-white/60 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {action.actionType.replace(/_/g, ' ')}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {action.adminName} • {new Date(action.createdAt).toLocaleString()}
                      </p>
                    </div>
                    {action.targetType ? (
                      <span className="badge badge-info capitalize">{action.targetType}</span>
                    ) : null}
                  </div>
                  {action.targetId ? (
                    <p className="mt-2 truncate text-xs font-mono text-slate-500">{action.targetId}</p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No recent admin actions" subtitle="Actions will appear here once operators start making changes." />
          )}
        </Section>

        <Section title="Activity (Last 7 Days)" subtitle="Daily match volume from the unified dashboard snapshot">
          {data.activity.length > 0 ? (
            <SimpleBarChart data={data.activity} />
          ) : (
            <EmptyState title="No activity data available" subtitle="The dashboard snapshot returned no activity points." />
          )}
        </Section>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.3fr_1fr]">
        <Section
          title="Recent Matches"
          subtitle="Latest completed matches"
          actions={<Link to="/matches" className="text-sm font-medium text-primary-700 hover:text-primary-900">View all</Link>}
        >
          {recentMatches.length > 0 ? (
            <div className="space-y-3">
              {recentMatches.map((match) => (
                <MatchCard key={match.matchId} match={match} />
              ))}
            </div>
          ) : (
            <EmptyState title="No recent matches" subtitle="Match history will populate here after completed games." />
          )}
        </Section>

        <Section title="Quick Actions" subtitle="Fast path into the most common operator flows">
          <div className="flex flex-wrap gap-3">
            <Link to="/questions/new" className="btn btn-primary">
              <PlusIcon className="w-4 h-4" />
              Add Question
            </Link>
            <Link to="/jobs" className="btn btn-secondary">
              <BriefcaseIcon className="w-4 h-4" />
              Jobs Center
            </Link>
            <Link to="/home-control" className="btn btn-secondary">
              <HomeIcon className="w-4 h-4" />
              Edit Home
            </Link>
            <Link to="/tournaments" className="btn btn-secondary">
              <TournamentIcon className="w-4 h-4" />
              Tournament Ops
            </Link>
          </div>
        </Section>
      </div>
    </div>
  );
}

function StatusCell({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string | number;
  detail: string;
  tone: 'primary' | 'success' | 'warning' | 'info';
}) {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-white/60 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <div className="mt-2 flex items-center gap-2">
        <span className={`badge ${
          tone === 'success'
            ? 'badge-success'
            : tone === 'warning'
              ? 'badge-warning'
              : tone === 'info'
                ? 'badge-info'
                : 'badge'
        }`}>
          {String(value)}
        </span>
      </div>
      <p className="mt-2 text-sm text-slate-600">{detail}</p>
    </div>
  );
}

function MatchCard({ match }: { match: DashboardSnapshot['recentMatches'][number] }) {
  const isDraw = match.winnerId === null;
  const winner = match.winnerId === match.player1Id ? match.player1Name : match.player2Name;

  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-white/60 p-[clamp(10px,2.4vw,14px)]">
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-800">{match.player1Name}</span>
          <span className="text-xs text-slate-500">vs</span>
          <span className="text-sm font-medium text-slate-800">{match.player2Name}</span>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <span className="badge badge-info capitalize">{match.category}</span>
          <span className="text-xs text-slate-500">
            {match.player1Score} - {match.player2Score}
          </span>
        </div>
      </div>
      <div className="text-right">
        <span className={`text-xs font-medium ${isDraw ? 'text-slate-600' : 'text-green-600'}`}>
          {isDraw ? 'Draw' : `${winner} won`}
        </span>
      </div>
    </div>
  );
}

function JobCard({ job }: { job: DashboardSnapshot['recentJobs'][number] }) {
  return (
    <Link to={job.routePath} className="block rounded-xl border border-slate-200/80 bg-white/60 p-4 transition hover:border-primary-200 hover:bg-white">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">{job.title}</p>
          <p className="mt-1 text-xs text-slate-500">{job.label}</p>
        </div>
        <span className={`badge ${
          job.status === 'failed' || job.status === 'cancelled'
            ? 'badge-error'
            : job.status === 'completed' || job.status === 'committed'
              ? 'badge-success'
              : job.status === 'validated'
                ? 'badge-info'
                : 'badge-warning'
        }`}>
          {job.status.replace(/_/g, ' ')}
        </span>
      </div>
      <p className="mt-3 text-sm text-slate-600">{job.detail}</p>
      <p className="mt-2 text-xs text-slate-500">
        Updated: {job.updatedAt ? new Date(job.updatedAt).toLocaleString() : 'N/A'}
      </p>
    </Link>
  );
}

function SimpleBarChart({ data }: { data: DashboardSnapshot['activity'] }) {
  const maxMatches = Math.max(...data.map((item) => item.matches), 1);

  return (
    <div className="flex h-64 w-full items-end justify-around gap-2 p-4">
      {data.map((day) => (
        <div key={day.date} className="flex flex-1 flex-col items-center gap-2">
          <div className="relative flex w-full items-end justify-center rounded-t-xl bg-sky-100/70">
            <div
              className="w-full rounded-t-xl bg-primary-500 transition-all"
              style={{ height: `${Math.max(12, (day.matches / maxMatches) * 180)}px` }}
            />
          </div>
          <span className="text-xs text-slate-500">
            {new Date(day.date).toLocaleDateString('en-US', { weekday: 'short' })}
          </span>
        </div>
      ))}
    </div>
  );
}

function UsersIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  );
}

function ActivityIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
    </svg>
  );
}

function MatchIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function QuestionIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function PlusIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  );
}

function TournamentIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
    </svg>
  );
}

function HomeIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10.5L12 3l9 7.5M5.25 9.75V21h13.5V9.75" />
    </svg>
  );
}

function BriefcaseIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2m-9 4h12m-13 9h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v9a2 2 0 002 2z" />
    </svg>
  );
}
