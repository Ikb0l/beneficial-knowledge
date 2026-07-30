import { matchPath } from 'react-router-dom';
import type { AdminCapability } from '../types';

export type AdminRouteSection = 'main' | 'settings';

export interface AdminRouteDefinition {
  path: string;
  navPath?: string;
  label: string;
  shortLabel?: string;
  subtitle: string;
  section: AdminRouteSection;
  keywords: string[];
  requiredCapabilities?: AdminCapability[];
}

export const ADMIN_ROUTES: AdminRouteDefinition[] = [
  {
    path: '/dashboard',
    label: 'Dashboard',
    subtitle: 'Operations snapshot for the platform',
    section: 'main',
    keywords: ['overview', 'health', 'operations'],
    requiredCapabilities: ['dashboard.view'],
  },
  {
    path: '/jobs',
    label: 'Jobs',
    subtitle: 'Monitor long-running admin work and queued actions',
    section: 'main',
    keywords: ['jobs', 'operations', 'queue'],
    requiredCapabilities: ['audit.view'],
  },
  {
    path: '/tournaments',
    label: 'Tournaments',
    subtitle: 'Create tournaments and manage live operations',
    section: 'main',
    keywords: ['bracket', 'participants', 'events'],
    requiredCapabilities: ['tournaments.view'],
  },
  {
    path: '/tournaments/:id',
    navPath: '/tournaments',
    label: 'Tournament Detail',
    shortLabel: 'Detail',
    subtitle: 'Inspect bracket state and intervene safely',
    section: 'main',
    keywords: ['tournament', 'match incidents'],
    requiredCapabilities: ['tournaments.view'],
  },
  {
    path: '/seasons',
    label: 'Seasons',
    subtitle: 'Manage ranked seasons and resets',
    section: 'main',
    keywords: ['ranked', 'season'],
    requiredCapabilities: ['seasons.view'],
  },
  {
    path: '/questions',
    label: 'Questions',
    subtitle: 'Question library, imports, and quality control',
    section: 'main',
    keywords: ['content', 'library', 'review'],
    requiredCapabilities: ['questions.view'],
  },
  {
    path: '/questions/new',
    navPath: '/questions',
    label: 'New Question',
    shortLabel: 'New',
    subtitle: 'Create a new question with guardrails',
    section: 'main',
    keywords: ['question create'],
    requiredCapabilities: ['questions.create'],
  },
  {
    path: '/questions/:id',
    navPath: '/questions',
    label: 'Question Detail',
    shortLabel: 'Detail',
    subtitle: 'Inspect and update question content',
    section: 'main',
    keywords: ['question edit'],
    requiredCapabilities: ['questions.view'],
  },
  {
    path: '/users',
    label: 'Users',
    subtitle: 'Support console for player accounts',
    section: 'main',
    keywords: ['accounts', 'support'],
    requiredCapabilities: ['users.view'],
  },
  {
    path: '/users/:id',
    navPath: '/users',
    label: 'User Detail',
    shortLabel: 'Detail',
    subtitle: 'Inspect profile, sanctions, and interventions',
    section: 'main',
    keywords: ['player support', 'profile'],
    requiredCapabilities: ['users.view'],
  },
  {
    path: '/matches',
    label: 'Matches',
    subtitle: 'Inspect historical match outcomes',
    section: 'main',
    keywords: ['history', 'games'],
    requiredCapabilities: ['matches.view'],
  },
  {
    path: '/matches/:id',
    navPath: '/matches',
    label: 'Match Detail',
    shortLabel: 'Detail',
    subtitle: 'Inspect per-question match details',
    section: 'main',
    keywords: ['match detail'],
    requiredCapabilities: ['matches.view'],
  },
  {
    path: '/analytics',
    label: 'Analytics',
    subtitle: 'Performance and retention trends',
    section: 'main',
    keywords: ['metrics', 'retention', 'growth'],
    requiredCapabilities: ['analytics.view'],
  },
  {
    path: '/bans',
    label: 'Bans',
    subtitle: 'Active and historical sanctions',
    section: 'main',
    keywords: ['sanctions', 'moderation'],
    requiredCapabilities: ['users.view'],
  },
  {
    path: '/categories',
    label: 'Categories',
    subtitle: 'Manage topic taxonomy and match settings',
    section: 'settings',
    keywords: ['taxonomy', 'topics'],
    requiredCapabilities: ['categories.view'],
  },
  {
    path: '/rank-tiers',
    label: 'Rank Tiers',
    subtitle: 'Configure rating tier thresholds',
    section: 'settings',
    keywords: ['rank', 'mmr'],
    requiredCapabilities: ['rank_tiers.view'],
  },
  {
    path: '/referral-codes',
    label: 'Referral Codes',
    subtitle: 'Manage acquisition and referral offers',
    section: 'settings',
    keywords: ['referral', 'growth'],
    requiredCapabilities: ['referral_codes.view'],
  },
  {
    path: '/ai-questions',
    label: 'AI Questions',
    subtitle: 'Review AI generation settings, jobs, and queue',
    section: 'settings',
    keywords: ['ai', 'generation', 'review'],
    requiredCapabilities: ['ai_questions.view'],
  },
  {
    path: '/game-settings',
    label: 'Game Settings',
    subtitle: 'Gameplay configuration and maintenance controls',
    section: 'settings',
    keywords: ['config', 'pacing', 'settings'],
    requiredCapabilities: ['game_settings.view'],
  },
  {
    path: '/home-control',
    label: 'Home Control',
    subtitle: 'Visual composer for banners, sections, and featured content',
    section: 'settings',
    keywords: ['home', 'content', 'composer'],
    requiredCapabilities: ['home_control.view'],
  },
  {
    path: '/audit-log',
    label: 'Audit Log',
    subtitle: 'Searchable record of admin actions',
    section: 'settings',
    keywords: ['audit', 'history', 'jobs'],
    requiredCapabilities: ['audit.view'],
  },
];

export function getAdminRouteMatch(pathname: string): AdminRouteDefinition | null {
  for (const route of ADMIN_ROUTES) {
    if (matchPath({ path: route.path, end: true }, pathname)) {
      return route;
    }
  }
  return null;
}

export function getAdminRouteNavGroups() {
  return {
    main: ADMIN_ROUTES.filter((route) => route.section === 'main' && route.navPath === undefined && !route.path.includes(':')),
    settings: ADMIN_ROUTES.filter((route) => route.section === 'settings' && route.navPath === undefined && !route.path.includes(':')),
  };
}
