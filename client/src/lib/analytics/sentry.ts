// Sentry Error Tracking Configuration
// Initialize Sentry for error monitoring and performance tracking

import * as Sentry from '@sentry/react';

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN || '';
const SENTRY_ENVIRONMENT = import.meta.env.MODE || 'development';
const APP_VERSION = import.meta.env.VITE_APP_VERSION || '1.0.0';

// Initialize Sentry
export function initSentry(): void {
  if (!SENTRY_DSN) {
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: SENTRY_ENVIRONMENT,
    release: `beneficial-knowledge@${APP_VERSION}`,

    // Performance Monitoring
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        // Mask all text content for privacy
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],

    // Set tracesSampleRate to 1.0 to capture 100% of transactions for performance monitoring.
    // Adjust in production to a lower rate to avoid excessive data.
    tracesSampleRate: SENTRY_ENVIRONMENT === 'production' ? 0.2 : 1.0,

    // Capture Replay for 10% of sessions (adjust as needed)
    replaysSessionSampleRate: SENTRY_ENVIRONMENT === 'production' ? 0.1 : 0,
    replaysOnErrorSampleRate: 1.0, // Always capture replay for errors

    // Filter events before sending
    beforeSend(event: Sentry.ErrorEvent | null) {
      // Don't send events in development unless configured
      if (SENTRY_ENVIRONMENT === 'development' && !import.meta.env.VITE_SENTRY_DEV) {
        return null;
      }

      if (!event) {
        return null;
      }

      // Filter out known non-critical errors
      if (event.exception?.values?.[0]?.value?.includes('ResizeObserver loop')) {
        return null;
      }

      return event;
    },
  });
}

// Set user context when authenticated
export function setUser(userId: string, username?: string, telegramId?: number): void {
  Sentry.setUser({
    id: userId,
    username: username,
    telegram_id: telegramId?.toString(),
  });
}

// Clear user context on logout
export function clearUser(): void {
  Sentry.setUser(null);
}

// Track custom event
export function trackEvent(name: string, data?: Record<string, unknown>): void {
  Sentry.addBreadcrumb({
    category: 'event',
    message: name,
    data,
    level: 'info',
  });
}

// Track game events
export const gameEvents = {
  matchStart: (category: string, isRanked: boolean): void => {
    trackEvent('match_start', { category, isRanked });
  },

  matchEnd: (winnerId: string | null, isDraw: boolean, reason?: string): void => {
    trackEvent('match_end', { winnerId, isDraw, reason });
  },

  answerSubmitted: (questionNumber: number, timeMs: number, isCorrect: boolean): void => {
    trackEvent('answer_submitted', { questionNumber, timeMs, isCorrect });
  },

  tournamentJoined: (tournamentId: string): void => {
    trackEvent('tournament_joined', { tournamentId });
  },

  purchaseStarted: (tier: string, stars: number): void => {
    trackEvent('purchase_started', { tier, stars });
  },

  purchaseCompleted: (tier: string, stars: number, coinsAwarded: number): void => {
    trackEvent('purchase_completed', { tier, stars, coinsAwarded });
  },
};

// Capture error with context
export function captureError(error: Error, context?: Record<string, unknown>): void {
  Sentry.withScope((scope: Sentry.Scope) => {
    if (context) {
      scope.setExtras(context);
    }
    Sentry.captureException(error);
  });
}

// Capture message with level
export function captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info'): void {
  Sentry.captureMessage(message, level);
}

// Create performance transaction
export function startTransaction(name: string, op: string): Sentry.Span | undefined {
  return Sentry.startInactiveSpan({
    name,
    op,
  });
}

export default {
  initSentry,
  setUser,
  clearUser,
  trackEvent,
  gameEvents,
  captureError,
  captureMessage,
  startTransaction,
};
