export interface PictureSetting { maxSide: number; quality: number }

const LADDER: readonly PictureSetting[] = [
  { maxSide: 960, quality: 0.7 },
  { maxSide: 800, quality: 0.6 },
  { maxSide: 640, quality: 0.55 },
  { maxSide: 640, quality: 0.45 },
  { maxSide: 480, quality: 0.45 },
  { maxSide: 480, quality: 0.35 },
];
const START = 1; // 800 px: lighter to encode on the phone (more frames per second) and still plenty for the PC
const CONGESTED_BEFORE_DROP = 2;
const CLEAN_BEFORE_RISE = 45;

/**
 * Picks the picture size from what the phone's uplink can carry: when frames pile up in the socket the picture gets
 * smaller, and after a long clean run it grows back one step. The frame rate is what matters for hand washing.
 */
export class QualityGovernor {
  private level = START;
  private congestion = 0;
  private clean = 0;

  current(): PictureSetting { return LADDER[this.level]!; }

  congested(): void {
    this.clean = 0;
    if (++this.congestion >= CONGESTED_BEFORE_DROP) {
      this.congestion = 0;
      this.level = Math.min(LADDER.length - 1, this.level + 1);
    }
  }

  sent(): void {
    this.congestion = 0;
    if (++this.clean >= CLEAN_BEFORE_RISE) {
      this.clean = 0;
      this.level = Math.max(0, this.level - 1);
    }
  }
}
