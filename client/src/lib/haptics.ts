export type HapticPattern = 'selection' | 'notification' | 'success' | 'error';

const HAPTIC_PATTERNS: Record<HapticPattern, number | number[]> = {
  selection: 10,
  notification: [20, 30, 20],
  success: [20, 20, 40],
  error: [30, 20, 30],
};

export function triggerHaptic(pattern: HapticPattern = 'selection'): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  navigator.vibrate(HAPTIC_PATTERNS[pattern]);
}
