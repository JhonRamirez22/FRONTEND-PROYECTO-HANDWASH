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

    await expect(ContinuityBrowserCameraService.open(mediaDevices, true, { waitMs: 0 })).resolves.toBe(selected.stream);
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

    await expect(ContinuityBrowserCameraService.open(mediaDevices, true, { waitMs: 0 }))
      .rejects.toThrow('No se encontró la cámara principal del iPhone');
    expect(probe.track.stop).toHaveBeenCalledOnce();
  });

  it('requires a secure browser context before requesting access', async () => {
    const mediaDevices = { getUserMedia: vi.fn(), enumerateDevices: vi.fn() } as unknown as MediaDevices;
    await expect(ContinuityBrowserCameraService.open(mediaDevices, false)).rejects.toThrow('requiere HTTPS');
    expect(mediaDevices.getUserMedia).not.toHaveBeenCalled();
  });

  it('keeps looking until the iPhone appears after permission is granted', async () => {
    const probe = fakeStream('FaceTime HD Camera');
    const selected = fakeStream('iPhone de Jhon Camera');
    const mediaDevices = {
      getUserMedia: vi.fn().mockResolvedValueOnce(probe.stream).mockResolvedValueOnce(selected.stream),
      enumerateDevices: vi.fn()
        .mockResolvedValueOnce([{ kind: 'videoinput', deviceId: 'mac', label: 'FaceTime HD Camera' }])
        .mockResolvedValueOnce([{ kind: 'videoinput', deviceId: 'main', label: 'iPhone de Jhon Camera' }]),
    } as unknown as MediaDevices;

    await expect(ContinuityBrowserCameraService.open(mediaDevices, true, { waitMs: 2000, pollMs: 1 }))
      .resolves.toBe(selected.stream);
    expect(mediaDevices.enumerateDevices).toHaveBeenCalledTimes(2);
  });

  it('opens the camera chosen by the operator without probing', async () => {
    const chosen = fakeStream('Cámara USB externa');
    const mediaDevices = {
      getUserMedia: vi.fn().mockResolvedValue(chosen.stream),
      enumerateDevices: vi.fn(),
    } as unknown as MediaDevices;

    await expect(ContinuityBrowserCameraService.open(mediaDevices, true, { deviceId: 'usb' }))
      .resolves.toBe(chosen.stream);
    expect(mediaDevices.getUserMedia).toHaveBeenCalledOnce();
    expect(mediaDevices.getUserMedia).toHaveBeenCalledWith(expect.objectContaining({
      video: expect.objectContaining({ deviceId: { exact: 'usb' } }),
    }));
  });

  it('lists cameras, flags the iPhone and hides Desk View', async () => {
    const mediaDevices = {
      enumerateDevices: vi.fn().mockResolvedValue([
        { kind: 'videoinput', deviceId: 'mac', label: 'FaceTime HD Camera' },
        { kind: 'videoinput', deviceId: 'desk', label: 'iPhone Desk View' },
        { kind: 'videoinput', deviceId: 'main', label: 'iPhone de Jhon Camera' },
        { kind: 'audioinput', deviceId: 'mic', label: 'Mic' },
      ]),
    } as unknown as MediaDevices;

    await expect(ContinuityBrowserCameraService.listCameras(mediaDevices)).resolves.toEqual([
      { deviceId: 'mac', label: 'FaceTime HD Camera', likelyIphone: false },
      { deviceId: 'main', label: 'iPhone de Jhon Camera', likelyIphone: true },
    ]);
  });
});
