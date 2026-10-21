const MAX_WIDTH = 640;
const QUALITY = 0.7;

export interface RetainedFrame { attemptNumber: number; blob: Blob }

/**
 * Keeps at most one JPEG frame in memory for the attempt in progress. Nothing is written to disk
 * and nothing leaves the browser unless Java reports the attempt (see usePresenceEvidence).
 */
export class EvidenceFrameBuffer {
  private frame: RetainedFrame | null = null;
  private video: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private source: MediaStream | null = null;

  async capture(stream: MediaStream, attemptNumber: number): Promise<void> {
    const video = this.videoFor(stream);
    if (video.readyState < 2 || video.videoWidth === 0) return;
    const scale = Math.min(1, MAX_WIDTH / video.videoWidth);
    const canvas = this.canvas ?? (this.canvas = document.createElement('canvas'));
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY));
    if (blob && blob.size > 0) this.frame = { attemptNumber, blob };
  }

  /** The retained frame only if it belongs to that attempt; frames of other attempts are discarded. */
  take(attemptNumber: number): Blob | null {
    const frame = this.frame;
    this.frame = null;
    return frame && frame.attemptNumber === attemptNumber ? frame.blob : null;
  }

  clear(): void {
    this.frame = null;
  }

  dispose(): void {
    this.clear();
    if (this.video) { this.video.srcObject = null; this.video = null; }
    this.canvas = null;
    this.source = null;
  }

  private videoFor(stream: MediaStream): HTMLVideoElement {
    if (!this.video || this.source !== stream) {
      const video = this.video ?? document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      void video.play().catch(() => undefined);
      this.video = video;
      this.source = stream;
    }
    return this.video;
  }
}
