import { useEffect, useState } from 'react';
import { getViewportMetricsSnapshot } from './useViewportMetrics';

type ViewportDensityState = {
  width: number;
  height: number;
  stableHeight: number;
  isCompact: boolean;
  isVeryCompact: boolean;
  isUltraCompact: boolean;
  isLandscape: boolean;
};

const getViewportState = (): ViewportDensityState => {
  const metrics = getViewportMetricsSnapshot();
  return {
    width: metrics.width,
    height: metrics.height,
    stableHeight: metrics.stableHeight,
    isCompact: metrics.isCompact,
    isVeryCompact: metrics.isVeryCompact,
    isUltraCompact: metrics.isUltraCompact,
    isLandscape: metrics.isLandscape,
  };
};

export function useViewportDensity(): ViewportDensityState {
  const [viewportState, setViewportState] = useState<ViewportDensityState>(() => getViewportState());

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const updateViewportState = () => {
      setViewportState((previous) => {
        const next = getViewportState();
        if (previous.width === next.width && previous.height === next.height) return previous;
        return next;
      });
    };

    updateViewportState();
    window.addEventListener('resize', updateViewportState);
    window.addEventListener('orientationchange', updateViewportState);
    window.visualViewport?.addEventListener('resize', updateViewportState);
    window.visualViewport?.addEventListener('scroll', updateViewportState);

    return () => {
      window.removeEventListener('resize', updateViewportState);
      window.removeEventListener('orientationchange', updateViewportState);
      window.visualViewport?.removeEventListener('resize', updateViewportState);
      window.visualViewport?.removeEventListener('scroll', updateViewportState);
    };
  }, []);

  return viewportState;
}

export default useViewportDensity;
