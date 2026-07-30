// AuthProvider component - Handles authentication flow
import { useEffect, useState, type ReactNode } from 'react';
import { useAuthStore } from '../stores/authStore';
import { telegram } from '../shared/lib/telegram';
import { nakama } from '../shared/lib/nakama';
import { LoginPage } from '../pages/LoginPage';

interface AuthProviderProps {
  children: ReactNode;
}

const BRIDGE_QUERY_KEYS = [
  'bridgeUserId',
  'quizzyUserId',
  'bridgeDisplayName',
  'displayName',
  'email',
  'bridgeToken',
  'source',
];

function getBridgeParamsFromUrl(): { bridgeUserId: string | null; displayName: string | null } {
  const params = new URLSearchParams(window.location.search);
  return {
    bridgeUserId: params.get('bridgeUserId') || params.get('quizzyUserId'),
    displayName: params.get('bridgeDisplayName') || params.get('displayName') || params.get('email'),
  };
}

function clearBridgeParamsFromUrl(): void {
  const url = new URL(window.location.href);
  BRIDGE_QUERY_KEYS.forEach((key) => url.searchParams.delete(key));
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
}

export function AuthProvider({ children }: AuthProviderProps) {
  const {
    isAuthenticated,
    isLoading,
    error,
    showLoginPage,
    authenticate,
    clearError,
    checkStoredSession,
    setShowLoginPage,
    bridgeLogin,
  } = useAuthStore();

  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    const initAuth = async () => {
      // Check if we're in Telegram
      const isTelegram = telegram.isAvailable && telegram.initData;

      if (isTelegram) {
        // Telegram flow - use existing authenticate()
        const sessionValid = nakama.isAuthenticated();
        if (!isAuthenticated || !sessionValid) {
          telegram.expand();
          authenticate();
        }
      } else {
        const { bridgeUserId, displayName } = getBridgeParamsFromUrl();
        if (bridgeUserId) {
          try {
            await bridgeLogin(bridgeUserId, displayName || undefined);
            clearBridgeParamsFromUrl();
            setInitialized(true);
            return;
          } catch (bridgeError) {
            console.error('Bridge login failed:', bridgeError);
            clearBridgeParamsFromUrl();
          }
        }

        // Web flow - check for stored session first
        const hasSession = await checkStoredSession();
        if (!hasSession) {
          // No stored session, show login page
          setShowLoginPage(true);
        }
      }
      setInitialized(true);
    };

    if (!initialized && !isLoading) {
      initAuth();
    }
  }, [initialized, isLoading, isAuthenticated, authenticate, checkStoredSession, setShowLoginPage, bridgeLogin]);

  // Loading state (initial load)
  if (!initialized || isLoading) {
    return <LoadingScreen />;
  }

  // Show login page for web users without session
  if (showLoginPage && !isAuthenticated) {
    return <LoginPage />;
  }

  // Error state (for Telegram auth errors)
  if (error && !showLoginPage) {
    const isTelegram = telegram.isAvailable && telegram.initData;
    if (isTelegram) {
      return <ErrorScreen error={error} onRetry={() => { clearError(); authenticate(); }} />;
    }
    // For web, show login page with error
    return <LoginPage />;
  }

  // Not authenticated yet (initial load)
  if (!isAuthenticated) {
    return <LoadingScreen />;
  }

  return <>{children}</>;
}

function LoadingScreen() {
  return (
    <div className="min-h-viewport bg-gradient-main flex items-center justify-center p-6" role="status" aria-live="polite">
      <div className="text-center">
        <div className="mx-auto h-12 w-12 rounded-full border-4 border-white/20 border-t-accent-teal animate-spin" />
        <h2 className="mt-6 font-display text-xl font-bold text-white">Beneficial Knowledge</h2>
        <p className="mt-1 text-sm text-text-secondary">Loading…</p>
      </div>
    </div>
  );
}

interface ErrorScreenProps {
  error: string;
  onRetry: () => void;
}

function ErrorScreen({ error, onRetry }: ErrorScreenProps) {
  return (
    <div className="min-h-viewport bg-gradient-main flex items-center justify-center p-6" role="alert" aria-live="assertive">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border-2 border-feedback-wrong/60 bg-feedback-wrong/15 text-feedback-wrong text-2xl font-black">
          !
        </div>
        <h2 className="mt-5 font-display text-xl font-bold text-white">Connection Error</h2>
        <p className="mt-2 text-sm text-text-secondary leading-relaxed">{error}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-feedback-wrong px-5 py-3 font-semibold text-white shadow-glow-wrong hover:bg-feedback-wrong/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-feedback-wrong/60"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}

export default AuthProvider;
