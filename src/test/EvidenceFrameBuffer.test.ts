import { afterEach, describe, expect, it, vi } from 'vitest';
import { EvidenceFrameBuffer } from '@/lib/EvidenceFrameBuffer';

function fakeVideo(width: number, height: number) {
  return { muted: false, playsInline: false, srcObject: null, readyState: 4, videoWidth: width, videoHeight: height,
    play: vi.fn().mockResolvedValue(undefined) };
}

describe('EvidenceFrameBuffer', () => {
  afterEach(() => vi.restoreAllMocks());

  function arrange(width = 1280, height = 720, blobSize = 5_000) {
    const video = fakeVideo(width, height);
    const drawImage = vi.fn();
    const canvas = { width: 0, height: 0, getContext: () => ({ drawImage }),
      toBlob: (cb: (blob: Blob | null) => void) => cb(new Blob([new Uint8Array(blobSize)], { type: 'image/jpeg' })) };
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => (tag === 'video' ? video : canvas)) as never);
    return { video, canvas, drawImage };
  }

  it('keeps one JPEG frame scaled to at most 640 px and returns it once for its attempt', async () => {
    const { canvas } = arrange();
    const buffer = new EvidenceFrameBuffer();
    await buffer.capture({} as MediaStream, 3);

    expect(canvas.width).toBe(640);
    expect(canvas.height).toBe(360);
    expect(buffer.take(4)).toBeNull();
    await buffer.capture({} as MediaStream, 3);
    const blob = buffer.take(3);
    expect(blob?.type).toBe('image/jpeg');
    expect(buffer.take(3)).toBeNull();
  });

  it('does not capture before the video has data, and clear/dispose drop the frame', async () => {
    const { video } = arrange();
    const buffer = new EvidenceFrameBuffer();
    video.readyState = 0;
    await buffer.capture({} as MediaStream, 1);
    expect(buffer.take(1)).toBeNull();

    video.readyState = 4;
    await buffer.capture({} as MediaStream, 1);
    buffer.clear();
    expect(buffer.take(1)).toBeNull();
    await buffer.capture({} as MediaStream, 1);
    buffer.dispose();
    expect(buffer.take(1)).toBeNull();
    expect(video.srcObject).toBeNull();
  });
});
