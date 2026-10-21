/** Opt-in, short confirmation tone; never required to understand the screen. */
export class KioskChime {
  private context: AudioContext | null = null;

  static enabled(): boolean {
    return window.__HANDWASH_CONFIG__?.kioskSound === true;
  }

  play(frequencyHz: number): void {
    try {
      this.context ??= new AudioContext();
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      const now = this.context.currentTime;
      oscillator.frequency.value = frequencyHz;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.12, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
      oscillator.connect(gain).connect(this.context.destination);
      oscillator.start(now);
      oscillator.stop(now + 0.26);
    } catch {
      // Audio is a courtesy; a blocked or missing AudioContext must not affect the kiosk.
    }
  }
}
