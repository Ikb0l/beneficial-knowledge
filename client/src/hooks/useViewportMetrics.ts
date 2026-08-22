import { useEffect, useState } from 'react';
import { telegram } from '../shared/lib/telegram';

const COMPACT_MAX_HEIGHT = 760;
const VERY_COMPACT_MAX_HEIGHT = 700;
const ULTRA_COMPACT_MAX_HEIGHT = 640;

export type ViewportMetrics = {
  width: number;
  height: number;
  stableHeight: number;
  isCompact: boolean;
  isVeryCompact: boolean;
  isUltraCompact: boolean;
  isLandscape: boolean;
};

const toInt = (value: number): number => Math.max(0, Math.round(value));

export const getViewportMetricsSnapshot = (): ViewportMetrics => {
  if (typeof window === 'undefined') {
    return {
      width: 1024,
      height: 768,
      stableHeight: 768,
      isCompact: false,
      isVeryCompact: false,
      isUltraCompact: false,
      isLandscape: true,
    };
  }

  const visualViewport = window.visualViewport;
  const visualWidth = toInt(visualViewport?.width ?? window.innerWidth);
  const visualHeight = toInt(visualViewport?.height ?? window.innerHeight);

  const telegramHeight = telegram.isAvailable ? toInt(telegram.viewportHeight) : 0;
  const telegramStableHeight = telegram.isAvailable ? toInt(telegram.viewportStableHeight) : 0;
  const windowHeight = toInt(window.innerHeight);

  const heightCandidates = [visualHeight, telegramHeight, windowHeight].filter((value) => value > 0);
  const stableCandidates = [telegramStableHeight, windowHeight].filter((value) => value > 0);

  const height = heightCandidates.length > 0 ? Math.min(...heightCandidates) : windowHeight;
  const stableHeightCandidate = stableCandidates.length > 0 ? Math.max(...stableCandidates) : height;
  const stableHeight = Math.max(stableHeightCandidate, height);
  const isLandscape = visualWidth > height;

  return {
    width: visualWidth,
    height,
    stableHeight,
    isCompact: height <= COMPACT_MAX_HEIGHT,
    isVeryCompact: height <= VERY_COMPACT_MAX_HEIGHT,
    isUltraCompact: height <= ULTRA_COMPACT_MAX_HEIGHT,
    isLandscape,
  };
};

const syncViewportCssVars = (metrics: ViewportMetrics): void => {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  root.style.setProperty('--tg-viewport-height', `${metrics.height}px`);
  root.style.setProperty('--tg-viewport-stable-height', `${metrics.stableHeight}px`);
  root.style.setProperty('--safe-top', 'env(safe-area-inset-top)');
  root.style.setProperty('--safe-bottom', 'env(safe-area-inset-bottom)');

  root.classList.toggle('compact-height', metrics.isCompact);
  root.classList.toggle('very-compact-height', metrics.isVeryCompact);
  root.classList.toggle('ultra-compact-height', metrics.isUltraCompact);
  root.classList.toggle('landscape-height', metrics.isLandscape);
};

export function useViewportMetrics(): ViewportMetrics {
  const [metrics, setMetrics] = useState<ViewportMetrics>(() => getViewportMetricsSnapshot());

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let rafId: number | null = null;
    const commit = () => {
      rafId = null;
      const next = getViewportMetricsSnapshot();
      setMetrics((previous) => {
        if (
          previous.width === next.width
          && previous.height === next.height
          && previous.stableHeight === next.stableHeight
          && previous.isCompact === next.isCompact
          && previous.isVeryCompact === next.isVeryCompact
          && previous.isUltraCompact === next.isUltraCompact
          && previous.isLandscape === next.isLandscape
        ) {
          return previous;
        }
        return next;
      });
      syncViewportCssVars(next);
    };

    const scheduleCommit = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(commit);
    };

    scheduleCommit();
    window.addEventListener('resize', scheduleCommit);
    window.addEventListener('orientationchange', scheduleCommit);
    window.visualViewport?.addEventListener('resize', scheduleCommit);
    window.visualViewport?.addEventListener('scroll', scheduleCommit);

    return () => {
      window.removeEventListener('resize', scheduleCommit);
      window.removeEventListener('orientationchange', scheduleCommit);
      window.visualViewport?.removeEventListener('resize', scheduleCommit);
      window.visualViewport?.removeEventListener('scroll', scheduleCommit);
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, []);

  return metrics;
}

export default useViewportMetrics;
