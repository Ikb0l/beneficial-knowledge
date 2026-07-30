import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import SavedViewsToolbar from '../components/SavedViewsToolbar';
import { Button, EmptyState, Input, PageHeader, Section, Select, Spinner } from '../components/ui';
import {
  useAnalyticsSnapshotQuery,
  useTournamentAnalyticsQuery,
} from '../domains/analytics/api';
import type {
  AnalyticsSnapshotContract,
  TournamentAnalyticsContract,
} from '../domains/analytics/contracts';
import { useCategories } from '../hooks/useCategories';

type AnalyticsTab = 'overview' | 'engagement' | 'questions' | 'tournaments' | 'retention';

const ANALYTICS_TABS: AnalyticsTab[] = [
  'overview',
  'engagement',
  'questions',
  'tournaments',
  'retention',
];

const ENGAGEMENT_WINDOWS = [14, 30, 60, 90] as const;
const QUESTION_LIMITS = [20, 50, 100] as const;
const QUESTION_SORT_OPTIONS = [
  { value: 'accuracy', label: 'Lowest Accuracy' },
  { value: 'time', label: 'Slowest Answers' },
  { value: 'shown', label: 'Most Shown' },
] as const;
const EMPTY_ENGAGEMENT: AnalyticsSnapshotContract['engagement'] = [];
const EMPTY_QUESTION_ANALYTICS: AnalyticsSnapshotContract['questionAnalytics'] = [];
const EMPTY_RETENTION_COHORTS: AnalyticsSnapshotContract['retentionCohorts'] = [];
const EMPTY_QUESTION_STATS: AnalyticsSnapshotContract['questionStats'] = {};

function parsePositiveInt(value: string | null, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function formatDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString();
}

function round(value: number, digits = 1): string {
  return value.toFixed(digits).replace(/\.0$/, '');
}

export default function AnalyticsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { categories } = useCategories();

  const activeTab = (searchParams.get('tab') as AnalyticsTab) || 'overview';
  const engagementDays = parsePositiveInt(searchParams.get('days'), 30);
  const questionLimit = parsePositiveInt(searchParams.get('limit'), 20);
  const questionSortBy = searchParams.get('sort') || 'accuracy';
  const questionCategory = searchParams.get('category') || '';
  const questionDifficulty = searchParams.get('difficulty') || '';
  const questionSearch = searchParams.get('q') || '';

  const analyticsQuery = useAnalyticsSnapshotQuery({
    engagementDays,
    questionLimit,
    questionSortBy: questionSortBy === 'time' || questionSortBy === 'shown' ? questionSortBy : 'accuracy',
    questionCategory: questionCategory || undefined,
    questionDifficulty: questionDifficulty || undefined,
  });
  const tournamentAnalyticsQuery = useTournamentAnalyticsQuery();

  const partialError = analyticsQuery.data?.warnings?.length
    ? `Failed to load: ${analyticsQuery.data.warnings.join(', ')}`
    : null;

  const stats = analyticsQuery.data?.stats || null;
  const engagement = analyticsQuery.data?.engagement || EMPTY_ENGAGEMENT;
  const questionAnalytics = analyticsQuery.data?.questionAnalytics || EMPTY_QUESTION_ANALYTICS;
  const questionStats = analyticsQuery.data?.questionStats || EMPTY_QUESTION_STATS;
  const retentionCohorts = analyticsQuery.data?.retentionCohorts || EMPTY_RETENTION_COHORTS;

  const filteredQuestionAnalytics = useMemo(() => {
    const needle = questionSearch.trim().toLowerCase();
    return questionAnalytics.filter((item) => {
      if (!needle) return true;
      return (
        item.questionText.toLowerCase().includes(needle) ||
        item.category.toLowerCase().includes(needle) ||
        item.difficulty.toLowerCase().includes(needle)
      );
    });
  }, [questionAnalytics, questionSearch]);

  const questionStatsRows = useMemo(() => {
    const rows = Object.entries(questionStats).map(([category, statsForCategory]) => ({
      category,
      ...statsForCategory,
    }));
    const needle = questionSearch.trim().toLowerCase();
    return rows
      .filter((row) => {
        if (questionCategory && row.category !== questionCategory) return false;
        if (!needle) return true;
        return row.category.toLowerCase().includes(needle);
      })
      .sort((a, b) => b.total - a.total || a.category.localeCompare(b.category));
  }, [questionCategory, questionSearch, questionStats]);

  const overviewInsights = useMemo(() => {
    const peakDay = engagement.reduce<(typeof engagement)[number] | null>(
      (best, row) => (!best || row.activeUsers > best.activeUsers ? row : best),
      null,
    );
    const totalMatches = engagement.reduce((sum, row) => sum + row.totalMatches, 0);
    const totalSessions = engagement.reduce((sum, row) => sum + row.totalSessions, 0);
    const avgSessionSeconds = engagement.length
      ? engagement.reduce((sum, row) => sum + row.avgSessionSeconds, 0) / engagement.length
      : 0;
    const weakestQuestion = filteredQuestionAnalytics.reduce<(typeof filteredQuestionAnalytics)[number] | null>(
      (best, row) => (!best || row.accuracyPct < best.accuracyPct ? row : best),
      null,
    );
    const strongestRetention = retentionCohorts.reduce<(typeof retentionCohorts)[number] | null>(
      (best, row) => (!best || row.day7Pct > best.day7Pct ? row : best),
      null,
    );

    return {
      peakDay,
      avgMatchesPerDay: engagement.length ? totalMatches / engagement.length : 0,
      avgSessionsPerDay: engagement.length ? totalSessions / engagement.length : 0,
      avgSessionSeconds,
      weakestQuestion,
      strongestRetention,
    };
  }, [engagement, filteredQuestionAnalytics, retentionCohorts]);

  function updateSearchParams(updates: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(updates)) {
      if (!value) next.delete(key);
      else next.set(key, value);
    }
    setSearchParams(next);
  }

  if (analyticsQuery.isLoading && !analyticsQuery.data) {
    return (
      <div className="page-shell">
        <div className="flex items-center justify-center py-16">
          <Spinner />
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell space-y-6">
      <PageHeader
        title="Analytics"
        subtitle="Operational reporting with drill-down filters for engagement, question health, tournaments, and retention."
        actions={(
          <Button
            variant="secondary"
            onClick={() => void Promise.all([analyticsQuery.refetch(), tournamentAnalyticsQuery.refetch()])}
          >
            {analyticsQuery.isFetching || tournamentAnalyticsQuery.isFetching ? 'Refreshing...' : 'Refresh'}
          </Button>
        )}
      />

      <SavedViewsToolbar
        storageKey="analytics-page"
        searchParams={searchParams}
        onApply={(next) => setSearchParams(next)}
      />

      {partialError && (
        <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
          {partialError}
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-b border-slate-200">
        {ANALYTICS_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => updateSearchParams({ tab })}
            className={`rounded-t-xl px-4 py-3 text-sm font-medium capitalize transition ${
              activeTab === tab
                ? 'border-b-2 border-primary-600 text-primary-700'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <OverviewTab
          stats={stats}
          insights={overviewInsights}
          retentionCohorts={retentionCohorts}
          tournamentAnalytics={tournamentAnalyticsQuery.data || null}
        />
      )}

      {activeTab === 'engagement' && (
        <EngagementTab
          engagement={engagement}
          days={engagementDays}
          onDaysChange={(value) => updateSearchParams({ days: String(value) })}
        />
      )}

      {activeTab === 'questions' && (
        <QuestionsTab
          categories={categories.map((item) => ({ key: item.categoryKey, name: item.name }))}
          questionAnalytics={filteredQuestionAnalytics}
          questionStatsRows={questionStatsRows}
          questionLimit={questionLimit}
          questionSortBy={questionSortBy}
          questionCategory={questionCategory}
          questionDifficulty={questionDifficulty}
          questionSearch={questionSearch}
          onFilterChange={(updates) => updateSearchParams(updates)}
        />
      )}

      {activeTab === 'tournaments' && (
        <TournamentAnalyticsSection
          isLoading={tournamentAnalyticsQuery.isLoading && !tournamentAnalyticsQuery.data}
          data={tournamentAnalyticsQuery.data || null}
        />
      )}

      {activeTab === 'retention' && (
        <RetentionTab retentionCohorts={retentionCohorts} />
      )}
    </div>
  );
}

function OverviewTab({
  stats,
  insights,
  retentionCohorts,
  tournamentAnalytics,
}: {
  stats: AnalyticsSnapshotContract['stats'];
  insights: {
    peakDay: AnalyticsSnapshotContract['engagement'][number] | null;
    avgMatchesPerDay: number;
    avgSessionsPerDay: number;
    avgSessionSeconds: number;
    weakestQuestion: AnalyticsSnapshotContract['questionAnalytics'][number] | null;
    strongestRetention: AnalyticsSnapshotContract['retentionCohorts'][number] | null;
  };
  retentionCohorts: AnalyticsSnapshotContract['retentionCohorts'];
  tournamentAnalytics: TournamentAnalyticsContract | null;
}) {
  if (!stats) {
    return <EmptyState title="No analytics data" subtitle="Dashboard stats are not available yet." />;
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard title="Daily Active Users" value={stats.dau.toLocaleString()} subtitle="Today" color="blue" />
        <MetricCard title="Weekly Active Users" value={stats.wau.toLocaleString()} subtitle="Last 7 days" color="green" />
        <MetricCard title="Monthly Active Users" value={stats.mau.toLocaleString()} subtitle="Last 30 days" color="purple" />
        <MetricCard title="Total Users" value={stats.totalUsers.toLocaleString()} subtitle="All time" color="slate" />
        <MetricCard title="Matches Today" value={stats.matchesToday.toLocaleString()} color="yellow" />
        <MetricCard title="Active Tournaments" value={stats.activeTournaments.toString()} color="pink" />
        <MetricCard title="Total Donations" value={`$${(stats.totalDonationsCents / 100).toFixed(2)}`} color="green" />
        <MetricCard
          title="Tournament Completion"
          value={`${tournamentAnalytics?.completionRate || 0}%`}
          subtitle="Completed vs cancelled"
          color="blue"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Section title="Engagement Signals" subtitle="Quick operating readout from recent activity.">
          <InsightRow
            label="Peak active day"
            value={
              insights.peakDay
                ? `${insights.peakDay.activeUsers.toLocaleString()} on ${formatDate(insights.peakDay.date)}`
                : 'No data'
            }
          />
          <InsightRow label="Average matches / day" value={round(insights.avgMatchesPerDay)} />
          <InsightRow label="Average sessions / day" value={round(insights.avgSessionsPerDay)} />
          <InsightRow label="Average session length" value={`${round(insights.avgSessionSeconds / 60)} min`} />
        </Section>

        <Section title="Content Health" subtitle="Spot difficult or brittle content without changing tabs.">
          <InsightRow
            label="Weakest question"
            value={
              insights.weakestQuestion
                ? `${insights.weakestQuestion.accuracyPct}% in ${insights.weakestQuestion.category}`
                : 'No data'
            }
          />
          <InsightRow
            label="Retention leader"
            value={
              insights.strongestRetention
                ? `${insights.strongestRetention.day7Pct}% day 7 for ${insights.strongestRetention.cohortDate}`
                : 'No data'
            }
          />
          <InsightRow
            label="Tracked cohorts"
            value={retentionCohorts.length > 0 ? retentionCohorts.length.toString() : '0'}
          />
        </Section>

        <Section title="Tournament Health" subtitle="High-level participation and lifecycle shape.">
          <InsightRow label="Unique participants" value={(tournamentAnalytics?.uniqueParticipants || 0).toLocaleString()} />
          <InsightRow label="Total participations" value={(tournamentAnalytics?.totalParticipations || 0).toLocaleString()} />
          <InsightRow label="Avg participants / tournament" value={(tournamentAnalytics?.avgParticipantsPerTournament || 0).toString()} />
          <InsightRow label="Active tournaments" value={stats.activeTournaments.toString()} />
        </Section>
      </div>
    </div>
  );
}

function EngagementTab({
  engagement,
  days,
  onDaysChange,
}: {
  engagement: AnalyticsSnapshotContract['engagement'];
  days: number;
  onDaysChange: (days: number) => void;
}) {
  const maxUsers = Math.max(...engagement.map((row) => row.activeUsers), 1);
  const tableRows = engagement.slice(-Math.min(14, engagement.length)).reverse();

  return (
    <div className="space-y-6">
      <Section
        title="User Engagement"
        subtitle="Compare activity, match volume, and session depth over time."
        actions={(
          <div className="flex flex-wrap gap-2">
            {ENGAGEMENT_WINDOWS.map((windowSize) => (
              <Button
                key={windowSize}
                size="sm"
                variant={windowSize === days ? 'primary' : 'secondary'}
                onClick={() => onDaysChange(windowSize)}
              >
                {windowSize}d
              </Button>
            ))}
          </div>
        )}
      >
        {engagement.length === 0 ? (
          <EmptyState title="No engagement data" subtitle="The selected window has no daily activity rows." />
        ) : (
          <>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex h-56 items-end gap-1">
                {engagement.map((day) => (
                  <div
                    key={day.date}
                    className="group relative flex-1 rounded-t bg-primary-500 transition hover:bg-primary-600"
                    style={{ height: `${Math.max(6, (day.activeUsers / maxUsers) * 100)}%` }}
                  >
                    <div className="absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 rounded bg-slate-900 px-2 py-1 text-xs text-white shadow group-hover:block">
                      {day.activeUsers} users on {formatDate(day.date)}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex justify-between text-xs text-slate-500">
                <span>{engagement[0] ? formatDate(engagement[0].date) : '-'}</span>
                <span>{engagement[engagement.length - 1] ? formatDate(engagement[engagement.length - 1].date) : '-'}</span>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Active Users</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Matches</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Sessions</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Avg Session</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {tableRows.map((day) => (
                    <tr key={day.date}>
                      <td className="px-4 py-3 text-sm text-slate-700">{formatDate(day.date)}</td>
                      <td className="px-4 py-3 text-sm font-medium text-slate-900">{day.activeUsers.toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm text-slate-700">{day.totalMatches.toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm text-slate-700">{day.totalSessions.toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm text-slate-700">{round(day.avgSessionSeconds / 60)} min</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Section>
    </div>
  );
}

function QuestionsTab({
  categories,
  questionAnalytics,
  questionStatsRows,
  questionLimit,
  questionSortBy,
  questionCategory,
  questionDifficulty,
  questionSearch,
  onFilterChange,
}: {
  categories: Array<{ key: string; name: string }>;
  questionAnalytics: AnalyticsSnapshotContract['questionAnalytics'];
  questionStatsRows: Array<{
    category: string;
    total: number;
    easy: number;
    medium: number;
    hard: number;
  }>;
  questionLimit: number;
  questionSortBy: string;
  questionCategory: string;
  questionDifficulty: string;
  questionSearch: string;
  onFilterChange: (updates: Record<string, string | null>) => void;
}) {
  return (
    <div className="space-y-6">
      <Section title="Question Health" subtitle="Filter coverage and performance issues by category, difficulty, and investigation lens.">
        <div className="grid gap-3 md:grid-cols-5">
          <Input
            placeholder="Search question or category"
            value={questionSearch}
            onChange={(event) => onFilterChange({ q: event.target.value || null })}
          />
          <Select
            value={questionCategory}
            onChange={(event) => onFilterChange({ category: event.target.value || null })}
          >
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category.key} value={category.key}>
                {category.name}
              </option>
            ))}
          </Select>
          <Select
            value={questionDifficulty}
            onChange={(event) => onFilterChange({ difficulty: event.target.value || null })}
          >
            <option value="">All difficulties</option>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </Select>
          <Select
            value={questionSortBy}
            onChange={(event) => onFilterChange({ sort: event.target.value || null })}
          >
            {QUESTION_SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <Select
            value={String(questionLimit)}
            onChange={(event) => onFilterChange({ limit: event.target.value || null })}
          >
            {QUESTION_LIMITS.map((limit) => (
              <option key={limit} value={limit}>
                Top {limit}
              </option>
            ))}
          </Select>
        </div>
      </Section>

      <Section title="Coverage by Category" subtitle="Question counts by difficulty so you can spot thin categories.">
        {questionStatsRows.length === 0 ? (
          <EmptyState title="No category coverage" subtitle="No question coverage rows match the current filters." />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Category</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Total</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Easy</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Medium</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Hard</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {questionStatsRows.map((row) => (
                  <tr key={row.category}>
                    <td className="px-4 py-3 text-sm font-medium capitalize text-slate-900">{row.category.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{row.total}</td>
                    <td className="px-4 py-3 text-sm text-green-700">{row.easy}</td>
                    <td className="px-4 py-3 text-sm text-yellow-700">{row.medium}</td>
                    <td className="px-4 py-3 text-sm text-rose-700">{row.hard}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Question Performance" subtitle="Drill into the selected slice of weakest or hottest questions.">
        {questionAnalytics.length === 0 ? (
          <EmptyState title="No question analytics" subtitle="No questions matched the current query." />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Question</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Category</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Difficulty</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Accuracy</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Times Shown</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Avg Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {questionAnalytics.map((question) => (
                  <tr key={question.id}>
                    <td className="max-w-md px-4 py-3 text-sm text-slate-900">{question.questionText}</td>
                    <td className="px-4 py-3 text-sm capitalize text-slate-700">{question.category}</td>
                    <td className="px-4 py-3 text-sm capitalize text-slate-700">{question.difficulty}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-20 overflow-hidden rounded-full bg-slate-200">
                          <div
                            className={`h-full rounded-full ${
                              question.accuracyPct < 30
                                ? 'bg-rose-500'
                                : question.accuracyPct < 60
                                  ? 'bg-yellow-500'
                                  : 'bg-green-500'
                            }`}
                            style={{ width: `${Math.max(2, question.accuracyPct)}%` }}
                          />
                        </div>
                        <span>{question.accuracyPct}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">{question.timesShown}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{round(question.avgAnswerTimeMs / 1000)}s</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}

function TournamentAnalyticsSection({
  isLoading,
  data,
}: {
  isLoading: boolean;
  data: TournamentAnalyticsContract | null;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner />
      </div>
    );
  }

  if (!data) {
    return <EmptyState title="No tournament analytics" subtitle="Tournament reporting is not available right now." />;
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard title="Unique Participants" value={data.uniqueParticipants.toString()} color="blue" />
        <MetricCard title="Total Participations" value={data.totalParticipations.toString()} color="green" />
        <MetricCard title="Avg Participants" value={data.avgParticipantsPerTournament.toString()} subtitle="Per tournament" color="purple" />
        <MetricCard title="Completion Rate" value={`${data.completionRate}%`} color="yellow" />
      </div>

      <Section title="Tournaments by Status" subtitle="Lifecycle mix across the tournament catalog.">
        <div className="grid gap-4 md:grid-cols-5">
          {Object.entries(data.byStatus || {}).map(([status, count]) => (
            <div key={status} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center">
              <p className="text-2xl font-bold text-slate-900">{count}</p>
              <p className="mt-1 text-sm capitalize text-slate-500">{status.replace(/_/g, ' ')}</p>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

function RetentionTab({
  retentionCohorts,
}: {
  retentionCohorts: AnalyticsSnapshotContract['retentionCohorts'];
}) {
  const avgDay1 = retentionCohorts.length
    ? retentionCohorts.reduce((sum, row) => sum + row.day1Pct, 0) / retentionCohorts.length
    : 0;
  const avgDay7 = retentionCohorts.length
    ? retentionCohorts.reduce((sum, row) => sum + row.day7Pct, 0) / retentionCohorts.length
    : 0;
  const avgDay30 = retentionCohorts.length
    ? retentionCohorts.reduce((sum, row) => sum + row.day30Pct, 0) / retentionCohorts.length
    : 0;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard title="Average Day 1" value={`${round(avgDay1)}%`} color="blue" />
        <MetricCard title="Average Day 7" value={`${round(avgDay7)}%`} color="green" />
        <MetricCard title="Average Day 30" value={`${round(avgDay30)}%`} color="purple" />
      </div>

      <Section title="Retention Cohorts" subtitle="Recent cohort performance across key checkpoints.">
        {retentionCohorts.length === 0 ? (
          <EmptyState title="No retention data" subtitle="Retention cohorts have not been populated yet." />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Cohort</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Size</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Day 1</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Day 7</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Day 30</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {retentionCohorts.map((cohort) => (
                  <tr key={cohort.cohortDate}>
                    <td className="px-4 py-3 text-sm text-slate-700">{cohort.cohortDate}</td>
                    <td className="px-4 py-3 text-sm font-medium text-slate-900">{cohort.cohortSize}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{cohort.day1Pct}%</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{cohort.day7Pct}%</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{cohort.day30Pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}

function MetricCard({
  title,
  value,
  subtitle,
  color,
}: {
  title: string;
  value: string;
  subtitle?: string;
  color: 'blue' | 'green' | 'purple' | 'slate' | 'yellow' | 'pink';
}) {
  const colorClasses = {
    blue: 'border-blue-200 bg-blue-50',
    green: 'border-green-200 bg-green-50',
    purple: 'border-purple-200 bg-purple-50',
    slate: 'border-slate-200 bg-slate-50',
    yellow: 'border-yellow-200 bg-yellow-50',
    pink: 'border-pink-200 bg-pink-50',
  };

  return (
    <div className={`rounded-2xl border p-4 ${colorClasses[color]}`}>
      <p className="text-sm text-slate-600">{title}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
      {subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}
    </div>
  );
}

function InsightRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 py-2 last:border-b-0 last:pb-0">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-right text-sm font-medium text-slate-900">{value}</span>
    </div>
  );
}
