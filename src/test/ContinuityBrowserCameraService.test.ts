import { describe, expect, it, vi } from 'vitest';
import { ContinuityBrowserCameraService } from '@/lib/ContinuityBrowserCameraService';

function fakeStream(label: string) {
  const track = { label, stop: vi.fn() } as unknown as MediaStreamTrack;
  return {
    stream: {
      getVideoTracks: () => [track],
      getTracks: () => [track],
    } as unknown as MediaStream,
    track,
  };
}

describe('ContinuityBrowserCameraService', () => {
  it('uses the selected main iPhone camera and stops a non-iPhone probe', async () => {
    const probe = fakeStream('FaceTime HD Camera');
    const selected = fakeStream('iPhone de Jhon Camera');
    const mediaDevices = {
      getUserMedia: vi.fn().mockResolvedValueOnce(probe.stream).mockResolvedValueOnce(selected.stream),
      enumerateDevices: vi.fn().mockResolvedValue([
        { kind: 'videoinput', deviceId: 'desk', label: 'iPhone Desk View' },
        { kind: 'videoinput', deviceId: 'main', label: 'iPhone de Jhon Camera' },
      ]),
    } as unknown as MediaDevices;

    await expect(ContinuityBrowserCameraService.open(mediaDevices, true)).resolves.toBe(selected.stream);
    expect(probe.track.stop).toHaveBeenCalledOnce();
    expect(mediaDevices.getUserMedia).toHaveBeenNthCalledWith(2, expect.objectContaining({
      video: expect.objectContaining({ deviceId: { exact: 'main' } }),
    }));
  });

  it('stops the probe and refuses FaceTime or Desk View when Continuity is absent', async () => {
    const probe = fakeStream('FaceTime HD Camera');
    const mediaDevices = {
      getUserMedia: vi.fn().mockResolvedValue(probe.stream),
      enumerateDevices: vi.fn().mockResolvedValue([
        { kind: 'videoinput', deviceId: 'desk', label: 'iPhone Desk View' },
      ]),
    } as unknown as MediaDevices;

    await expect(ContinuityBrowserCameraService.open(mediaDevices, true))
      .rejects.toThrow('No se encontró la cámara principal del iPhone');
    expect(probe.track.stop).toHaveBeenCalledOnce();
  });

  it('requires a secure browser context before requesting access', async () => {
    const mediaDevices = { getUserMedia: vi.fn(), enumerateDevices: vi.fn() } as unknown as MediaDevices;
    await expect(ContinuityBrowserCameraService.open(mediaDevices, false)).rejects.toThrow('requiere HTTPS');
    expect(mediaDevices.getUserMedia).not.toHaveBeenCalled();
  });
});
