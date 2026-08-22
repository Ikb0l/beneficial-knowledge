
import { useEffect, useMemo, useState } from 'react';
import { useCategories } from '../hooks/useCategories';
import { useRBAC } from '../hooks/useRBAC';
import type {
  AiCategoryOverride,
  AiGenerationJob,
  AiGenerationSettings,
  AiGeneratedCandidate,
  AiProviderProfile,
  AiSourcePack,
  QuestionType,
} from '../types';
import { getErrorMessage } from '../lib/errors';
import { confirmAction } from '../lib/confirm';
import { toastError, toastSuccess } from '../lib/toast';
import { Button, Input, PageHeader, Section, Select, Spinner, Textarea } from '../components/ui';
import {
  approveAiQuestion,
  createAiProviderProfile,
  createAiSourcePack,
  deleteAiCategoryOverride,
  deleteAiProviderProfile,
  deleteAiSourcePack,
  fetchAiAdminSnapshot,
  fetchAiGenerationJobs,
  fetchAiReviewQueue,
  fetchAiSettings,
  generateAiQuestions,
  rejectAiQuestion,
  retryAiQuestion,
  setAiProviderCredential,
  toggleAiKillSwitch,
  updateAiProviderProfile,
  updateAiSettings,
  upsertAiCategoryOverride,
} from '../domains/aiQuestions/api';

const QUESTION_TYPES: Array<{ id: QuestionType; label: string }> = [
  { id: 'mcq', label: 'Multiple Choice' },
  { id: 'true_false', label: 'True / False' },
  { id: 'true_false_not_given', label: 'True / False / Not Given' },
  { id: 'heading_match', label: 'Heading Match' },
];

const DEFAULT_ALLOWED_TYPES: QuestionType[] = QUESTION_TYPES.map((item) => item.id);
const AI_SECTION_LINKS = [
  { id: 'ai-global-controls', label: 'Global' },
  { id: 'ai-profiles', label: 'Profiles' },
  { id: 'ai-source-packs', label: 'Source Packs' },
  { id: 'ai-overrides', label: 'Overrides' },
  { id: 'ai-run', label: 'Run' },
  { id: 'ai-jobs', label: 'Jobs' },
  { id: 'ai-review', label: 'Review' },
] as const;

interface ProfileFormState {
  profileKey: string;
  model: string;
  endpointUrl: string;
  temperature: string;
  topP: string;
  maxTokens: string;
  timeoutMs: string;
  maxRetries: string;
  isDefault: boolean;
  isActive: boolean;
  inputUsdPer1M: string;
  outputUsdPer1M: string;
}

interface SourcePackFormState {
  categoryKey: string;
  name: string;
  packKey: string;
  language: string;
  description: string;
  documentsJson: string;
}

interface RunFormState {
  categoryKey: string;
  count: string;
  sourcePackId: string;
  profileId: string;
  autoPublish: boolean;
  strictMode: boolean;
  allowedTypes: QuestionType[];
  scheduled: boolean;
  scheduleIntervalMinutes: string;
}

interface OverrideFormState {
  categoryKey: string;
  isEnabled: boolean;
  profileId: string;
  sourcePackId: string;
  autoPublish: boolean;
  strictMode: boolean;
  requireCitation: boolean;
  similarityThreshold: string;
  allowedTypes: QuestionType[];
  dailyUsd: string;
  monthlyUsd: string;
}

function parseNumber(value: string, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function normalizeAllowedTypes(input: unknown, fallback: QuestionType[]): QuestionType[] {
  if (!Array.isArray(input)) return fallback;
  const out: QuestionType[] = [];
  for (const item of input) {
    if (typeof item !== 'string') continue;
    const normalized = item.toLowerCase() as QuestionType;
    if (!DEFAULT_ALLOWED_TYPES.includes(normalized)) continue;
    if (out.includes(normalized)) continue;
    out.push(normalized);
  }
  return out.length > 0 ? out : fallback;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
}

function shortId(value: string): string {
  if (!value) return '-';
  if (value.length <= 12) return value;
  return value.slice(0, 8) + '...' + value.slice(-4);
}

function parseDocumentsJson(raw: string): Array<{ title: string; content: string; metadata?: Record<string, unknown> }> {
  const text = raw.trim();
  if (!text) return [];

  const parsed = JSON.parse(text) as unknown;
  const list = Array.isArray(parsed) ? parsed : [parsed];
  const documents: Array<{ title: string; content: string; metadata?: Record<string, unknown> }> = [];
  let index = 1;
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const candidate = item as Record<string, unknown>;
    const title = String(candidate.title ?? '').trim() || `Document ${index}`;
    const content = String(candidate.content ?? '').trim();
    if (!content) continue;
    const metadataRaw = candidate.metadata;
    const metadata = metadataRaw && typeof metadataRaw === 'object' ? (metadataRaw as Record<string, unknown>) : undefined;
    documents.push({ title, content, metadata });
    index += 1;
  }
  return documents;
}

export default function AiQuestionGenerationPage() {
  const { categories, isLoading: isCategoryLoading } = useCategories();
  const { isSuperAdmin } = useRBAC();

  const [settings, setSettings] = useState<AiGenerationSettings | null>(null);
  const [overrides, setOverrides] = useState<AiCategoryOverride[]>([]);
  const [profiles, setProfiles] = useState<AiProviderProfile[]>([]);
  const [sourcePacks, setSourcePacks] = useState<AiSourcePack[]>([]);
  const [jobs, setJobs] = useState<AiGenerationJob[]>([]);
  const [reviewQueue, setReviewQueue] = useState<AiGeneratedCandidate[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isSavingCredential, setIsSavingCredential] = useState(false);
  const [isCreatingProfile, setIsCreatingProfile] = useState(false);
  const [isCreatingSourcePack, setIsCreatingSourcePack] = useState(false);
  const [isRunningGeneration, setIsRunningGeneration] = useState(false);
  const [isSavingOverride, setIsSavingOverride] = useState(false);
  const [isDeletingOverride, setIsDeletingOverride] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profileActionKey, setProfileActionKey] = useState<string | null>(null);
  const [sourcePackActionId, setSourcePackActionId] = useState<string | null>(null);
  const [reviewActionKey, setReviewActionKey] = useState<string | null>(null);
  const [jobStatusFilter, setJobStatusFilter] = useState('all');
  const [jobSearch, setJobSearch] = useState('');
  const [reviewCategoryFilter, setReviewCategoryFilter] = useState('all');
  const [reviewSearch, setReviewSearch] = useState('');
  const [reviewFailuresOnly, setReviewFailuresOnly] = useState(false);

  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  const [savedApiKeyHint, setSavedApiKeyHint] = useState('');

  const [profileForm, setProfileForm] = useState<ProfileFormState>({
    profileKey: '',
    model: 'deepseek-chat',
    endpointUrl: 'https://api.deepseek.com/chat/completions',
    temperature: '0.3',
    topP: '1',
    maxTokens: '1400',
    timeoutMs: '45000',
    maxRetries: '2',
    isDefault: false,
    isActive: true,
    inputUsdPer1M: '0.14',
    outputUsdPer1M: '0.28',
  });

  const [sourcePackForm, setSourcePackForm] = useState<SourcePackFormState>({
    categoryKey: '',
    name: '',
    packKey: '',
    language: 'en',
    description: '',
    documentsJson: '',
  });

  const [runForm, setRunForm] = useState<RunFormState>({
    categoryKey: '',
    count: '10',
    sourcePackId: '',
    profileId: '',
    autoPublish: true,
    strictMode: true,
    allowedTypes: DEFAULT_ALLOWED_TYPES.slice(),
    scheduled: false,
    scheduleIntervalMinutes: '60',
  });

  const [overrideForm, setOverrideForm] = useState<OverrideFormState>({
    categoryKey: '',
    isEnabled: true,
    profileId: '',
    sourcePackId: '',
    autoPublish: true,
    strictMode: true,
    requireCitation: true,
    similarityThreshold: '0.92',
    allowedTypes: DEFAULT_ALLOWED_TYPES.slice(),
    dailyUsd: '',
    monthlyUsd: '',
  });

  const profileById = useMemo(() => {
    const map = new Map<string, AiProviderProfile>();
    for (const profile of profiles) map.set(profile.id, profile);
    return map;
  }, [profiles]);

  const sourcePackById = useMemo(() => {
    const map = new Map<string, AiSourcePack>();
    for (const pack of sourcePacks) map.set(pack.id, pack);
    return map;
  }, [sourcePacks]);

  const filteredJobs = useMemo(() => {
    const needle = jobSearch.trim().toLowerCase();
    return jobs.filter((job) => {
      if (jobStatusFilter !== 'all' && job.status !== jobStatusFilter) return false;
      if (!needle) return true;
      return (
        job.id.toLowerCase().includes(needle) ||
        job.categoryKey.toLowerCase().includes(needle) ||
        job.status.toLowerCase().includes(needle) ||
        String(job.triggerType || '').toLowerCase().includes(needle)
      );
    });
  }, [jobSearch, jobStatusFilter, jobs]);

  const filteredReviewQueue = useMemo(() => {
    const needle = reviewSearch.trim().toLowerCase();
    return reviewQueue.filter((candidate) => {
      if (reviewCategoryFilter !== 'all' && candidate.categoryKey !== reviewCategoryFilter) return false;
      if (reviewFailuresOnly && candidate.failureReasons.length === 0) return false;
      if (!needle) return true;
      return (
        candidate.questionText.toLowerCase().includes(needle) ||
        candidate.categoryKey.toLowerCase().includes(needle) ||
        candidate.questionType.toLowerCase().includes(needle) ||
        candidate.failureReasons.join(' ').toLowerCase().includes(needle)
      );
    });
  }, [reviewCategoryFilter, reviewFailuresOnly, reviewQueue, reviewSearch]);

  const activeProfileCount = useMemo(
    () => profiles.filter((profile) => profile.isActive).length,
    [profiles],
  );

  const activeSourcePackCount = useMemo(
    () => sourcePacks.filter((pack) => pack.isActive).length,
    [sourcePacks],
  );

  const pendingJobCount = useMemo(
    () => jobs.filter((job) => job.status === 'pending' || job.status === 'running').length,
    [jobs],
  );

  useEffect(() => {
    void loadPage();
  }, []);

  useEffect(() => {
    if (categories.length === 0) return;

    setSourcePackForm((prev) => {
      if (prev.categoryKey) return prev;
      return { ...prev, categoryKey: categories[0].categoryKey };
    });
    setRunForm((prev) => {
      if (prev.categoryKey) return prev;
      return { ...prev, categoryKey: categories[0].categoryKey };
    });
    setOverrideForm((prev) => {
      if (prev.categoryKey) return prev;
      return { ...prev, categoryKey: categories[0].categoryKey };
    });
  }, [categories]);

  useEffect(() => {
    if (!settings || !overrideForm.categoryKey) return;
    hydrateOverrideForm(overrideForm.categoryKey, settings, overrides);
  }, [overrideForm.categoryKey, overrides, settings]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void refreshJobs({ silent: true });
      void refreshReviewQueue({ silent: true });
    }, 10000);
    return () => window.clearInterval(intervalId);
  }, []);

  async function loadPage() {
    try {
      setIsLoading(true);
      setError(null);
      const snapshot = await fetchAiAdminSnapshot();

      setSettings(snapshot.settings);
      setOverrides(snapshot.categoryOverrides || []);
      setProfiles(snapshot.profiles || []);
      setSourcePacks(snapshot.sourcePacks || []);
      setJobs(snapshot.jobs || []);
      setReviewQueue(snapshot.reviewQueue || []);
    } catch (err) {
      console.error('Failed to load AI admin page:', err);
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }

  async function refreshSettings() {
    try {
      const settingsData = await fetchAiSettings();
      setSettings(settingsData.settings);
      setOverrides(settingsData.categoryOverrides || []);
      setProfiles(settingsData.profiles || []);
      setSourcePacks(settingsData.sourcePacks || []);
    } catch (err) {
      toastError('Failed to refresh settings: ' + getErrorMessage(err));
    }
  }

  async function refreshJobs(options?: { silent?: boolean }) {
    try {
      const jobsData = await fetchAiGenerationJobs({ limit: 100, offset: 0 });
      setJobs(jobsData.items || []);
    } catch (err) {
      if (!options?.silent) {
        toastError('Failed to refresh jobs: ' + getErrorMessage(err));
      }
    }
  }

  async function refreshReviewQueue(options?: { silent?: boolean }) {
    try {
      const reviewData = await fetchAiReviewQueue({ status: 'needs_review', limit: 100, offset: 0 });
      setReviewQueue(reviewData.items || []);
    } catch (err) {
      if (!options?.silent) {
        toastError('Failed to refresh review queue: ' + getErrorMessage(err));
      }
    }
  }

  function hydrateOverrideForm(categoryKey: string, baseSettings: AiGenerationSettings, categoryOverrides: AiCategoryOverride[]) {
    const existing = categoryOverrides.find((item) => item.categoryKey === categoryKey);
    const config = existing?.overrideConfig ?? {};
    const budgets = existing?.budgets ?? {};
    const autoPublish = typeof config.autoPublish === 'boolean' ? config.autoPublish : baseSettings.autoPublish;
    const strictMode = typeof config.strictMode === 'boolean' ? config.strictMode : baseSettings.strictMode;
    const requireCitation = typeof config.requireCitation === 'boolean' ? config.requireCitation : baseSettings.requireCitation;
    const similarityThresholdValue = typeof config.similarityThreshold === 'number'
      ? config.similarityThreshold
      : baseSettings.similarityThreshold;
    const allowedTypes = normalizeAllowedTypes(config.allowedQuestionTypes, baseSettings.allowedQuestionTypes || DEFAULT_ALLOWED_TYPES);
    const dailyUsd = typeof budgets.dailyUsd === 'number' ? String(budgets.dailyUsd) : '';
    const monthlyUsd = typeof budgets.monthlyUsd === 'number' ? String(budgets.monthlyUsd) : '';

    setOverrideForm((prev) => ({
      ...prev,
      categoryKey,
      isEnabled: existing ? existing.isEnabled : true,
      profileId: existing?.profileId || '',
      sourcePackId: existing?.sourcePackId || '',
      autoPublish,
      strictMode,
      requireCitation,
      similarityThreshold: String(similarityThresholdValue),
      allowedTypes,
      dailyUsd,
      monthlyUsd,
    }));
  }

  function toggleAllowedType(
    current: QuestionType[],
    setValue: (next: QuestionType[]) => void,
    type: QuestionType
  ) {
    if (current.includes(type)) {
      const next = current.filter((item) => item !== type);
      setValue(next.length > 0 ? next : [type]);
      return;
    }
    setValue([...current, type]);
  }

  async function handleSaveSettings() {
    if (!isSuperAdmin) {
      toastError('Super admin access required');
      return;
    }
    if (!settings) return;
    try {
      setIsSavingSettings(true);
      const response = await updateAiSettings(settings);
      setSettings(response.settings || settings);
      toastSuccess('AI settings updated');
    } catch (err) {
      toastError('Failed to update settings: ' + getErrorMessage(err));
    } finally {
      setIsSavingSettings(false);
    }
  }

  async function handleToggleKillSwitch() {
    if (!isSuperAdmin) {
      toastError('Super admin access required');
      return;
    }
    if (!settings) return;
    try {
      const nextValue = !settings.killSwitch;
      await toggleAiKillSwitch(nextValue);
      setSettings((prev) => (prev ? { ...prev, killSwitch: nextValue } : prev));
      toastSuccess(nextValue ? 'AI kill switch enabled' : 'AI kill switch disabled');
    } catch (err) {
      toastError('Failed to toggle kill switch: ' + getErrorMessage(err));
    }
  }

  async function handleSaveCredential() {
    if (!isSuperAdmin) {
      toastError('Super admin access required');
      return;
    }
    const apiKey = apiKeyInput.trim();
    if (!apiKey) {
      toastError('API key is required');
      return;
    }
    try {
      setIsSavingCredential(true);
      const response = await setAiProviderCredential(apiKey);
      const hint = response?.hint || `****${apiKey.slice(-4)}`;
      setSavedApiKeyHint(hint);
      setApiKeyInput('');
      setShowApiKeyInput(false);
      toastSuccess('Provider credential saved');
    } catch (err) {
      toastError('Failed to save credential: ' + getErrorMessage(err));
    } finally {
      setIsSavingCredential(false);
    }
  }

  async function handleCreateProfile() {
    if (!isSuperAdmin) {
      toastError('Super admin access required');
      return;
    }
    const profileKey = profileForm.profileKey.trim();
    if (!profileKey) {
      toastError('Profile key is required');
      return;
    }

    try {
      setIsCreatingProfile(true);
      await createAiProviderProfile({
        profile: {
          profileKey,
          providerKey: 'deepseek',
          credentialProviderKey: 'deepseek',
          endpointUrl: profileForm.endpointUrl.trim() || 'https://api.deepseek.com/chat/completions',
          model: profileForm.model.trim() || 'deepseek-chat',
          temperature: parseNumber(profileForm.temperature, 0.3),
          topP: parseNumber(profileForm.topP, 1),
          maxTokens: Math.floor(parseNumber(profileForm.maxTokens, 1400)),
          timeoutMs: Math.floor(parseNumber(profileForm.timeoutMs, 45000)),
          maxRetries: Math.floor(parseNumber(profileForm.maxRetries, 2)),
          isDefault: profileForm.isDefault,
          isActive: profileForm.isActive,
          config: {
            inputUsdPer1M: parseNumber(profileForm.inputUsdPer1M, 0.14),
            outputUsdPer1M: parseNumber(profileForm.outputUsdPer1M, 0.28),
          },
        },
      });

      setProfileForm((prev) => ({
        ...prev,
        profileKey: '',
        isDefault: false,
      }));
      await refreshSettings();
      toastSuccess('Provider profile created');
    } catch (err) {
      toastError('Failed to create profile: ' + getErrorMessage(err));
    } finally {
      setIsCreatingProfile(false);
    }
  }

  async function handleToggleProfile(profile: AiProviderProfile, key: 'isDefault' | 'isActive') {
    if (!isSuperAdmin) {
      toastError('Super admin access required');
      return;
    }
    const nextValue = !profile[key];
    try {
      setProfileActionKey(`${profile.id}:${key}`);
      const response = await updateAiProviderProfile({
        profileId: profile.id,
        updates: {
          [key]: nextValue,
        },
      });

      if (response.profile) {
        setProfiles((prev) => prev.map((item) => (item.id === response.profile?.id ? response.profile : item)));
      } else {
        setProfiles((prev) =>
          prev.map((item) => {
            if (item.id !== profile.id) {
              if (key === 'isDefault' && nextValue) return { ...item, isDefault: false };
              return item;
            }
            return { ...item, [key]: nextValue } as AiProviderProfile;
          })
        );
      }

      if (response.defaultProfileKey) {
        setSettings((prev) => (prev ? { ...prev, defaultProfileKey: response.defaultProfileKey || prev.defaultProfileKey } : prev));
      } else if (key === 'isDefault' && nextValue) {
        setSettings((prev) => (prev ? { ...prev, defaultProfileKey: profile.profileKey } : prev));
      }

      toastSuccess('Profile updated');
    } catch (err) {
      toastError('Failed to update profile: ' + getErrorMessage(err));
    } finally {
      setProfileActionKey(null);
    }
  }

  async function handleDeleteProfile(profile: AiProviderProfile) {
    if (!isSuperAdmin) {
      toastError('Super admin access required');
      return;
    }
    const ok = await confirmAction({
      title: 'Delete profile?',
      message: `Delete provider profile "${profile.profileKey}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;

    try {
      setProfileActionKey(`${profile.id}:delete`);
      const response = await deleteAiProviderProfile(profile.id);

      const deletedProfileId = response.deletedProfileId || profile.id;
      setProfiles((prev) => prev.filter((item) => item.id !== deletedProfileId));
      setRunForm((prev) => (prev.profileId === deletedProfileId ? { ...prev, profileId: '' } : prev));
      setOverrideForm((prev) => (prev.profileId === deletedProfileId ? { ...prev, profileId: '' } : prev));
      setOverrides((prev) => prev.map((item) => (item.profileId === deletedProfileId ? { ...item, profileId: null } : item)));
      if (Object.prototype.hasOwnProperty.call(response, 'nextDefaultProfileKey')) {
        setSettings((prev) => (prev ? { ...prev, defaultProfileKey: response.nextDefaultProfileKey || '' } : prev));
      }
      toastSuccess('Profile deleted');
    } catch (err) {
      toastError('Failed to delete profile: ' + getErrorMessage(err));
    } finally {
      setProfileActionKey(null);
    }
  }

  async function handleCreateSourcePack() {
    const categoryKey = sourcePackForm.categoryKey.trim();
    const name = sourcePackForm.name.trim();
    if (!categoryKey) {
      toastError('Category is required');
      return;
    }
    if (!name) {
      toastError('Pack name is required');
      return;
    }

    let documents: Array<{ title: string; content: string; metadata?: Record<string, unknown> }> = [];
    try {
      documents = parseDocumentsJson(sourcePackForm.documentsJson);
    } catch {
      toastError('Documents JSON is invalid');
      return;
    }

    try {
      setIsCreatingSourcePack(true);
      await createAiSourcePack({
        pack: {
          categoryKey,
          name,
          packKey: sourcePackForm.packKey.trim() || undefined,
          language: sourcePackForm.language.trim() || 'en',
          description: sourcePackForm.description.trim(),
          documents,
        },
      });

      setSourcePackForm((prev) => ({
        ...prev,
        name: '',
        packKey: '',
        description: '',
        documentsJson: '',
      }));
      await refreshSettings();
      toastSuccess('Source pack created');
    } catch (err) {
      toastError('Failed to create source pack: ' + getErrorMessage(err));
    } finally {
      setIsCreatingSourcePack(false);
    }
  }

  async function handleArchiveSourcePack(pack: AiSourcePack) {
    const ok = await confirmAction({
      title: 'Archive source pack?',
      message: `Archive source pack "${pack.name}"?`,
      confirmLabel: 'Archive',
      tone: 'danger',
    });
    if (!ok) return;

    try {
      setSourcePackActionId(pack.id);
      await deleteAiSourcePack(pack.id);
      setSourcePacks((prev) =>
        prev.map((item) => (item.id === pack.id ? { ...item, isActive: false, status: 'archived' } : item))
      );
      setRunForm((prev) => (prev.sourcePackId === pack.id ? { ...prev, sourcePackId: '' } : prev));
      setOverrideForm((prev) => (prev.sourcePackId === pack.id ? { ...prev, sourcePackId: '' } : prev));
      setOverrides((prev) => prev.map((item) => (item.sourcePackId === pack.id ? { ...item, sourcePackId: null } : item)));
      toastSuccess('Source pack archived');
    } catch (err) {
      toastError('Failed to archive source pack: ' + getErrorMessage(err));
    } finally {
      setSourcePackActionId(null);
    }
  }

  async function handleSaveOverride() {
    if (!isSuperAdmin) {
      toastError('Super admin access required');
      return;
    }
    if (!overrideForm.categoryKey) {
      toastError('Category is required');
      return;
    }

    try {
      setIsSavingOverride(true);
      const similarityThreshold = parseNumber(overrideForm.similarityThreshold, 0.92);
      const overrideConfig: Record<string, unknown> = {
        autoPublish: overrideForm.autoPublish,
        strictMode: overrideForm.strictMode,
        requireCitation: overrideForm.requireCitation,
        similarityThreshold,
        allowedQuestionTypes: overrideForm.allowedTypes,
      };
      const budgets: Record<string, number> = {};
      if (overrideForm.dailyUsd.trim() !== '') {
        budgets.dailyUsd = parseNumber(overrideForm.dailyUsd, 0);
      }
      if (overrideForm.monthlyUsd.trim() !== '') {
        budgets.monthlyUsd = parseNumber(overrideForm.monthlyUsd, 0);
      }

      const response = await upsertAiCategoryOverride({
        categoryKey: overrideForm.categoryKey,
        isEnabled: overrideForm.isEnabled,
        profileId: overrideForm.profileId || null,
        sourcePackId: overrideForm.sourcePackId || null,
        overrideConfig,
        budgets,
      });

      if (response.override) {
        setOverrides((prev) => {
          const index = prev.findIndex((item) => item.categoryKey === response.override?.categoryKey);
          if (index === -1) return [...prev, response.override!];
          const next = prev.slice();
          next[index] = response.override!;
          return next;
        });
      } else {
        await refreshSettings();
      }
      toastSuccess('Category override saved');
    } catch (err) {
      toastError('Failed to save category override: ' + getErrorMessage(err));
    } finally {
      setIsSavingOverride(false);
    }
  }

  async function handleDeleteOverride() {
    if (!isSuperAdmin) {
      toastError('Super admin access required');
      return;
    }
    if (!overrideForm.categoryKey) return;
    const ok = await confirmAction({
      title: 'Delete override?',
      message: `Delete AI override for "${overrideForm.categoryKey}"?`,
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;

    try {
      setIsDeletingOverride(true);
      await deleteAiCategoryOverride(overrideForm.categoryKey);
      const nextOverrides = overrides.filter((item) => item.categoryKey !== overrideForm.categoryKey);
      setOverrides(nextOverrides);
      if (settings) {
        hydrateOverrideForm(overrideForm.categoryKey, settings, nextOverrides);
      }
      toastSuccess('Category override deleted');
    } catch (err) {
      toastError('Failed to delete override: ' + getErrorMessage(err));
    } finally {
      setIsDeletingOverride(false);
    }
  }

  async function handleRunGeneration() {
    if (!runForm.categoryKey) {
      toastError('Category is required');
      return;
    }

    try {
      setIsRunningGeneration(true);
      const response = await generateAiQuestions({
        categoryKey: runForm.categoryKey,
        count: Math.max(1, Math.floor(parseNumber(runForm.count, 10))),
        sourcePackId: runForm.sourcePackId || undefined,
        profileId: runForm.profileId || undefined,
        autoPublish: runForm.autoPublish,
        strictMode: runForm.strictMode,
        allowedQuestionTypes: runForm.allowedTypes,
        scheduled: runForm.scheduled,
        scheduleIntervalMinutes: runForm.scheduled ? Math.max(5, Math.floor(parseNumber(runForm.scheduleIntervalMinutes, 60))) : undefined,
      });

      if (response.scheduled) {
        toastSuccess('AI generation schedule created');
      } else if (response.queued || response.status === 'pending') {
        if ((response.batchCount || 0) > 1) {
          toastSuccess(`AI generation queued in ${response.batchCount} jobs. Results will appear in Jobs shortly.`);
        } else {
          toastSuccess('AI generation job queued. Results will appear in Jobs shortly.');
        }
      } else {
        const imported = response.imported ?? 0;
        const queuedForReview = response.queuedForReview ?? 0;
        const failed = response.failed ?? 0;
        toastSuccess(`AI generation finished: imported=${imported}, review=${queuedForReview}, failed=${failed}`);
      }

      await Promise.all([refreshJobs({ silent: true }), refreshReviewQueue({ silent: true })]);
    } catch (err) {
      toastError('Failed to start generation: ' + getErrorMessage(err));
    } finally {
      setIsRunningGeneration(false);
    }
  }

  async function handleApproveCandidate(candidateId: string) {
    try {
      setReviewActionKey(`${candidateId}:approve`);
      await approveAiQuestion(candidateId);
      setReviewQueue((prev) => prev.filter((candidate) => candidate.id !== candidateId));
      toastSuccess('Candidate approved and published');
      await Promise.all([refreshReviewQueue(), refreshJobs()]);
    } catch (err) {
      toastError('Failed to approve candidate: ' + getErrorMessage(err));
    } finally {
      setReviewActionKey(null);
    }
  }

  async function handleRejectCandidate(candidateId: string) {
    const reason = window.prompt('Reason for rejection (optional):', '') || '';
    try {
      setReviewActionKey(`${candidateId}:reject`);
      await rejectAiQuestion(candidateId, reason.trim());
      setReviewQueue((prev) => prev.filter((candidate) => candidate.id !== candidateId));
      toastSuccess('Candidate rejected');
      await refreshReviewQueue();
    } catch (err) {
      toastError('Failed to reject candidate: ' + getErrorMessage(err));
    } finally {
      setReviewActionKey(null);
    }
  }

  async function handleRetryCandidate(candidateId: string) {
    try {
      setReviewActionKey(`${candidateId}:retry`);
      const response = await retryAiQuestion(candidateId);
      if (response.queued || response.status === 'pending') {
        toastSuccess('Requeue job queued');
      } else {
        toastSuccess('Requeue job created');
      }
      await Promise.all([refreshReviewQueue({ silent: true }), refreshJobs({ silent: true })]);
    } catch (err) {
      toastError('Failed to retry candidate: ' + getErrorMessage(err));
    } finally {
      setReviewActionKey(null);
    }
  }

  if (isLoading || isCategoryLoading) {
    return (
      <div className="page-shell">
        <div className="flex items-center justify-center py-16">
          <Spinner />
        </div>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="page-shell">
        <PageHeader title="AI Questions" subtitle="Unable to load AI settings." />
        <Section>
          <p className="text-sm text-rose-700">{error || 'Unknown error'}</p>
          <div className="pt-2">
            <Button onClick={() => void loadPage()}>Refresh</Button>
          </div>
        </Section>
      </div>
    );
  }

  const overrideExists = overrides.some((item) => item.categoryKey === overrideForm.categoryKey);

  return (
    <div className="page-shell">
      <PageHeader
        title="AI Question Generation"
        subtitle="DeepSeek-first configurable generation with source-backed safeguards and admin review."
        actions={
          <Button variant="secondary" onClick={() => void loadPage()}>
            Refresh
          </Button>
        }
      />

      {error && (
        <Section className="space-y-2 border border-rose-200/70 bg-rose-50/60">
          <p className="text-sm text-rose-700">{error}</p>
        </Section>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <AiSummaryCard label="Kill Switch" value={settings.killSwitch ? 'Enabled' : 'Off'} tone={settings.killSwitch ? 'danger' : 'default'} />
        <AiSummaryCard label="Active Profiles" value={`${activeProfileCount} / ${profiles.length}`} />
        <AiSummaryCard label="Active Source Packs" value={`${activeSourcePackCount} / ${sourcePacks.length}`} />
        <AiSummaryCard label="Queue Pressure" value={`${pendingJobCount} jobs · ${filteredReviewQueue.length} reviews`} tone={filteredReviewQueue.length > 0 ? 'warning' : 'default'} />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {AI_SECTION_LINKS.map((link) => (
            <a
              key={link.id}
              href={`#${link.id}`}
              className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-medium text-slate-700 transition hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700"
            >
              {link.label}
            </a>
          ))}
        </div>
      </div>

      <Section
        id="ai-global-controls"
        title="Global Controls"
        subtitle="Master toggles, safety limits, and default generation behavior."
        actions={
          <Button loading={isSavingSettings} disabled={!isSuperAdmin} onClick={() => void handleSaveSettings()}>
            Save Settings
          </Button>
        }
      >
        <div className="grid gap-4 md:grid-cols-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={(event) => setSettings((prev) => (prev ? { ...prev, enabled: event.target.checked } : prev))}
            />
            Enabled
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.autoPublish}
              onChange={(event) => setSettings((prev) => (prev ? { ...prev, autoPublish: event.target.checked } : prev))}
            />
            Auto Publish
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.strictMode}
              onChange={(event) => setSettings((prev) => (prev ? { ...prev, strictMode: event.target.checked } : prev))}
            />
            Strict Mode
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.requireCitation}
              onChange={(event) => setSettings((prev) => (prev ? { ...prev, requireCitation: event.target.checked } : prev))}
            />
            Require Citation
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-secondary-ink">Max Questions / Run</label>
            <Input
              type="number"
              min={1}
              max={500}
              value={settings.maxQuestionsPerRun}
              onChange={(event) => setSettings((prev) => (prev ? { ...prev, maxQuestionsPerRun: Math.max(1, Math.floor(parseNumber(event.target.value, prev.maxQuestionsPerRun))) } : prev))}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-secondary-ink">Max Input Tokens / Run</label>
            <Input
              type="number"
              min={500}
              max={50000}
              value={settings.maxInputTokensPerRun}
              onChange={(event) => setSettings((prev) => (prev ? { ...prev, maxInputTokensPerRun: Math.max(500, Math.floor(parseNumber(event.target.value, prev.maxInputTokensPerRun))) } : prev))}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-secondary-ink">Max Output Tokens / Run</label>
            <Input
              type="number"
              min={500}
              max={50000}
              value={settings.maxOutputTokensPerRun}
              onChange={(event) => setSettings((prev) => (prev ? { ...prev, maxOutputTokensPerRun: Math.max(500, Math.floor(parseNumber(event.target.value, prev.maxOutputTokensPerRun))) } : prev))}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-secondary-ink">Daily Budget (USD)</label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={settings.dailyBudgetUsd}
              onChange={(event) => setSettings((prev) => (prev ? { ...prev, dailyBudgetUsd: Math.max(0, parseNumber(event.target.value, prev.dailyBudgetUsd)) } : prev))}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-secondary-ink">Monthly Budget (USD)</label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={settings.monthlyBudgetUsd}
              onChange={(event) => setSettings((prev) => (prev ? { ...prev, monthlyBudgetUsd: Math.max(0, parseNumber(event.target.value, prev.monthlyBudgetUsd)) } : prev))}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-secondary-ink">Similarity Threshold</label>
            <Input
              type="number"
              min={0.4}
              max={0.999}
              step="0.001"
              value={settings.similarityThreshold}
              onChange={(event) => setSettings((prev) => (prev ? { ...prev, similarityThreshold: parseNumber(event.target.value, prev.similarityThreshold) } : prev))}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-secondary-ink">Default Language</label>
            <Input
              value={settings.defaultLanguage}
              onChange={(event) => setSettings((prev) => (prev ? { ...prev, defaultLanguage: event.target.value.trim().toLowerCase() } : prev))}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-secondary-ink">Default Profile</label>
            <Select
              value={settings.defaultProfileKey}
              onChange={(event) => setSettings((prev) => (prev ? { ...prev, defaultProfileKey: event.target.value } : prev))}
            >
              <option value="">Select profile</option>
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.profileKey}>
                  {profile.profileKey}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex items-end">
            <Button variant={settings.killSwitch ? 'danger' : 'secondary'} disabled={!isSuperAdmin} onClick={() => void handleToggleKillSwitch()}>
              {settings.killSwitch ? 'Disable Kill Switch' : 'Enable Kill Switch'}
            </Button>
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium text-secondary-ink">Allowed Question Types</p>
          <div className="grid gap-2 md:grid-cols-2">
            {QUESTION_TYPES.map((type) => (
              <label key={type.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={settings.allowedQuestionTypes.includes(type.id)}
                  onChange={() =>
                    toggleAllowedType(
                      settings.allowedQuestionTypes,
                      (next) => setSettings((prev) => (prev ? { ...prev, allowedQuestionTypes: next } : prev)),
                      type.id
                    )
                  }
                />
                {type.label}
              </label>
            ))}
          </div>
        </div>
      </Section>

      <Section id="ai-profiles" title="Provider Credentials & Profiles" subtitle="Configure DeepSeek secret and model profiles.">
        <div className="grid gap-4 md:grid-cols-[1fr_auto_auto]">
          <Input
            type={showApiKeyInput ? 'text' : 'password'}
            placeholder="DeepSeek API key"
            value={apiKeyInput}
            onChange={(event) => setApiKeyInput(event.target.value)}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
          <Button
            variant="secondary"
            onClick={() => setShowApiKeyInput((prev) => !prev)}
          >
            {showApiKeyInput ? 'Hide Key' : 'Show Key'}
          </Button>
          <Button loading={isSavingCredential} disabled={!isSuperAdmin} onClick={() => void handleSaveCredential()}>
            Save API Key
          </Button>
        </div>
        {(apiKeyInput || savedApiKeyHint) && (
          <div className="mt-2 text-xs text-secondary-ink">
            {apiKeyInput ? `Pasted key length: ${apiKeyInput.length}` : `Saved key hint: ${savedApiKeyHint}`}
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-3">
          <Input
            placeholder="Profile key"
            value={profileForm.profileKey}
            onChange={(event) => setProfileForm((prev) => ({ ...prev, profileKey: event.target.value }))}
          />
          <Input
            placeholder="Model"
            value={profileForm.model}
            onChange={(event) => setProfileForm((prev) => ({ ...prev, model: event.target.value }))}
          />
          <Input
            placeholder="Endpoint URL"
            value={profileForm.endpointUrl}
            onChange={(event) => setProfileForm((prev) => ({ ...prev, endpointUrl: event.target.value }))}
          />
          <Input
            type="number"
            step="0.01"
            placeholder="Temperature"
            value={profileForm.temperature}
            onChange={(event) => setProfileForm((prev) => ({ ...prev, temperature: event.target.value }))}
          />
          <Input
            type="number"
            step="0.01"
            placeholder="Top P"
            value={profileForm.topP}
            onChange={(event) => setProfileForm((prev) => ({ ...prev, topP: event.target.value }))}
          />
          <Input
            type="number"
            placeholder="Max Tokens"
            value={profileForm.maxTokens}
            onChange={(event) => setProfileForm((prev) => ({ ...prev, maxTokens: event.target.value }))}
          />
          <Input
            type="number"
            placeholder="Timeout (ms)"
            value={profileForm.timeoutMs}
            onChange={(event) => setProfileForm((prev) => ({ ...prev, timeoutMs: event.target.value }))}
          />
          <Input
            type="number"
            placeholder="Retries"
            value={profileForm.maxRetries}
            onChange={(event) => setProfileForm((prev) => ({ ...prev, maxRetries: event.target.value }))}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              type="number"
              step="0.001"
              placeholder="Input USD / 1M"
              value={profileForm.inputUsdPer1M}
              onChange={(event) => setProfileForm((prev) => ({ ...prev, inputUsdPer1M: event.target.value }))}
            />
            <Input
              type="number"
              step="0.001"
              placeholder="Output USD / 1M"
              value={profileForm.outputUsdPer1M}
              onChange={(event) => setProfileForm((prev) => ({ ...prev, outputUsdPer1M: event.target.value }))}
            />
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={profileForm.isDefault}
              onChange={(event) => setProfileForm((prev) => ({ ...prev, isDefault: event.target.checked }))}
            />
            Default profile
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={profileForm.isActive}
              onChange={(event) => setProfileForm((prev) => ({ ...prev, isActive: event.target.checked }))}
            />
            Active
          </label>
          <Button loading={isCreatingProfile} disabled={!isSuperAdmin} onClick={() => void handleCreateProfile()}>
            Create Profile
          </Button>
        </div>

        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold text-secondary-ink">Profile</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-secondary-ink">Model</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-secondary-ink">Temp</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-secondary-ink">Status</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-secondary-ink">Actions</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((profile) => (
                <tr key={profile.id}>
                  <td className="px-3 py-2 text-sm">{profile.profileKey}</td>
                  <td className="px-3 py-2 text-sm">{profile.model}</td>
                  <td className="px-3 py-2 text-sm">{profile.temperature}</td>
                  <td className="px-3 py-2 text-sm">
                    {profile.isDefault ? 'Default' : '-'} / {profile.isActive ? 'Active' : 'Inactive'}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        loading={profileActionKey === `${profile.id}:isDefault`}
                        disabled={!isSuperAdmin || (!!profileActionKey && profileActionKey.startsWith(profile.id + ':')) || (!profile.isActive && !profile.isDefault)}
                        onClick={() => void handleToggleProfile(profile, 'isDefault')}
                      >
                        {profile.isDefault ? 'Unset Default' : 'Set Default'}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        loading={profileActionKey === `${profile.id}:isActive`}
                        disabled={!isSuperAdmin || (!!profileActionKey && profileActionKey.startsWith(profile.id + ':'))}
                        onClick={() => void handleToggleProfile(profile, 'isActive')}
                      >
                        {profile.isActive ? 'Disable' : 'Enable'}
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        loading={profileActionKey === `${profile.id}:delete`}
                        disabled={!isSuperAdmin || (!!profileActionKey && profileActionKey.startsWith(profile.id + ':'))}
                        onClick={() => void handleDeleteProfile(profile)}
                      >
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="ai-source-packs" title="Source Packs" subtitle="Source documents are chunked and used for citation-safe question generation.">
        <div className="grid gap-3 md:grid-cols-2">
          <Select
            value={sourcePackForm.categoryKey}
            onChange={(event) => setSourcePackForm((prev) => ({ ...prev, categoryKey: event.target.value }))}
          >
            <option value="">Select category</option>
            {categories.map((category) => (
              <option key={category.id} value={category.categoryKey}>
                {category.name}
              </option>
            ))}
          </Select>
          <Input
            placeholder="Pack name"
            value={sourcePackForm.name}
            onChange={(event) => setSourcePackForm((prev) => ({ ...prev, name: event.target.value }))}
          />
          <Input
            placeholder="Pack key (optional)"
            value={sourcePackForm.packKey}
            onChange={(event) => setSourcePackForm((prev) => ({ ...prev, packKey: event.target.value }))}
          />
          <Input
            placeholder="Language"
            value={sourcePackForm.language}
            onChange={(event) => setSourcePackForm((prev) => ({ ...prev, language: event.target.value }))}
          />
        </div>
        <Textarea
          rows={2}
          placeholder="Description"
          value={sourcePackForm.description}
          onChange={(event) => setSourcePackForm((prev) => ({ ...prev, description: event.target.value }))}
        />
        <Textarea
          rows={7}
          placeholder={'Documents JSON: [{"title":"Doc 1","content":"Text...","metadata":{"source":"url"}}]'}
          value={sourcePackForm.documentsJson}
          onChange={(event) => setSourcePackForm((prev) => ({ ...prev, documentsJson: event.target.value }))}
        />
        <div>
          <Button loading={isCreatingSourcePack} onClick={() => void handleCreateSourcePack()}>
            Create Source Pack
          </Button>
        </div>

        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold text-secondary-ink">Pack</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-secondary-ink">Category</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-secondary-ink">Docs</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-secondary-ink">Chunks</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-secondary-ink">Status</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-secondary-ink">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sourcePacks.map((pack) => (
                <tr key={pack.id}>
                  <td className="px-3 py-2 text-sm">
                    <div className="font-medium">{pack.name}</div>
                    <div className="text-xs text-secondary-ink">{pack.packKey}</div>
                  </td>
                  <td className="px-3 py-2 text-sm">{pack.categoryKey}</td>
                  <td className="px-3 py-2 text-sm">{pack.documentCount}</td>
                  <td className="px-3 py-2 text-sm">{pack.chunkCount}</td>
                  <td className="px-3 py-2 text-sm">{pack.isActive ? 'Active' : 'Archived'}</td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        variant="danger"
                        loading={sourcePackActionId === pack.id}
                        disabled={!pack.isActive || sourcePackActionId === pack.id}
                        onClick={() => void handleArchiveSourcePack(pack)}
                      >
                        Archive
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="ai-overrides" title="Category Overrides" subtitle="Per-category profile/source pack and safety budget overrides.">
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-secondary-ink">Category</label>
            <Select
              value={overrideForm.categoryKey}
              onChange={(event) => setOverrideForm((prev) => ({ ...prev, categoryKey: event.target.value }))}
            >
              <option value="">Select category</option>
              {categories.map((category) => (
                <option key={category.id} value={category.categoryKey}>
                  {category.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-secondary-ink">Profile</label>
            <Select
              value={overrideForm.profileId}
              onChange={(event) => setOverrideForm((prev) => ({ ...prev, profileId: event.target.value }))}
            >
              <option value="">Use default</option>
              {profiles.filter((item) => item.isActive).map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.profileKey}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-secondary-ink">Source Pack</label>
            <Select
              value={overrideForm.sourcePackId}
              onChange={(event) => setOverrideForm((prev) => ({ ...prev, sourcePackId: event.target.value }))}
            >
              <option value="">Use request/default</option>
              {sourcePacks
                .filter((item) => item.isActive && (!overrideForm.categoryKey || item.categoryKey === overrideForm.categoryKey))
                .map((pack) => (
                  <option key={pack.id} value={pack.id}>
                    {pack.name}
                  </option>
                ))}
            </Select>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={overrideForm.isEnabled}
              onChange={(event) => setOverrideForm((prev) => ({ ...prev, isEnabled: event.target.checked }))}
            />
            Enabled
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={overrideForm.autoPublish}
              onChange={(event) => setOverrideForm((prev) => ({ ...prev, autoPublish: event.target.checked }))}
            />
            Auto Publish
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={overrideForm.strictMode}
              onChange={(event) => setOverrideForm((prev) => ({ ...prev, strictMode: event.target.checked }))}
            />
            Strict Mode
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={overrideForm.requireCitation}
              onChange={(event) => setOverrideForm((prev) => ({ ...prev, requireCitation: event.target.checked }))}
            />
            Require Citation
          </label>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-secondary-ink">Similarity Threshold</label>
            <Input
              type="number"
              min={0.4}
              max={0.999}
              step="0.001"
              value={overrideForm.similarityThreshold}
              onChange={(event) => setOverrideForm((prev) => ({ ...prev, similarityThreshold: event.target.value }))}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-secondary-ink">Daily Budget (USD)</label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={overrideForm.dailyUsd}
              onChange={(event) => setOverrideForm((prev) => ({ ...prev, dailyUsd: event.target.value }))}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-secondary-ink">Monthly Budget (USD)</label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={overrideForm.monthlyUsd}
              onChange={(event) => setOverrideForm((prev) => ({ ...prev, monthlyUsd: event.target.value }))}
            />
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs font-medium text-secondary-ink">Allowed Types</p>
          <div className="grid gap-2 md:grid-cols-2">
            {QUESTION_TYPES.map((type) => (
              <label key={type.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={overrideForm.allowedTypes.includes(type.id)}
                  onChange={() =>
                    toggleAllowedType(
                      overrideForm.allowedTypes,
                      (next) => setOverrideForm((prev) => ({ ...prev, allowedTypes: next })),
                      type.id
                    )
                  }
                />
                {type.label}
              </label>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <Button loading={isSavingOverride} disabled={!isSuperAdmin} onClick={() => void handleSaveOverride()}>
            Save Override
          </Button>
          <Button
            variant="danger"
            loading={isDeletingOverride}
            disabled={!overrideExists || !isSuperAdmin || isDeletingOverride}
            onClick={() => void handleDeleteOverride()}
          >
            Delete Override
          </Button>
        </div>
      </Section>

      <Section id="ai-run" title="Generate Questions" subtitle="Run now or create scheduled generation jobs.">
        <div className="grid gap-4 md:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-secondary-ink">Category</label>
            <Select
              value={runForm.categoryKey}
              onChange={(event) => setRunForm((prev) => ({ ...prev, categoryKey: event.target.value }))}
            >
              <option value="">Select category</option>
              {categories.map((category) => (
                <option key={category.id} value={category.categoryKey}>
                  {category.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-secondary-ink">Question Count</label>
            <Input
              type="number"
              min={1}
              max={settings.maxQuestionsPerRun}
              value={runForm.count}
              onChange={(event) => setRunForm((prev) => ({ ...prev, count: event.target.value }))}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-secondary-ink">Source Pack</label>
            <Select
              value={runForm.sourcePackId}
              onChange={(event) => setRunForm((prev) => ({ ...prev, sourcePackId: event.target.value }))}
            >
              <option value="">Use category override/default</option>
              {sourcePacks
                .filter((item) => item.isActive && (!runForm.categoryKey || item.categoryKey === runForm.categoryKey))
                .map((pack) => (
                  <option key={pack.id} value={pack.id}>
                    {pack.name}
                  </option>
                ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-secondary-ink">Profile</label>
            <Select
              value={runForm.profileId}
              onChange={(event) => setRunForm((prev) => ({ ...prev, profileId: event.target.value }))}
            >
              <option value="">Use category override/default</option>
              {profiles.filter((item) => item.isActive).map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.profileKey}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={runForm.autoPublish}
              onChange={(event) => setRunForm((prev) => ({ ...prev, autoPublish: event.target.checked }))}
            />
            Auto Publish
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={runForm.strictMode}
              onChange={(event) => setRunForm((prev) => ({ ...prev, strictMode: event.target.checked }))}
            />
            Strict Mode
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={runForm.scheduled}
              onChange={(event) => setRunForm((prev) => ({ ...prev, scheduled: event.target.checked }))}
            />
            Scheduled Job
          </label>
          <Input
            type="number"
            min={5}
            max={10080}
            disabled={!runForm.scheduled}
            value={runForm.scheduleIntervalMinutes}
            onChange={(event) => setRunForm((prev) => ({ ...prev, scheduleIntervalMinutes: event.target.value }))}
            placeholder="Interval (minutes)"
          />
        </div>

        <div>
          <p className="mb-2 text-xs font-medium text-secondary-ink">Allowed Types for this Run</p>
          <div className="grid gap-2 md:grid-cols-2">
            {QUESTION_TYPES.map((type) => (
              <label key={type.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={runForm.allowedTypes.includes(type.id)}
                  onChange={() =>
                    toggleAllowedType(
                      runForm.allowedTypes,
                      (next) => setRunForm((prev) => ({ ...prev, allowedTypes: next })),
                      type.id
                    )
                  }
                />
                {type.label}
              </label>
            ))}
          </div>
        </div>

        <div>
          <Button loading={isRunningGeneration} onClick={() => void handleRunGeneration()}>
            {runForm.scheduled ? 'Create Schedule' : 'Run Generation'}
          </Button>
        </div>
      </Section>

      <Section
        id="ai-jobs"
        title="Generation Jobs"
        subtitle="Recent jobs with run status and output metrics."
        actions={
          <Button variant="secondary" onClick={() => void refreshJobs()}>
            Refresh Jobs
          </Button>
        }
      >
        <div className="grid gap-3 md:grid-cols-2">
          <Input
            placeholder="Search by job, category, or trigger"
            value={jobSearch}
            onChange={(event) => setJobSearch(event.target.value)}
          />
          <Select
            value={jobStatusFilter}
            onChange={(event) => setJobStatusFilter(event.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="running">Running</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="cancelled">Cancelled</option>
          </Select>
        </div>

        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold text-secondary-ink">Job</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-secondary-ink">Category</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-secondary-ink">Status</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-secondary-ink">Counts</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-secondary-ink">Timing</th>
              </tr>
            </thead>
            <tbody>
              {filteredJobs.map((job) => {
                const stats = job.stats || {};
                const imported = typeof stats.imported === 'number' ? stats.imported : 0;
                const queued = typeof stats.queuedForReview === 'number' ? stats.queuedForReview : 0;
                const failed = typeof stats.failed === 'number' ? stats.failed : 0;
                return (
                  <tr key={job.id}>
                    <td className="px-3 py-2 text-sm">
                      <div className="font-medium">{shortId(job.id)}</div>
                      <div className="text-xs text-secondary-ink">{job.triggerType}</div>
                    </td>
                    <td className="px-3 py-2 text-sm">{job.categoryKey}</td>
                    <td className="px-3 py-2 text-sm">{job.status}</td>
                    <td className="px-3 py-2 text-sm">{`imported=${imported}, review=${queued}, failed=${failed}`}</td>
                    <td className="px-3 py-2 text-xs text-secondary-ink">
                      <div>Created: {formatDate(job.createdAt)}</div>
                      <div>Finished: {formatDate(job.finishedAt)}</div>
                      {job.errorSummary && <div className="text-rose-700">Error: {job.errorSummary}</div>}
                    </td>
                  </tr>
                );
              })}
              {filteredJobs.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-sm text-secondary-ink">
                    No jobs match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        id="ai-review"
        title="Review Queue"
        subtitle="Review AI candidates that failed gates or are waiting for manual approval."
        actions={
          <Button variant="secondary" onClick={() => void refreshReviewQueue()}>
            Refresh Queue
          </Button>
        }
      >
        <div className="grid gap-3 md:grid-cols-[1.2fr,0.8fr,auto]">
          <Input
            placeholder="Search text, type, failure reason"
            value={reviewSearch}
            onChange={(event) => setReviewSearch(event.target.value)}
          />
          <Select
            value={reviewCategoryFilter}
            onChange={(event) => setReviewCategoryFilter(event.target.value)}
          >
            <option value="all">All categories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.categoryKey}>
                {category.name}
              </option>
            ))}
          </Select>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={reviewFailuresOnly}
              onChange={(event) => setReviewFailuresOnly(event.target.checked)}
            />
            Failures only
          </label>
        </div>

        <div className="space-y-3">
          {filteredReviewQueue.map((candidate) => {
            const sourcePack = candidate.sourcePackId ? sourcePackById.get(candidate.sourcePackId) : null;
            const profile = candidate.profileId ? profileById.get(candidate.profileId) : null;
            return (
              <div key={candidate.id} className="rounded-xl border border-slate-200 bg-white/80 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-primary-ink">{candidate.questionText || '(No question text)'}</p>
                    <p className="mt-1 text-xs text-secondary-ink">
                      {candidate.categoryKey} | {candidate.questionType} | {candidate.difficulty}
                    </p>
                    <p className="mt-1 text-xs text-secondary-ink">
                      Source: {sourcePack ? sourcePack.name : '-'} | Profile: {profile ? profile.profileKey : '-'}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" loading={reviewActionKey === `${candidate.id}:approve`} onClick={() => void handleApproveCandidate(candidate.id)}>
                      Approve
                    </Button>
                    <Button size="sm" variant="secondary" loading={reviewActionKey === `${candidate.id}:retry`} onClick={() => void handleRetryCandidate(candidate.id)}>
                      Requeue
                    </Button>
                    <Button size="sm" variant="danger" loading={reviewActionKey === `${candidate.id}:reject`} onClick={() => void handleRejectCandidate(candidate.id)}>
                      Reject
                    </Button>
                  </div>
                </div>
                {candidate.failureReasons.length > 0 && (
                  <p className="mt-2 text-xs text-rose-700">Failures: {candidate.failureReasons.join(' | ')}</p>
                )}
                <p className="mt-2 text-xs text-secondary-ink">Created: {formatDate(candidate.createdAt)} | ID: {shortId(candidate.id)}</p>
              </div>
            );
          })}
          {filteredReviewQueue.length === 0 && (
            <p className="text-sm text-secondary-ink">No candidates match the current review filters.</p>
          )}
        </div>
      </Section>
    </div>
  );
}

function AiSummaryCard({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'warning' | 'danger';
}) {
  const toneClass =
    tone === 'danger'
      ? 'border-rose-200 bg-rose-50 text-rose-900'
      : tone === 'warning'
        ? 'border-amber-200 bg-amber-50 text-amber-900'
        : 'border-slate-200 bg-slate-50 text-slate-900';

  return (
    <div className={`rounded-2xl border p-4 ${toneClass}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}
