// Admin auth and permission types
export type AdminRoleKey = 'admin' | 'super_admin';

export type AdminCapability =
  | 'dashboard.view'
  | 'questions.view'
  | 'questions.create'
  | 'questions.update'
  | 'questions.delete'
  | 'questions.import'
  | 'questions.export'
  | 'users.view'
  | 'users.adjust_mmr'
  | 'users.ban'
  | 'users.unban'
  | 'matches.view'
  | 'categories.view'
  | 'categories.manage'
  | 'tournaments.view'
  | 'tournaments.create'
  | 'tournaments.update'
  | 'tournaments.start'
  | 'tournaments.cancel'
  | 'tournaments.delete'
  | 'tournaments.pause'
  | 'tournaments.resume'
  | 'tournaments.manage_participants'
  | 'tournaments.shuffle_seeds'
  | 'tournaments.repair'
  | 'seasons.view'
  | 'seasons.create'
  | 'seasons.end'
  | 'analytics.view'
  | 'home_control.view'
  | 'game_settings.view'
  | 'game_settings.update'
  | 'rank_tiers.view'
  | 'rank_tiers.manage'
  | 'referral_codes.view'
  | 'referral_codes.manage'
  | 'ai_questions.view'
  | 'ai_questions.manage'
  | 'audit.view'
  | 'ranked.reset';

export interface AdminAuthResponse {
  isAdmin: boolean;
  adminLevel: AdminRoleKey;
  roleKey: AdminRoleKey;
  userId: string;
  telegramId: number;
  displayName: string;
  capabilities: AdminCapability[];
  featureFlags: string[];
}

// Admin user types
export interface AdminUser {
  id: string;
  telegramId: number;
  adminLevel: AdminRoleKey;
  displayName: string;
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

// Question types
export type QuestionType =
  | 'mcq'
  | 'true_false'
  | 'true_false_not_given'
  | 'heading_match';

export interface Question {
  id: string;
  category: string;
  difficulty: 'easy' | 'medium' | 'hard';
  questionText: string;
  options: string[];
  questionType?: QuestionType;
  correctIndex: number;
  explanation: string;
  sourceReference?: string;
  timesShown: number;
  timesCorrect: number;
  averageAnswerTimeMs: number;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
}

export interface QuestionInput {
  category: string;
  difficulty: 'easy' | 'medium' | 'hard';
  questionText: string;
  options: string[];
  questionType?: QuestionType;
  correctIndex: number;
  explanation: string;
  sourceReference?: string;
}

// User types
export interface User {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  telegramId: number;
  mmr: number;
  rankTier: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
  isBanned: boolean;
  createdAt: string;
  lastActiveAt: string;
}

export interface UserDetail extends User {
  peakMmr: number;
  totalScore: number;
  averageScore: number;
  bestStreak: number;
  categoryStats: Record<string, {
    mmr: number;
    gamesPlayed: number;
    wins: number;
  }>;
  recentMatches: MatchSummary[];
  banHistory: Ban[];
  mmrHistory: MmrAdjustment[];
}

// Match types
export interface MatchSummary {
  matchId: string;
  category: string;
  player1Id: string;
  player1Name: string;
  player1Score: number;
  player2Id: string;
  player2Name: string;
  player2Score: number;
  winnerId: string | null;
  completedAt: string;
}

export interface MatchDetail extends MatchSummary {
  player1MmrBefore: number;
  player1MmrAfter: number;
  player2MmrBefore: number;
  player2MmrAfter: number;
  durationSeconds: number;
  questionsData: {
    questionId: string;
    questionText: string;
    correctIndex: number;
    player1Answer: number | null;
    player1TimeMs: number | null;
    player2Answer: number | null;
    player2TimeMs: number | null;
  }[];
}

// Category types
export type CategoryType = 'normal' | 'vocabulary';

export interface Category {
  id: string;
  categoryKey: string;
  name: string;
  icon: string;
  iconUrl?: string;
  description?: string;
  parentId?: string;
  categoryType: CategoryType;
  isActive: boolean;
  minQuestionsRequired: number;
  questionsPerMatch: number;
  questionsPerMatchOverride?: number | null;
  useGlobalQuestionCount: boolean;
  timePerQuestion: number;
  displayOrder: number;
  questionCount: number;
  easyCount: number;
  mediumCount: number;
  hardCount: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface CategoryInput {
  categoryKey: string;
  name: string;
  description?: string;
  icon?: string;
  iconUrl?: string;
  parentId?: string;
  categoryType?: CategoryType;
  minQuestionsRequired?: number;
  questionsPerMatch?: number;
  useGlobalQuestionCount?: boolean;
  timePerQuestion?: number;
  isActive?: boolean;
  displayOrder?: number;
}

// Rank Tier types
export interface RankTier {
  id: string;
  tierKey: string;
  name: string;
  minMmr: number;
  maxMmr: number;
  iconUrl?: string;
  color?: string;
  displayOrder: number;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface RankTierInput {
  tierKey: string;
  name: string;
  minMmr: number;
  maxMmr: number;
  iconUrl?: string;
  color?: string;
  displayOrder?: number;
  isActive?: boolean;
}

// Home Page Control types
export interface HomeBanner {
  id: string;
  title: string;
  body?: string;
  imageUrl?: string;
  actionUrl?: string;
  actionType: 'url' | 'category' | 'tournament' | 'screen';
  actionData?: Record<string, unknown>;
  startDate?: string;
  endDate?: string;
  displayOrder: number;
  isActive: boolean;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface HomeBannerInput {
  title: string;
  body?: string;
  imageUrl?: string;
  actionUrl?: string;
  actionType?: string;
  actionData?: Record<string, unknown>;
  startDate?: string;
  endDate?: string;
  displayOrder?: number;
  isActive?: boolean;
}

export interface HomeSection {
  id: string;
  sectionKey: string;
  name: string;
  isVisible: boolean;
  displayOrder: number;
  config: Record<string, unknown>;
  updatedAt?: string;
}

export interface FeaturedItem {
  id: string;
  itemType: 'category' | 'tournament';
  itemId: string;
  itemName?: string;
  categoryKey?: string;
  categoryIcon?: string;
  tournamentStatus?: string;
  displayOrder: number;
  isActive: boolean;
  startDate?: string;
  endDate?: string;
  createdAt?: string;
}

// Audit Log types
export interface AuditLogEntry {
  id: string;
  adminId: string;
  adminName: string;
  adminTelegramId: number;
  actionType: string;
  targetType?: string;
  targetId?: string;
  oldValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

// Ban types
export interface Ban {
  id: string;
  userId: string;
  username: string;
  telegramId: number;
  bannedBy: string;
  bannedByName: string;
  reason: string;
  isPermanent: boolean;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
  unbannedAt: string | null;
  unbannedBy: string | null;
}

// MMR Adjustment types
export interface MmrAdjustment {
  id: string;
  userId: string;
  adjustedBy: string;
  adjustedByName: string;
  oldMmr: number;
  newMmr: number;
  reason: string;
  createdAt: string;
}

// Dashboard types
export interface DashboardStats {
  totalUsers: number;
  activeUsers24h: number;
  totalMatches: number;
  matchesToday: number;
  totalQuestions: number;
  activeCategories: number;
  bannedUsers: number;
  newUsersToday: number;
}

export interface ActivityData {
  date: string;
  matches: number;
  users: number;
  newUsers: number;
}

// AI Question Generation types
export interface AiGenerationSettings {
  enabled: boolean;
  killSwitch: boolean;
  autoPublish: boolean;
  strictMode: boolean;
  maxQuestionsPerRun: number;
  maxInputTokensPerRun: number;
  maxOutputTokensPerRun: number;
  dailyBudgetUsd: number;
  monthlyBudgetUsd: number;
  similarityThreshold: number;
  requireCitation: boolean;
  defaultLanguage: string;
  allowedQuestionTypes: QuestionType[];
  defaultProfileKey: string;
}

export interface AiCategoryOverride {
  id: string;
  categoryKey: string;
  isEnabled: boolean;
  profileId: string | null;
  sourcePackId: string | null;
  overrideConfig: Record<string, unknown>;
  budgets: Record<string, unknown>;
  updatedBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AiProviderProfile {
  id: string;
  profileKey: string;
  providerKey: string;
  credentialProviderKey: string;
  endpointUrl: string;
  model: string;
  temperature: number;
  topP: number;
  maxTokens: number;
  timeoutMs: number;
  maxRetries: number;
  isDefault: boolean;
  isActive: boolean;
  config: Record<string, unknown>;
  budgets: Record<string, unknown>;
}

export interface AiSourcePack {
  id: string;
  packKey: string;
  categoryKey: string;
  name: string;
  description: string;
  language: string;
  status: 'active' | 'archived';
  isActive: boolean;
  documentCount: number;
  chunkCount: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface AiGenerationJob {
  id: string;
  requestedBy: string;
  triggerType: 'manual' | 'scheduled' | 'retry';
  status: 'scheduled' | 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  categoryKey: string;
  sourcePackId: string | null;
  sourcePackKey: string | null;
  profileId: string | null;
  profileKey: string | null;
  questionTargetCount: number;
  autoPublish: boolean;
  strictMode: boolean;
  allowedQuestionTypes: QuestionType[];
  scheduleIntervalMinutes: number | null;
  nextRunAt: string | null;
  lastRunAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  stats: Record<string, unknown>;
  errorSummary: string;
  createdAt: string;
  updatedAt: string;
}

export interface AiGeneratedCandidate {
  id: string;
  jobId: string | null;
  categoryKey: string;
  sourcePackId: string | null;
  profileId: string | null;
  status: 'needs_review' | 'rejected' | 'published' | 'invalid' | 'approved';
  question: {
    category?: string;
    difficulty?: 'easy' | 'medium' | 'hard';
    questionType?: QuestionType;
    questionText?: string;
    options?: string[];
    correctIndex?: number;
    explanation?: string;
    sourceReference?: string;
    citations?: Array<{ chunkId: string; quote: string }>;
  };
  questionType: QuestionType;
  questionText: string;
  options: string[];
  correctIndex: number;
  difficulty: 'easy' | 'medium' | 'hard';
  explanation: string;
  sourceReference: string;
  citations: Array<{ chunkId: string; quote: string }>;
  gateReport: Record<string, unknown>;
  failureReasons: string[];
  normalizedQuestionText: string;
  publishedQuestionId: string | null;
  createdBy: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  sourcePackKey?: string | null;
  profileKey?: string | null;
}

// Pagination
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// API Response types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// Tournament types
export type TournamentStatus = 'upcoming' | 'registration' | 'in_progress' | 'paused' | 'completed' | 'cancelled';
export type ParticipantStatus = 'registered' | 'active' | 'eliminated' | 'disqualified' | 'forfeited' | 'winner';
