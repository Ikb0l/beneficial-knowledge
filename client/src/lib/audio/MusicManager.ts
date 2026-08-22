import { Howl } from 'howler';

export const BACKGROUND_MUSIC_SRC = '/music/background.mp3';

class MusicManager {
  private track: Howl | null = null;

  private ensureTrack(): Howl {
    if (!this.track) {
      this.track = new Howl({
        src: [BACKGROUND_MUSIC_SRC],
        loop: true,
        volume: 0.5,
        html5: true,
        preload: true,
      });
    }
    return this.track;
  }

  play(): void {
    const track = this.ensureTrack();
    if (!track.playing()) {
      track.play();
    }
  }

  pause(): void {
    if (this.track && this.track.playing()) {
      this.track.pause();
    }
  }

  setEnabled(enabled: boolean): void {
    if (enabled) {
      this.play();
    } else {
      this.pause();
    }
  }

  setVolume(volumePercent: number): void {
    const track = this.ensureTrack();
    const clamped = Math.max(0, Math.min(100, volumePercent));
    track.volume(clamped / 100);
  }
}

export const musicManager = new MusicManager();

export default musicManager;
