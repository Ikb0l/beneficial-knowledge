import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, MotionConfig } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { AuthProvider } from './components/AuthProvider';
import { ChallengeModal } from './components/ChallengeModal';
import { PlayMatchModal } from './components/PlayMatchModal';
import { TabBar } from './components/ui';
import { HomeScreen } from './screens/HomeScreen';
import {
  ActiveMatchPopup,
  ReadyCheckOverlay,
  ReconnectLeaveOverlay,
  ResumeMatchPopup,
  ToastContainer,
} from './overlays/GameOverlays';
import { useAuthStore } from './stores/authStore';
import { useCategoryStore } from './stores/categoryStore';
import { useFriendsStore } from './stores/friendsStore';
import { useGameStore } from './stores/gameStore';
import { useNotificationStore } from './stores/notificationStore';
import { useSettingsStore } from './stores/settingsStore';
import { musicManager } from './lib/audio';
import { useViewportMetrics } from './hooks/useViewportMetrics';
import nakama from './shared/lib/nakama';
import { telegram } from './shared/lib/telegram';

type TabId = 'play' | 'leaderboard' | 'tournaments' | 'friends' | 'profile';
type FeatureScreen =
  | 'none'
  | 'settings'
  | 'tournament-detail'
  | 'season'
  | 'notifications'
  | 'donate';

const DonateScreen = lazy(() => import('./components/DonateScreen'));
const FriendsScreen = lazy(() =>
  import('./components/FriendsScreen').then((module) => ({ default: module.FriendsScreen }))
);
const LeaderboardScreen = lazy(() => import('./components/LeaderboardScreen'));
const NotificationsScreen = lazy(() => import('./components/NotificationsScreen'));
const ProfileScreen = lazy(() =>
  import('./components/ProfileScreen').then((module) => ({ default: module.ProfileScreen }))
);
const SeasonScreen = lazy(() => import('./components/SeasonScreen'));
const SettingsScreen = lazy(() => import('./components/SettingsScreen'));
const TournamentDetailScreen = lazy(() => import('./components/TournamentDetailScreen'));
const TournamentsScreen = lazy(() => import('./components/TournamentsScreen'));
const SearchingScreen = lazy(() => import('./components/game/SearchingScreen'));

const CountdownScreen = lazy(() =>
  import('./screens/game/GameScreens').then((module) => ({ default: module.CountdownScreen }))
);
const QuestionScreen = lazy(() =>
  import('./screens/game/GameScreens').then((module) => ({ default: module.QuestionScreen }))
);
const RevealScreen = lazy(() =>
  import('./screens/game/GameScreens').then((module) => ({ default: module.RevealScreen }))
);
const ResultsScreen = lazy(() =>
  import('./screens/game/GameScreens').then((module) => ({ default: module.ResultsScreen }))
);
const ErrorScreen = lazy(() =>
  import('./screens/game/GameScreens').then((module) => ({ default: module.ErrorScreen }))
);

function AppContent() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const {
    phase,
    queueParentCategory,
    queueSubcategories,
    queueAllInCategory,
    queueMode,
    startSearching,
    startPractice,
    setQueueMode,
    selectCategory,
  } = useGameStore();
  const fetchCategories = useCategoryStore((state) => state.fetchCategories);
  const categories = useCategoryStore((state) => state.categories);
  const isCategoriesLoading = useCategoryStore((state) => state.isLoading);
  const categoriesError = useCategoryStore((state) => state.error);
  const {
    pendingChallenge,
    fetchFriends,
    subscribeToPresence,
    unsubscribeFromPresence,
    cleanup: cleanupFriendsStore,
  } = useFriendsStore();
  const [activeTab, setActiveTab] = useState<TabId>('play');
  const [activeFeatureScreen, setActiveFeatureScreen] = useState<FeatureScreen>('none');
  const [selectedTournamentId, setSelectedTournamentId] = useState<string | null>(null);
  const [playModalOpen, setPlayModalOpen] = useState(false);
  const handledStartParamRef = useRef<string>('');
  const { syncNotificationPreferences } = useSettingsStore();
  const isInGamePhase = !['idle', 'selecting'].includes(phase);
  const isTabBarVisible = activeFeatureScreen === 'none' && !isInGamePhase;

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const initializePresence = async () => {
      try {
        await fetchFriends();
      } finally {
        if (!cancelled) {
          subscribeToPresence();
        }
      }
    };

    void initializePresence();

    return () => {
      cancelled = true;
      unsubscribeFromPresence();
      cleanupFriendsStore();
    };
  }, [user, fetchFriends, subscribeToPresence, unsubscribeFromPresence, cleanupFriendsStore]);

  useEffect(() => {
    if (!user) return;
    void fetchCategories();
  }, [user, fetchCategories]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const pingOnline = async () => {
      if (cancelled) return;
      try {
        await nakama.rpc('online_ping', {});
      } catch {
        // Ignore ping failures
      }
    };
    pingOnline();
    const interval = setInterval(pingOnline, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [user]);

  useEffect(() => {
    if (phase !== 'idle' && phase !== 'selecting') return;
    if (categories.length === 0) return;

    if (queueParentCategory && !categories.some((category) => category.id === queueParentCategory)) {
      const fallbackParent = categories.find((category) => category.parentId == null)?.id || categories[0].id;
      selectCategory(fallbackParent, [], true);
      return;
    }

    if (queueParentCategory && !queueAllInCategory) {
      const validSubIds = queueSubcategories.filter((subId) => (
        categories.some((category) => category.id === subId && category.parentId === queueParentCategory)
      ));
      if (validSubIds.length !== queueSubcategories.length || validSubIds.length === 0) {
        selectCategory(queueParentCategory, validSubIds, validSubIds.length === 0);
      }
    }
  }, [categories, queueParentCategory, queueSubcategories, queueAllInCategory, phase, selectCategory]);

  useEffect(() => {
    if (!user) return;
    const startParam = telegram.startParam.trim();
    if (!startParam || handledStartParamRef.current === startParam) return;
    handledStartParamRef.current = startParam;

    const extractPayload = (value: string, prefix: string): string => (
      value.indexOf(prefix) === 0 ? value.substring(prefix.length).trim() : ''
    );

    const tournamentId = extractPayload(startParam, 't_') || extractPayload(startParam, 'tournament:');
    if (tournamentId) {
      setActiveTab('tournaments');
      setSelectedTournamentId(tournamentId);
      setActiveFeatureScreen('tournament-detail');
      telegram.clearStartParamFromUrl();
      return;
    }

    const categoryId = extractPayload(startParam, 'c_') || extractPayload(startParam, 'category:');
    if (categoryId) {
      setActiveTab('play');
      setActiveFeatureScreen('none');
      selectCategory(categoryId, [], true);
      setPlayModalOpen(true);
      telegram.clearStartParamFromUrl();
      return;
    }

    if (startParam === 'o_live' || startParam === 'online:live') {
      setActiveTab('play');
      setActiveFeatureScreen('none');
      setPlayModalOpen(true);
      telegram.clearStartParamFromUrl();
    }
  }, [user, selectCategory]);

  // Subscribe to real-time notifications
  const { subscribeToNotifications, fetchNotifications } = useNotificationStore();
  useEffect(() => {
    if (!user) return;
    subscribeToNotifications();
    void fetchNotifications();
  }, [user, subscribeToNotifications, fetchNotifications]);

  useEffect(() => {
    if (!user) return;
    void syncNotificationPreferences();
  }, [user, syncNotificationPreferences]);

  useEffect(() => {
    if (phase === 'searching' || phase === 'matched' || phase === 'countdown') {
      void import('./components/game/SearchingScreen');
      void import('./screens/game/GameScreens');
    }
  }, [phase]);

  const handlePlayConfirm = useCallback(
    (selection: { parentCategory: string; subcategories: string[]; allInCategory: boolean; mode: 'ranked' | 'practice' }) => {
      selectCategory(selection.parentCategory, selection.subcategories, selection.allInCategory);
      setQueueMode(selection.mode);
      setPlayModalOpen(false);
      if (selection.mode === 'practice') {
        void startPractice();
      } else {
        void startSearching();
      }
    },
    [selectCategory, setQueueMode, startSearching, startPractice]
  );

  const openPlayModal = useCallback(() => {
    setPlayModalOpen(true);
    void fetchCategories({ force: true });
  }, [fetchCategories]);

  const retryLoadCategories = useCallback(() => {
    void fetchCategories({ force: true });
  }, [fetchCategories]);

  useEffect(() => {
    const isMatchActive = ['matched', 'countdown', 'question', 'reveal'].includes(phase);
    if (isMatchActive && activeFeatureScreen !== 'none') {
      setActiveFeatureScreen('none');
      setSelectedTournamentId(null);
    }
  }, [phase, activeFeatureScreen]);

  useEffect(() => {
    if (activeFeatureScreen === 'tournament-detail' && !selectedTournamentId) {
      setActiveFeatureScreen('none');
      setActiveTab('tournaments');
    }
  }, [activeFeatureScreen, selectedTournamentId]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (isTabBarVisible) {
      document.documentElement.style.removeProperty('--tabbar-offset');
      return;
    }
    document.documentElement.style.setProperty('--tabbar-offset', '0px');
  }, [isTabBarVisible]);

  // Handle challenge acceptance - join the match
  const handleChallengeAccepted = async (matchId: string): Promise<void> => {
    const gameStore = useGameStore.getState();

    // Prevent double-join race condition
    if (gameStore.matchJoinInProgress || gameStore.matchId === matchId) {
      console.warn('Challenge join already in progress or already in match');
      return;
    }
    try {
      await gameStore.joinDirectMatch(matchId);
    } catch (error) {
      console.error('Error joining challenge match:', error);
      throw error;
    }
  };

  if (!user) {
    return <AppLoadingScreen label={t('common.loading')} />;
  }

  // Handle feature screen navigation
  const handleOpenTournamentDetail = (tournamentId: string) => {
    setSelectedTournamentId(tournamentId);
    setActiveFeatureScreen('tournament-detail');
  };

  const renderFeatureScreen = () => {
    switch (activeFeatureScreen) {
      case 'settings':
        return (
          <Suspense fallback={<AppLoadingScreen label={t('loading.settings')} />}>
            <SettingsScreen onBack={() => setActiveFeatureScreen('none')} />
          </Suspense>
        );
      case 'tournament-detail':
        if (!selectedTournamentId) return null;
        return (
          <Suspense fallback={<AppLoadingScreen label={t('loading.tournamentDetail')} />}>
            <TournamentDetailScreen
              tournamentId={selectedTournamentId}
              onBack={() => {
                setActiveFeatureScreen('none');
                setSelectedTournamentId(null);
                setActiveTab('tournaments');
              }}
            />
          </Suspense>
        );
      case 'season':
        return (
          <Suspense fallback={<AppLoadingScreen label={t('loading.season')} />}>
            <SeasonScreen onBack={() => setActiveFeatureScreen('none')} />
          </Suspense>
        );
      case 'notifications':
        return (
          <Suspense fallback={<AppLoadingScreen label={t('loading.notifications')} />}>
            <NotificationsScreen
              onBack={() => setActiveFeatureScreen('none')}
              onOpenTournament={handleOpenTournamentDetail}
            />
          </Suspense>
        );
      case 'donate':
        return (
          <Suspense fallback={<AppLoadingScreen label={t('common.loading')} />}>
            <DonateScreen onBack={() => setActiveFeatureScreen('none')} />
          </Suspense>
        );
      default:
        return null;
    }
  };

  // Render feature screens with global overlays
  if (activeFeatureScreen !== 'none') {
    return (
      <>
        {renderFeatureScreen()}
        <ReconnectLeaveOverlay />
        <ReadyCheckOverlay />
        <ActiveMatchPopup />
        <ResumeMatchPopup />
        <ToastContainer />

        {/* Challenge Modal - shows when friend sends a challenge */}
        {pendingChallenge && (
          <ChallengeModal onAccept={handleChallengeAccepted} />
        )}
      </>
    );
  }

  const isInGame = isInGamePhase;

  if (isInGame) {
    return (
      <>
        <AnimatePresence mode="wait">
          {phase === 'searching' || phase === 'matched' ? (
            <Suspense key="searching" fallback={<AppLoadingScreen label={t('loading.match')} />}>
              <SearchingScreen />
            </Suspense>
          ) : phase === 'countdown' ? (
            <Suspense key="countdown" fallback={<AppLoadingScreen label={t('loading.match')} />}>
              <CountdownScreen />
            </Suspense>
          ) : phase === 'question' ? (
            <Suspense key="question" fallback={<AppLoadingScreen label={t('loading.question')} />}>
              <QuestionScreen />
            </Suspense>
          ) : phase === 'reveal' ? (
            <Suspense key="reveal" fallback={<AppLoadingScreen label={t('loading.reveal')} />}>
              <RevealScreen />
            </Suspense>
          ) : phase === 'ended' ? (
            <Suspense key="results" fallback={<AppLoadingScreen label={t('loading.results')} />}>
              <ResultsScreen />
            </Suspense>
          ) : phase === 'error' ? (
            <Suspense key="error" fallback={<AppLoadingScreen label={t('common.loading')} />}>
              <ErrorScreen />
            </Suspense>
          ) : null}
        </AnimatePresence>
        <ReconnectLeaveOverlay />
        <ReadyCheckOverlay />
        <ActiveMatchPopup />
        <ResumeMatchPopup />
        <ToastContainer />
      </>
    );
  }

  const renderTabContent = () => {
    switch (activeTab) {
      case 'play':
        return (
          <HomeScreen
            key="home"
            onOpenSettings={() => setActiveFeatureScreen('settings')}
            onOpenTournaments={() => setActiveTab('tournaments')}
            onOpenTournamentDetail={handleOpenTournamentDetail}
            onOpenNotifications={() => setActiveFeatureScreen('notifications')}
          />
        );
      case 'leaderboard':
        return (
          <Suspense key="leaderboard" fallback={<AppLoadingScreen label={t('loading.leaderboard')} />}>
            <LeaderboardScreen onBack={() => setActiveTab('play')} />
          </Suspense>
        );
      case 'tournaments':
        return (
          <Suspense key="tournaments" fallback={<AppLoadingScreen label={t('loading.tournaments')} />}>
            <TournamentsScreen
              onBack={() => setActiveTab('play')}
              onViewTournament={handleOpenTournamentDetail}
            />
          </Suspense>
        );
      case 'profile':
        return (
          <Suspense key="profile" fallback={<AppLoadingScreen label={t('loading.profile')} />}>
            <ProfileScreen
              onBack={() => setActiveTab('play')}
              onOpenSettings={() => setActiveFeatureScreen('settings')}
              onOpenPlay={() => {
                setActiveTab('play');
                void openPlayModal();
              }}
            />
          </Suspense>
        );
      case 'friends':
        return (
          <Suspense key="friends" fallback={<AppLoadingScreen label={t('loading.friends')} />}>
            <FriendsScreen onBack={() => setActiveTab('play')} />
          </Suspense>
        );
      default:
        return (
          <HomeScreen
            key="home"
            onOpenSettings={() => setActiveFeatureScreen('settings')}
            onOpenTournaments={() => setActiveTab('tournaments')}
            onOpenTournamentDetail={handleOpenTournamentDetail}
            onOpenNotifications={() => setActiveFeatureScreen('notifications')}
          />
        );
    }
  };

  return (
    <>
      <div className="app-container no-x-overflow">
        {renderTabContent()}
      </div>
      <TabBar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        playButtonEnabled
        onPlayPress={() => {
          setActiveTab('play');
          void openPlayModal();
        }}
        showFloatingPlay
      />
      <PlayMatchModal
        open={playModalOpen}
        categories={categories}
        isLoadingCategories={isCategoriesLoading}
        categoriesError={categoriesError}
        selectedParentCategoryId={queueParentCategory}
        selectedSubcategoryIds={queueSubcategories}
        selectedAllInCategory={queueAllInCategory}
        selectedMode={queueMode}
        onRetryLoad={retryLoadCategories}
        onClose={() => setPlayModalOpen(false)}
        onConfirm={handlePlayConfirm}
      />
      <ReconnectLeaveOverlay />
      <ReadyCheckOverlay />
      <ActiveMatchPopup />
      <ResumeMatchPopup />
      <ToastContainer />

      {/* Challenge Modal - shows when friend sends a challenge */}
      {pendingChallenge && (
        <ChallengeModal onAccept={handleChallengeAccepted} />
      )}
    </>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}

export default App;

function AppShell() {
  const settings = useSettingsStore((state) => state.settings);
  useViewportMetrics();

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.classList.toggle('reduced-motion', settings.reducedMotion);
    root.classList.toggle('high-contrast', settings.highContrast);
  }, [settings.reducedMotion, settings.highContrast]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (settings.musicEnabled) {
      musicManager.setVolume(settings.musicVolume);
      musicManager.setEnabled(!document.hidden);
    } else {
      musicManager.setEnabled(false);
    }
  }, [settings.musicEnabled, settings.musicVolume]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const handleVisibility = () => {
      if (document.hidden) {
        musicManager.pause();
      } else if (settings.musicEnabled) {
        musicManager.play();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [settings.musicEnabled]);

  return (
    <MotionConfig reducedMotion={settings.reducedMotion ? 'always' : 'never'}>
      <AppContent />
    </MotionConfig>
  );
}

function AppLoadingScreen({ label }: { label?: string }) {
  const { t } = useTranslation();
  const resolvedLabel = label || t('common.loading');

  return (
    <div className="min-h-viewport bg-gradient-main flex items-center justify-center p-6" role="status" aria-live="polite">
      <div className="text-center">
        <div className="mx-auto h-10 w-10 rounded-full border-2 border-white/15 border-t-accent-teal animate-spin" />
        <p className="mt-4 text-sm text-text-secondary">{resolvedLabel}</p>
      </div>
    </div>
  );
}




