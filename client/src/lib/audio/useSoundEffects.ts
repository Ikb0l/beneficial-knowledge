import { useCallback, useEffect } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import { triggerHaptic, type HapticPattern } from '../haptics';
import { soundManager, type SoundEffect } from './SoundManager';

// Hook for playing sounds in components
export function useSoundEffects() {
  // Initialize sound manager on mount
  useEffect(() => {
    soundManager.init();
  }, []);

  const play = useCallback((effect: SoundEffect) => {
    soundManager.play(effect);
  }, []);

  const stop = useCallback((effect: SoundEffect) => {
    soundManager.stop(effect);
  }, []);

  const stopAll = useCallback(() => {
    soundManager.stopAll();
  }, []);

  return { play, stop, stopAll };
}

// Pre-defined sound trigger functions for common game events
const triggerHapticIfEnabled = (pattern: HapticPattern = 'selection') => {
  const { settings } = useSettingsStore.getState();
  if (!settings.hapticsEnabled) return;
  triggerHaptic(pattern);
};

type GlobalMatchFoundState = typeof globalThis & {
  __quizMatchFoundState?: {
    lastMatchFoundAt: number;
  };
};

const MATCH_FOUND_DEBOUNCE_MS = 1000;

const getMatchFoundState = () => {
  const globalScope = globalThis as GlobalMatchFoundState;
  if (!globalScope.__quizMatchFoundState) {
    globalScope.__quizMatchFoundState = { lastMatchFoundAt: 0 };
  }
  return globalScope.__quizMatchFoundState;
};

export const gameSounds = {
  onMatchFound: () => {
    // Debounce to avoid double-trigger on fast duplicate events/HMR reloads.
    const state = getMatchFoundState();
    const now = Date.now();
    if (now - state.lastMatchFoundAt < MATCH_FOUND_DEBOUNCE_MS) {
      return;
    }
    state.lastMatchFoundAt = now;
    soundManager.stop('matchFound');
    soundManager.play('matchFound');
    triggerHapticIfEnabled('notification');
  },
  onCountdown: () => soundManager.play('countdown'),
  onQuestionReveal: () => soundManager.play('questionReveal'),
  onAnswerSelect: () => {
    soundManager.play('answerSelect');
    triggerHapticIfEnabled('selection');
  },
  onAnswerCorrect: () => {
    soundManager.play('answerCorrect');
    triggerHapticIfEnabled('success');
  },
  onAnswerWrong: () => {
    soundManager.play('answerWrong');
    triggerHapticIfEnabled('error');
  },
  onVictory: () => {
    soundManager.play('victory');
    triggerHapticIfEnabled('success');
  },
  onDefeat: () => {
    soundManager.play('defeat');
    triggerHapticIfEnabled('error');
  },
  onRankUp: () => soundManager.play('rankUp'),
  onStreak: () => soundManager.play('streak'),
  onTimeWarning: () => soundManager.play('timeWarning'),
  onClick: () => {
    soundManager.play('click');
    triggerHapticIfEnabled('selection');
  },
};

export default useSoundEffects;
