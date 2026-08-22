import { useEffect, useMemo, useState } from 'react';
import { getErrorMessage } from '../lib/errors';
import { confirmAction } from '../lib/confirm';
import { useRBAC } from '../hooks/useRBAC';
import { useGameSettingsQuery, useUpdateGameSettingsMutation } from '../domains/gameSettings/api';
import {
  fetchRankedResetStatus,
  useContinueRankedResetMutation,
  useStartRankedResetMutation,
} from '../domains/jobs/api';
import { Button, PageHeader } from '../components/ui';

interface TournamentBotDifficultyProfile {
  baseAccuracy: number;
  minAccuracy: number;
  maxAccuracy: number;
  roundAccuracyBonus: number;
  minDelayMs: number;
  maxDelayMs: number;
  roundDelayReductionMs: number;
  nearMissChance: number;
}

interface TournamentBotPolicy {
  enabled: boolean;
  fillOnStart: boolean;
  replaceMissingBeforeMatch: boolean;
  botMmr: number;
  skipMmrBonusWhenBotInfluenced: boolean;
  difficulty: TournamentBotDifficultyProfile;
}

type RankedFlowPreset = 'classic' | 'balanced' | 'turbo';
type PracticeFlowPreset = 'classic' | 'fast' | 'turbo';
	type TournamentFlowPreset = 'classic' | 'balanced' | 'fast' | 'turbo';

interface FlowPacingProfiles {
  rankedPreset: RankedFlowPreset;
  tournamentPreset: TournamentFlowPreset;
  practicePreset: PracticeFlowPreset;
}

interface MatchPacingProfile {
  preset: string;
  countdownSeconds: number;
  revealDelayMs: number;
  revealSuspenseMs: number;
  revealRevealMs: number;
  revealEffectsMs: number;
  revealScoresMs: number;
  roundPulseEnabled: boolean;
  roundPulseStartDelayMs: number;
  roundPulseCompleteDelayMs: number;
}

interface FlowPacingResolved {
  ranked: MatchPacingProfile;
  practice: MatchPacingProfile;
  tournament: MatchPacingProfile;
}

interface GameSettingsResponse {
  questionsPerMatch?: number;
  questionsPerMatchNormal?: number;
  questionsPerMatchVocabulary?: number;
  maxQuestionsPerMatchNormal?: number;
  maxQuestionsPerMatchVocabulary?: number;
  timePerQuestion?: number;
  flowPacingProfiles?: {
    tournamentPreset: string;
    rankedPreset: string;
    practicePreset: string;
  };
  flowPacingResolved?: FlowPacingResolved;
  communityAlertsEnabled?: boolean;
  communityOnlineThreshold?: number;
  communityOnlineCooldownMinutes?: number;
  communityDispatchBatchSize?: number;
  telegramDispatchPerRun?: number;
  telegramMiniappDeeplinkBase?: string;
  tournamentBotPolicy?: TournamentBotPolicy;
  tournamentBotEnabled?: boolean;
  tournamentBotFillOnStart?: boolean;
  tournamentBotReplaceMissingBeforeMatch?: boolean;
  tournamentBotMmr?: number;
  tournamentBotSkipMmrBonusWhenBotInfluenced?: boolean;
  tournamentBotBaseAccuracy?: number;
  tournamentBotMinAccuracy?: number;
  tournamentBotMaxAccuracy?: number;
  tournamentBotRoundAccuracyBonus?: number;
  tournamentBotMinDelayMs?: number;
  tournamentBotMaxDelayMs?: number;
  tournamentBotRoundDelayReductionMs?: number;
  tournamentBotNearMissChance?: number;
}

interface GameSettings {
  questionsPerMatchNormal: number;
  questionsPerMatchVocabulary: number;
  maxQuestionsPerMatchNormal: number;
  maxQuestionsPerMatchVocabulary: number;
  timePerQuestion: number;
  flowPacingProfiles: FlowPacingProfiles;
  flowPacingResolved: FlowPacingResolved | null;
  communityAlertsEnabled: boolean;
  communityOnlineThreshold: number;
  communityOnlineCooldownMinutes: number;
  communityDispatchBatchSize: number;
  telegramDispatchPerRun: number;
  telegramMiniappDeeplinkBase: string;
  tournamentBotPolicy: TournamentBotPolicy;
}

interface RankedResetProgress {
  playersProcessed: number;
  playersTotal: number;
  categoryBoardsProcessed: number;
  categoryBoardsTotal: number;
  categoryRecordsDeleted: number;
  matchHistoryRowsDeleted: number;
}

interface RankedResetTotals {
  players: number;
  categoryLeaderboards: number;
}

type RankedResetStatusValue = string;

interface RankedResetJobStatus {
  jobId: string;
  status: RankedResetStatusValue;
  stage: string;
  reason: string;
  createdAt: number | null;
  updatedAt: number | null;
  completedAt: number | null;
  totals: RankedResetTotals;
  progress: RankedResetProgress;
  error: string | null;
}

const RANKED_RESET_CONFIRM_TEXT = 'RESET RANKED DATA';

const DEFAULT_BOT_POLICY: TournamentBotPolicy = {
  enabled: true,
  fillOnStart: true,
  replaceMissingBeforeMatch: true,
  botMmr: 1850,
  skipMmrBonusWhenBotInfluenced: true,
  difficulty: {
    baseAccuracy: 0.9,
    minAccuracy: 0.72,
    maxAccuracy: 0.985,
    roundAccuracyBonus: 0.012,
    minDelayMs: 900,
    maxDelayMs: 2800,
    roundDelayReductionMs: 110,
    nearMissChance: 0.72,
  },
};

const DEFAULT_FLOW_PACING_PROFILES: FlowPacingProfiles = {
  rankedPreset: 'balanced',
  tournamentPreset: 'classic',
  practicePreset: 'turbo',
};
const SETTINGS_SECTION_LINKS = [
  { id: 'settings-match', label: 'Match' },
  { id: 'settings-flow', label: 'Flow' },
  { id: 'settings-alerts', label: 'Alerts' },
  { id: 'settings-bots', label: 'Bot Policy' },
  { id: 'settings-bot-difficulty', label: 'Bot Difficulty' },
  { id: 'settings-danger', label: 'Danger Zone' },
] as const;

function formatRankedResetStage(stage: string): string {
  if (stage === 'reset_players') return 'Reset player MMR';
  if (stage === 'wipe_ranked_history') return 'Clear match history';
  if (stage === 'clear_category_leaderboards') return 'Clear category leaderboards';
  if (stage === 'complete') return 'Completed';
  return stage || 'Unknown';
}

function formatRankedResetStatus(status: RankedResetStatusValue): string {
  if (status === 'in_progress') return 'In Progress';
  if (status === 'completed') return 'Completed';
  if (status === 'failed') return 'Failed';
  if (status === 'pending') return 'Pending';
  return 'Unknown';
}

function normalizeFlowPacingProfiles(input: unknown): FlowPacingProfiles {
  const source = input && typeof input === 'object' && !Array.isArray(input)
    ? (input as Partial<FlowPacingProfiles>)
    : {};
  const rankedRaw = String(source.rankedPreset || '').trim().toLowerCase();
  const practiceRaw = String(source.practicePreset || '').trim().toLowerCase();
  const tournamentRaw = String(source.tournamentPreset || '').trim().toLowerCase();
  return {
    rankedPreset:
      rankedRaw === 'classic' || rankedRaw === 'balanced' || rankedRaw === 'turbo'
        ? (rankedRaw as RankedFlowPreset)
        : DEFAULT_FLOW_PACING_PROFILES.rankedPreset,
    practicePreset:
      practiceRaw === 'classic' || practiceRaw === 'fast' || practiceRaw === 'turbo'
        ? (practiceRaw as PracticeFlowPreset)
        : DEFAULT_FLOW_PACING_PROFILES.practicePreset,
    tournamentPreset:
      tournamentRaw === 'classic' || tournamentRaw === 'balanced' || tournamentRaw === 'fast' || tournamentRaw === 'turbo'
        ? (tournamentRaw as TournamentFlowPreset)
        : DEFAULT_FLOW_PACING_PROFILES.tournamentPreset,
  };
}

function normalizeBotPolicy(input: GameSettingsResponse): TournamentBotPolicy {
  const policy = input.tournamentBotPolicy;
  if (policy && typeof policy === 'object') {
    return {
      ...DEFAULT_BOT_POLICY,
      ...policy,
      difficulty: {
        ...DEFAULT_BOT_POLICY.difficulty,
        ...(policy.difficulty || {}),
      },
    };
  }

  return {
    enabled: input.tournamentBotEnabled ?? DEFAULT_BOT_POLICY.enabled,
    fillOnStart: input.tournamentBotFillOnStart ?? DEFAULT_BOT_POLICY.fillOnStart,
    replaceMissingBeforeMatch:
      input.tournamentBotReplaceMissingBeforeMatch ?? DEFAULT_BOT_POLICY.replaceMissingBeforeMatch,
    botMmr: input.tournamentBotMmr ?? DEFAULT_BOT_POLICY.botMmr,
    skipMmrBonusWhenBotInfluenced:
      input.tournamentBotSkipMmrBonusWhenBotInfluenced ??
      DEFAULT_BOT_POLICY.skipMmrBonusWhenBotInfluenced,
    difficulty: {
      baseAccuracy: input.tournamentBotBaseAccuracy ?? DEFAULT_BOT_POLICY.difficulty.baseAccuracy,
      minAccuracy: input.tournamentBotMinAccuracy ?? DEFAULT_BOT_POLICY.difficulty.minAccuracy,
      maxAccuracy: input.tournamentBotMaxAccuracy ?? DEFAULT_BOT_POLICY.difficulty.maxAccuracy,
      roundAccuracyBonus:
        input.tournamentBotRoundAccuracyBonus ?? DEFAULT_BOT_POLICY.difficulty.roundAccuracyBonus,
      minDelayMs: input.tournamentBotMinDelayMs ?? DEFAULT_BOT_POLICY.difficulty.minDelayMs,
      maxDelayMs: input.tournamentBotMaxDelayMs ?? DEFAULT_BOT_POLICY.difficulty.maxDelayMs,
      roundDelayReductionMs:
        input.tournamentBotRoundDelayReductionMs ??
        DEFAULT_BOT_POLICY.difficulty.roundDelayReductionMs,
      nearMissChance: input.tournamentBotNearMissChance ?? DEFAULT_BOT_POLICY.difficulty.nearMissChance,
    },
  };
}

function normalizeGameSettingsState(input?: GameSettingsResponse | null): GameSettings {
  const data = input || {};
  const legacyQuestionsPerMatch = data.questionsPerMatch ?? 7;

  return {
    questionsPerMatchNormal: data.questionsPerMatchNormal ?? legacyQuestionsPerMatch,
    questionsPerMatchVocabulary: data.questionsPerMatchVocabulary ?? legacyQuestionsPerMatch,
    maxQuestionsPerMatchNormal: data.maxQuestionsPerMatchNormal ?? 50,
    maxQuestionsPerMatchVocabulary: data.maxQuestionsPerMatchVocabulary ?? 300,
    timePerQuestion: data.timePerQuestion ?? 15,
    flowPacingProfiles: normalizeFlowPacingProfiles(data.flowPacingProfiles),
    flowPacingResolved: data.flowPacingResolved ?? null,
    communityAlertsEnabled: data.communityAlertsEnabled ?? true,
    communityOnlineThreshold: data.communityOnlineThreshold ?? 2,
    communityOnlineCooldownMinutes: data.communityOnlineCooldownMinutes ?? 60,
    communityDispatchBatchSize: data.communityDispatchBatchSize ?? 200,
    telegramDispatchPerRun: data.telegramDispatchPerRun ?? 25,
    telegramMiniappDeeplinkBase: data.telegramMiniappDeeplinkBase ?? '',
    tournamentBotPolicy: normalizeBotPolicy(data),
  };
}

export default function GameSettingsPage() {
  const { canPerform } = useRBAC();
  const gameSettingsQuery = useGameSettingsQuery();
  const updateGameSettingsMutation = useUpdateGameSettingsMutation();
  const startRankedResetMutation = useStartRankedResetMutation();
  const continueRankedResetMutation = useContinueRankedResetMutation();
  const [settings, setSettings] = useState<GameSettings>(() => normalizeGameSettingsState(null));
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [rankedResetReason, setRankedResetReason] = useState('');
  const [rankedResetConfirmText, setRankedResetConfirmText] = useState('');
  const [rankedResetJob, setRankedResetJob] = useState<RankedResetJobStatus | null>(null);
  const [rankedResetMessage, setRankedResetMessage] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  const canResetAllRankedData = canPerform('reset_all_ranked_data');
  const baselineSettings = useMemo(
    () => normalizeGameSettingsState(gameSettingsQuery.data || null),
    [gameSettingsQuery.data],
  );

  useEffect(() => {
    if (!gameSettingsQuery.data) {
      return;
    }
    setSettings(normalizeGameSettingsState(gameSettingsQuery.data));
  }, [gameSettingsQuery.data]);

  useEffect(() => {
    if (!gameSettingsQuery.error) {
      return;
    }
    setMessage({ type: 'error', text: 'Failed to load settings from server.' });
  }, [gameSettingsQuery.error]);

  useEffect(() => {
    if (!canResetAllRankedData) {
      return;
    }
    void loadRankedResetStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canResetAllRankedData]);

  async function loadRankedResetStatus(): Promise<void> {
    try {
      const status = await fetchRankedResetStatus();
      setRankedResetJob(status);
      if (status.status === 'in_progress' && status.jobId && !continueRankedResetMutation.isPending) {
        void continueRankedReset(status.jobId);
      }
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      const normalized = errorMessage.toLowerCase();
      if (normalized.includes('no ranked reset job found')) {
        return;
      }
      setRankedResetMessage({
        type: 'error',
        text: 'Failed to load ranked reset status: ' + errorMessage,
      });
    }
  }

  async function continueRankedReset(jobId: string): Promise<void> {
    if (!jobId) {
      return;
    }

    try {
      const status = await continueRankedResetMutation.mutateAsync(jobId);
      setRankedResetJob(status);
      if (status.status === 'completed') {
        setRankedResetMessage({
          type: 'success',
          text: 'Ranked reset completed successfully.',
        });
        return;
      }

      if (status.status === 'failed') {
        setRankedResetMessage({
          type: 'error',
          text: status.error || 'Ranked reset failed.',
        });
        return;
      }

      setRankedResetMessage({
        type: 'info',
        text: 'Ranked reset is still in progress. Click Continue to keep processing.',
      });
    } catch (error) {
      setRankedResetMessage({
        type: 'error',
        text: 'Failed to continue ranked reset: ' + getErrorMessage(error),
      });
    }
  }

  async function handleStartRankedReset(): Promise<void> {
    if (!canResetAllRankedData) {
      return;
    }

    const reason = rankedResetReason.trim();
    if (reason.length < 10) {
      setRankedResetMessage({ type: 'error', text: 'Reason must be at least 10 characters.' });
      return;
    }
    if (reason.length > 500) {
      setRankedResetMessage({ type: 'error', text: 'Reason must be less than 500 characters.' });
      return;
    }
    if (rankedResetConfirmText.trim() !== RANKED_RESET_CONFIRM_TEXT) {
      setRankedResetMessage({
        type: 'error',
        text: `Type "${RANKED_RESET_CONFIRM_TEXT}" exactly to unlock reset.`,
      });
      return;
    }

    const confirmed = await confirmAction({
      title: 'Reset all ranked data?',
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
      setRankedResetMessage(null);
      const started = await startRankedResetMutation.mutateAsync({
        reason,
        confirmText: rankedResetConfirmText.trim(),
        maintenanceConfirmed: true,
      });
      setRankedResetJob(started);
      setRankedResetConfirmText('');
      setRankedResetMessage({
        type: started.status === 'completed' ? 'success' : 'info',
        text: started.status === 'completed'
          ? 'Ranked reset completed successfully.'
          : 'Ranked reset started. Processing...',
      });
    } catch (error) {
      setRankedResetMessage({
        type: 'error',
        text: 'Failed to start ranked reset: ' + getErrorMessage(error),
      });
    }
  }

  function formatResetTimestamp(value: number | null): string {
    if (!value) {
      return 'n/a';
    }
    try {
      return new Date(value).toLocaleString();
    } catch {
      return String(value);
    }
  }

  async function handleSave() {
    try {
      setMessage(null);

      const policy = settings.tournamentBotPolicy;
      await updateGameSettingsMutation.mutateAsync({
        questionsPerMatch: settings.questionsPerMatchNormal,
        questionsPerMatchNormal: settings.questionsPerMatchNormal,
        questionsPerMatchVocabulary: settings.questionsPerMatchVocabulary,
        maxQuestionsPerMatchNormal: settings.maxQuestionsPerMatchNormal,
        maxQuestionsPerMatchVocabulary: settings.maxQuestionsPerMatchVocabulary,
        timePerQuestion: settings.timePerQuestion,
        flowPacingProfiles: settings.flowPacingProfiles,
        communityAlertsEnabled: settings.communityAlertsEnabled,
        communityOnlineThreshold: settings.communityOnlineThreshold,
        communityOnlineCooldownMinutes: settings.communityOnlineCooldownMinutes,
        communityDispatchBatchSize: settings.communityDispatchBatchSize,
        telegramDispatchPerRun: settings.telegramDispatchPerRun,
        telegramMiniappDeeplinkBase: settings.telegramMiniappDeeplinkBase,
        tournamentBotPolicy: policy,
        // Backward compatibility for older server builds that still expect flat fields.
        tournamentBotEnabled: policy.enabled,
        tournamentBotFillOnStart: policy.fillOnStart,
        tournamentBotReplaceMissingBeforeMatch: policy.replaceMissingBeforeMatch,
        tournamentBotMmr: policy.botMmr,
        tournamentBotSkipMmrBonusWhenBotInfluenced: policy.skipMmrBonusWhenBotInfluenced,
        tournamentBotBaseAccuracy: policy.difficulty.baseAccuracy,
        tournamentBotMinAccuracy: policy.difficulty.minAccuracy,
        tournamentBotMaxAccuracy: policy.difficulty.maxAccuracy,
        tournamentBotRoundAccuracyBonus: policy.difficulty.roundAccuracyBonus,
        tournamentBotMinDelayMs: policy.difficulty.minDelayMs,
        tournamentBotMaxDelayMs: policy.difficulty.maxDelayMs,
        tournamentBotRoundDelayReductionMs: policy.difficulty.roundDelayReductionMs,
        tournamentBotNearMissChance: policy.difficulty.nearMissChance,
      });

      await gameSettingsQuery.refetch();
      setMessage({ type: 'success', text: 'Settings saved successfully!' });
    } catch (error) {
      console.error('Error saving settings:', error);
      setMessage({ type: 'error', text: 'Failed to save settings: ' + getErrorMessage(error) });
    }
  }

  function handleResetChanges() {
    setSettings(baselineSettings);
    setMessage(null);
  }

  function updatePolicy<K extends keyof TournamentBotPolicy>(key: K, value: TournamentBotPolicy[K]) {
    setSettings((prev) => ({
      ...prev,
      tournamentBotPolicy: {
        ...prev.tournamentBotPolicy,
        [key]: value,
      },
    }));
  }

  function updateDifficulty<K extends keyof TournamentBotDifficultyProfile>(
    key: K,
    value: TournamentBotDifficultyProfile[K]
  ) {
    setSettings((prev) => ({
      ...prev,
      tournamentBotPolicy: {
        ...prev.tournamentBotPolicy,
        difficulty: {
          ...prev.tournamentBotPolicy.difficulty,
          [key]: value,
        },
      },
    }));
  }

  if (gameSettingsQuery.isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const policy = settings.tournamentBotPolicy;
  const flowPacing = settings.flowPacingProfiles;
  const flowPacingResolved = settings.flowPacingResolved;
  const hasUnsavedChanges = JSON.stringify(settings) !== JSON.stringify(baselineSettings);
  const isRankedResetBusy = startRankedResetMutation.isPending || continueRankedResetMutation.isPending;
  const rankedResetProgress = rankedResetJob?.progress;
  const rankedResetPlayersTotal = rankedResetProgress?.playersTotal || 0;
  const rankedResetPlayersProcessed = rankedResetProgress?.playersProcessed || 0;
  const rankedResetPlayersPercent = rankedResetPlayersTotal > 0
    ? Math.min(100, Math.round((rankedResetPlayersProcessed / rankedResetPlayersTotal) * 100))
    : 0;
  const rankedResetBoardsTotal = rankedResetProgress?.categoryBoardsTotal || 0;
  const rankedResetBoardsProcessed = rankedResetProgress?.categoryBoardsProcessed || 0;
  const rankedResetBoardsPercent = rankedResetBoardsTotal > 0
    ? Math.min(100, Math.round((rankedResetBoardsProcessed / rankedResetBoardsTotal) * 100))
    : 0;

  return (
    <div className="page-shell">
      <PageHeader
        title="Game Settings"
        subtitle="Global match pacing, live alerts, and tournament bot policy."
        actions={(
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={handleResetChanges} disabled={!hasUnsavedChanges || updateGameSettingsMutation.isPending}>
              Reset Changes
            </Button>
            <Button onClick={handleSave} loading={updateGameSettingsMutation.isPending}>
              Save Settings
            </Button>
          </div>
        )}
      />

      <div className="grid gap-4 md:grid-cols-4">
        <SettingsSummaryCard label="Normal Questions" value={String(settings.questionsPerMatchNormal)} />
        <SettingsSummaryCard label="Vocabulary Questions" value={String(settings.questionsPerMatchVocabulary)} />
        <SettingsSummaryCard label="Alerts" value={settings.communityAlertsEnabled ? 'Enabled' : 'Disabled'} tone={settings.communityAlertsEnabled ? 'default' : 'warning'} />
        <SettingsSummaryCard label="Tournament Bots" value={policy.enabled ? 'Enabled' : 'Disabled'} tone={policy.enabled ? 'default' : 'warning'} />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {SETTINGS_SECTION_LINKS.map((link) => (
              <a
                key={link.id}
                href={`#${link.id}`}
                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-medium text-slate-700 transition hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700"
              >
                {link.label}
              </a>
            ))}
          </div>
          {hasUnsavedChanges && (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-sm font-medium text-amber-800">
              Unsaved changes
            </span>
          )}
        </div>
      </div>

      <div className="w-full max-w-5xl mx-auto bg-white rounded-xl shadow p-6 space-y-8">
        {message && (
          <div
            className={`p-3 rounded-lg ${
              message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
            }`}
          >
            {message.text}
          </div>
        )}

        <section id="settings-match">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Match Settings</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Default Questions (Normal Categories)
              </label>
              <input
                type="number"
                value={settings.questionsPerMatchNormal}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    questionsPerMatchNormal: parseInt(e.target.value, 10) || 7,
                  }))
                }
                min={1}
                max={1000}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Default Questions (Vocabulary Categories)
              </label>
              <input
                type="number"
                value={settings.questionsPerMatchVocabulary}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    questionsPerMatchVocabulary: parseInt(e.target.value, 10) || 7,
                  }))
                }
                min={1}
                max={1000}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Max Questions (Normal Categories)
              </label>
              <input
                type="number"
                value={settings.maxQuestionsPerMatchNormal}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    maxQuestionsPerMatchNormal: parseInt(e.target.value, 10) || 50,
                  }))
                }
                min={1}
                max={1000}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Max Questions (Vocabulary Categories)
              </label>
              <input
                type="number"
                value={settings.maxQuestionsPerMatchVocabulary}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    maxQuestionsPerMatchVocabulary: parseInt(e.target.value, 10) || 300,
                  }))
                }
                min={1}
                max={1000}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Time Per Question (seconds)
              </label>
              <input
                type="number"
                value={settings.timePerQuestion}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    timePerQuestion: parseInt(e.target.value, 10) || 15,
                  }))
                }
                min={5}
                max={200}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
          </div>
        </section>

        <section id="settings-flow">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Flow Speed Presets</h2>
          <p className="text-sm text-slate-600 mb-4">
            Control how quickly rounds and reveals advance for each game mode.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Ranked Flow</label>
              <select
                value={flowPacing.rankedPreset}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    flowPacingProfiles: {
                      ...prev.flowPacingProfiles,
                      rankedPreset: e.target.value as RankedFlowPreset,
                    },
                  }))
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              >
                <option value="classic">Classic</option>
                <option value="balanced">Balanced</option>
                <option value="turbo">Turbo</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Practice Flow</label>
              <select
                value={flowPacing.practicePreset}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    flowPacingProfiles: {
                      ...prev.flowPacingProfiles,
                      practicePreset: e.target.value as PracticeFlowPreset,
                    },
                  }))
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              >
                <option value="classic">Classic</option>
                <option value="fast">Fast</option>
                <option value="turbo">Turbo</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Tournament Flow</label>
              <select
                value={flowPacing.tournamentPreset}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    flowPacingProfiles: {
                      ...prev.flowPacingProfiles,
                      tournamentPreset: e.target.value as TournamentFlowPreset,
                    },
                  }))
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              >
                <option value="classic">Classic</option>
                <option value="balanced">Balanced</option>
                <option value="fast">Fast</option>
                <option value="turbo">Turbo</option>
              </select>
            </div>
          </div>

          {flowPacingResolved && (
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
              <p>
                Ranked countdown/reveal: {flowPacingResolved.ranked.countdownSeconds}s / {flowPacingResolved.ranked.revealDelayMs}ms
              </p>
              <p>
                Practice countdown/reveal: {flowPacingResolved.practice.countdownSeconds}s / {flowPacingResolved.practice.revealDelayMs}ms
              </p>
              <p>
                Tournament countdown/reveal: {flowPacingResolved.tournament.countdownSeconds}s / {flowPacingResolved.tournament.revealDelayMs}ms
              </p>
            </div>
          )}
        </section>

        <section id="settings-alerts">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Community Alerts</h2>
          <div className="space-y-4">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={settings.communityAlertsEnabled}
                onChange={(e) => setSettings((prev) => ({ ...prev, communityAlertsEnabled: e.target.checked }))}
                className="rounded border-slate-300"
              />
              Enable community broadcast alerts
            </label>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Online Threshold ({'>'})
                </label>
                <input
                  type="number"
                  value={settings.communityOnlineThreshold}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      communityOnlineThreshold: Math.max(1, parseInt(e.target.value, 10) || 1),
                    }))
                  }
                  min={1}
                  max={1000000}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Cooldown (minutes)
                </label>
                <input
                  type="number"
                  value={settings.communityOnlineCooldownMinutes}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      communityOnlineCooldownMinutes: Math.max(1, parseInt(e.target.value, 10) || 1),
                    }))
                  }
                  min={1}
                  max={1440}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Dispatch Batch Size
                </label>
                <input
                  type="number"
                  value={settings.communityDispatchBatchSize}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      communityDispatchBatchSize: Math.max(10, parseInt(e.target.value, 10) || 10),
                    }))
                  }
                  min={10}
                  max={2000}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Telegram Dispatch Per Run
                </label>
                <input
                  type="number"
                  value={settings.telegramDispatchPerRun}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      telegramDispatchPerRun: Math.max(0, parseInt(e.target.value, 10) || 0),
                    }))
                  }
                  min={0}
                  max={500}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Telegram Mini App Deeplink Base
              </label>
              <input
                type="text"
                value={settings.telegramMiniappDeeplinkBase}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    telegramMiniappDeeplinkBase: e.target.value,
                  }))
                }
                placeholder="https://t.me/your_bot?startapp={payload}"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
              <p className="mt-1 text-xs text-slate-500">
                Use <code>{'{payload}'}</code> placeholder, e.g. <code>https://t.me/your_bot?startapp={'{payload}'}</code>.
              </p>
            </div>
          </div>
        </section>

        <section id="settings-bots">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Tournament Bot Policy</h2>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={policy.enabled}
                  onChange={(e) => updatePolicy('enabled', e.target.checked)}
                  className="rounded border-slate-300"
                />
                Enable tournament bots
              </label>

              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={policy.fillOnStart}
                  onChange={(e) => updatePolicy('fillOnStart', e.target.checked)}
                  className="rounded border-slate-300"
                />
                Fill empty bracket slots on start
              </label>

              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={policy.replaceMissingBeforeMatch}
                  onChange={(e) => updatePolicy('replaceMissingBeforeMatch', e.target.checked)}
                  className="rounded border-slate-300"
                />
                Replace missing/left players before match
              </label>

              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={policy.skipMmrBonusWhenBotInfluenced}
                  onChange={(e) => updatePolicy('skipMmrBonusWhenBotInfluenced', e.target.checked)}
                  className="rounded border-slate-300"
                />
                Skip tournament MMR bonus when bot-influenced
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Bot MMR</label>
                <input
                  type="number"
                  value={policy.botMmr}
                  onChange={(e) => updatePolicy('botMmr', Number(e.target.value) || 0)}
                  min={0}
                  max={10000}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>
          </div>
        </section>

        <section id="settings-bot-difficulty">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Tournament Bot Difficulty</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Base Accuracy</label>
              <input
                type="number"
                step="0.001"
                value={policy.difficulty.baseAccuracy}
                onChange={(e) => updateDifficulty('baseAccuracy', Number(e.target.value) || 0)}
                min={0}
                max={1}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Min Accuracy</label>
              <input
                type="number"
                step="0.001"
                value={policy.difficulty.minAccuracy}
                onChange={(e) => updateDifficulty('minAccuracy', Number(e.target.value) || 0)}
                min={0}
                max={1}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Max Accuracy</label>
              <input
                type="number"
                step="0.001"
                value={policy.difficulty.maxAccuracy}
                onChange={(e) => updateDifficulty('maxAccuracy', Number(e.target.value) || 0)}
                min={0}
                max={1}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Round Accuracy Bonus</label>
              <input
                type="number"
                step="0.001"
                value={policy.difficulty.roundAccuracyBonus}
                onChange={(e) => updateDifficulty('roundAccuracyBonus', Number(e.target.value) || 0)}
                min={0}
                max={1}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Min Delay (ms)</label>
              <input
                type="number"
                value={policy.difficulty.minDelayMs}
                onChange={(e) => updateDifficulty('minDelayMs', Number(e.target.value) || 0)}
                min={100}
                max={60000}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Max Delay (ms)</label>
              <input
                type="number"
                value={policy.difficulty.maxDelayMs}
                onChange={(e) => updateDifficulty('maxDelayMs', Number(e.target.value) || 0)}
                min={100}
                max={60000}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Round Delay Reduction (ms)
              </label>
              <input
                type="number"
                value={policy.difficulty.roundDelayReductionMs}
                onChange={(e) => updateDifficulty('roundDelayReductionMs', Number(e.target.value) || 0)}
                min={0}
                max={10000}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Near-Miss Chance</label>
              <input
                type="number"
                step="0.01"
                value={policy.difficulty.nearMissChance}
                onChange={(e) => updateDifficulty('nearMissChance', Number(e.target.value) || 0)}
                min={0}
                max={1}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>
        </section>

        <section id="settings-danger" className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-red-900">Danger Zone: Full Ranked Reset</h2>
            <p className="text-sm text-red-700 mt-1">
              Resets all player ranked MMR to defaults, clears ranked match history, and wipes category ranked leaderboards.
            </p>
          </div>

          {rankedResetMessage && (
            <div
              className={`p-3 rounded-lg text-sm ${
                rankedResetMessage.type === 'success'
                  ? 'bg-green-100 text-green-800'
                  : rankedResetMessage.type === 'info'
                    ? 'bg-blue-100 text-blue-800'
                    : 'bg-red-100 text-red-800'
              }`}
            >
              {rankedResetMessage.text}
            </div>
          )}

          {!canResetAllRankedData && (
            <p className="text-sm text-red-700">
              Only super admins can run full ranked reset.
            </p>
          )}

          {canResetAllRankedData && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-red-900 mb-1">Reset reason (audit log)</label>
                  <textarea
                    value={rankedResetReason}
                    onChange={(e) => setRankedResetReason(e.target.value)}
                    minLength={10}
                    maxLength={500}
                    rows={3}
                    placeholder="Explain why this global reset is needed."
                    className="w-full px-3 py-2 border border-red-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-red-900 mb-1">
                    Type <code>{RANKED_RESET_CONFIRM_TEXT}</code> to confirm
                  </label>
                  <input
                    type="text"
                    value={rankedResetConfirmText}
                    onChange={(e) => setRankedResetConfirmText(e.target.value)}
                    placeholder={RANKED_RESET_CONFIRM_TEXT}
                    className="w-full px-3 py-2 border border-red-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                  <p className="mt-2 text-xs text-red-700">
                    Use only during maintenance with zero active matches.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button
                  onClick={() => void handleStartRankedReset()}
                  disabled={isRankedResetBusy}
                  variant="danger"
                >
                  {startRankedResetMutation.isPending ? 'Starting...' : 'Start Full Ranked Reset'}
                </Button>
                <Button
                  onClick={() => {
                    if (rankedResetJob?.jobId) {
                      void continueRankedReset(rankedResetJob.jobId);
                    }
                  }}
                  disabled={!rankedResetJob?.jobId || rankedResetJob?.status !== 'in_progress' || isRankedResetBusy}
                  variant="secondary"
                >
                  {continueRankedResetMutation.isPending ? 'Continuing...' : 'Continue Reset'}
                </Button>
                <Button
                  onClick={() => void loadRankedResetStatus()}
                  disabled={isRankedResetBusy}
                  variant="secondary"
                >
                  Refresh Status
                </Button>
              </div>
            </>
          )}

          {rankedResetJob && (
            <div className="bg-white rounded-lg border border-red-200 p-4 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <p className="text-slate-700">
                  <span className="font-medium">Job:</span> {rankedResetJob.jobId}
                </p>
                <p className="text-slate-700">
                  <span className="font-medium">Status:</span> {formatRankedResetStatus(rankedResetJob.status)}
                </p>
                <p className="text-slate-700">
                  <span className="font-medium">Stage:</span> {formatRankedResetStage(rankedResetJob.stage)}
                </p>
                <p className="text-slate-700">
                  <span className="font-medium">Updated:</span> {formatResetTimestamp(rankedResetJob.updatedAt)}
                </p>
                <p className="text-slate-700">
                  <span className="font-medium">Created:</span> {formatResetTimestamp(rankedResetJob.createdAt)}
                </p>
                <p className="text-slate-700">
                  <span className="font-medium">Completed:</span> {formatResetTimestamp(rankedResetJob.completedAt)}
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-sm text-slate-700">
                  Players reset: {rankedResetPlayersProcessed} / {rankedResetPlayersTotal || rankedResetJob.totals.players}
                </p>
                <div className="h-2 rounded bg-slate-200 overflow-hidden">
                  <div className="h-full bg-red-500" style={{ width: `${rankedResetPlayersPercent}%` }} />
                </div>

                <p className="text-sm text-slate-700">
                  Category boards cleared: {rankedResetBoardsProcessed} / {rankedResetBoardsTotal || rankedResetJob.totals.categoryLeaderboards}
                </p>
                <div className="h-2 rounded bg-slate-200 overflow-hidden">
                  <div className="h-full bg-orange-500" style={{ width: `${rankedResetBoardsPercent}%` }} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-slate-700">
                <p>
                  <span className="font-medium">Category records deleted:</span>{' '}
                  {rankedResetJob.progress.categoryRecordsDeleted}
                </p>
                <p>
                  <span className="font-medium">Match history rows deleted:</span>{' '}
                  {rankedResetJob.progress.matchHistoryRowsDeleted}
                </p>
              </div>

              {rankedResetJob.error && (
                <p className="text-sm text-red-700">
                  <span className="font-medium">Error:</span> {rankedResetJob.error}
                </p>
              )}
            </div>
          )}
        </section>

        <div className="flex justify-end">
          <Button onClick={handleSave} loading={updateGameSettingsMutation.isPending}>
            Save Settings
          </Button>
        </div>
      </div>

      <div className="w-full max-w-5xl mx-auto bg-blue-50 rounded-xl p-4">
        <h3 className="text-sm font-medium text-blue-800">Note</h3>
        <p className="text-sm text-blue-700 mt-1">
          Bot policy applies globally by default and can be overridden per tournament.
        </p>
      </div>
    </div>
  );
}

function SettingsSummaryCard({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'warning';
}) {
  const toneClass =
    tone === 'warning'
      ? 'border-amber-200 bg-amber-50'
      : 'border-slate-200 bg-slate-50';

  return (
    <div className={`rounded-2xl border p-4 ${toneClass}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-900">{value}</p>
    </div>
  );
}
