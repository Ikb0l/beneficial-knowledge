import { Howl, Howler } from 'howler';
import { useSettingsStore } from '../../stores/settingsStore';

export type SoundEffect =
  | 'click'
  | 'matchFound'
  | 'countdown'
  | 'questionReveal'
  | 'answerSelect'
  | 'answerCorrect'
  | 'answerWrong'
  | 'victory'
  | 'defeat'
  | 'rankUp'
  | 'streak'
  | 'timeWarning';

// Sound file paths (will use placeholder data URLs initially)
// Replace with actual sound files in /public/sounds/
const SOUND_SOURCES: Record<SoundEffect, string> = {
  click: '/sounds/click.mp3',
  matchFound: '/sounds/match-found.mp3',
  countdown: '/sounds/' +
      'countdown.mp3',
  questionReveal: '/sounds/question-reveal.mp3',
  answerSelect: '/sounds/answer-select.mp3',
  answerCorrect: '/sounds/answer-correct.mp3',
  answerWrong: '/sounds/answer-wrong.mp3',
  victory: '/sounds/victory.mp3',
  defeat: '/sounds/defeat.mp3',
  rankUp: '/sounds/rank-up.mp3',
  streak: '/sounds/streak.mp3',
  timeWarning: '/sounds/time-warning.mp3',
};

class SoundManager {
  private sounds: Map<SoundEffect, Howl> = new Map();
  private initialized = false;
  private loadingPromise: Promise<void> | null = null;

  // Initialize sound manager (lazy loading)
  async init(): Promise<void> {
    if (this.initialized) return;
    if (this.loadingPromise) return this.loadingPromise;

    this.loadingPromise = this.loadSounds();
    await this.loadingPromise;
    this.initialized = true;
  }

  private async loadSounds(): Promise<void> {
    const loadPromises: Promise<void>[] = [];

    for (const [key, src] of Object.entries(SOUND_SOURCES)) {
      const promise = new Promise<void>((resolve) => {
        const sound = new Howl({
          src: [src],
          preload: true,
          volume: 0.5,
          onload: () => resolve(),
          onloaderror: () => {
            console.warn(`Failed to load sound: ${key}`);
            resolve(); // Don't block on failed sounds
          },
        });
        this.sounds.set(key as SoundEffect, sound);
      });
      loadPromises.push(promise);
    }

    await Promise.all(loadPromises);
  }

  // Play a sound effect
  play(effect: SoundEffect): void {
    const { settings } = useSettingsStore.getState();

    if (!settings.soundEffectsEnabled) return;

    const sound = this.sounds.get(effect);
    if (!sound) {
      // Try to init and play if not initialized
      this.init().then(() => {
        const s = this.sounds.get(effect);
        if (s) {
          s.volume(settings.soundEffectsVolume / 100);
          s.play();
        }
      });
      return;
    }

    sound.volume(settings.soundEffectsVolume / 100);
    sound.play();
  }

  // Play with custom volume
  playWithVolume(effect: SoundEffect, volumePercent: number): void {
    const { settings } = useSettingsStore.getState();

    if (!settings.soundEffectsEnabled) return;

    const sound = this.sounds.get(effect);
    if (!sound) return;

    const finalVolume = (settings.soundEffectsVolume / 100) * (volumePercent / 100);
    sound.volume(finalVolume);
    sound.play();
  }

  // Stop a specific sound
  stop(effect: SoundEffect): void {
    const sound = this.sounds.get(effect);
    if (sound) {
      sound.stop();
    }
  }

  // Stop all sounds
  stopAll(): void {
    Howler.stop();
  }

  // Update global volume
  setVolume(volumePercent: number): void {
    Howler.volume(volumePercent / 100);
  }

  // Mute/unmute all sounds
  mute(muted: boolean): void {
    Howler.mute(muted);
  }

  // Clean up resources
  destroy(): void {
    this.sounds.forEach((sound) => sound.unload());
    this.sounds.clear();
    this.initialized = false;
    this.loadingPromise = null;
  }
}

type GlobalSoundManager = typeof globalThis & {
  __quizSoundManager?: SoundManager;
};

const globalScope = globalThis as GlobalSoundManager;

// Singleton instance (survives dev HMR without duplication)
export const soundManager = globalScope.__quizSoundManager ?? new SoundManager();
if (!globalScope.__quizSoundManager) {
  globalScope.__quizSoundManager = soundManager;
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    soundManager.destroy();
    globalScope.__quizSoundManager = undefined;
  });
}

// Convenience function for playing sounds
export function playSound(effect: SoundEffect): void {
  soundManager.play(effect);
}

// Export for use in components
export default soundManager;
