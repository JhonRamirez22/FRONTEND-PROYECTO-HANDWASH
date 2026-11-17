import { describe, expect, it, vi } from 'vitest';
import { ContinuityBrowserCameraService, isPhoneLikeDevice } from '../lib/ContinuityBrowserCameraService';

function fakeDevices(result: () => Promise<MediaStream>) {
  return { getUserMedia: vi.fn(result), enumerateDevices: vi.fn(async () => []) } as unknown as MediaDevices;
}

const stream = { getTracks: () => [], getVideoTracks: () => [{ label: 'Camera 0, Facing back' }] } as unknown as MediaStream;

describe('phone camera', () => {
  it('opens the rear camera of this phone without asking for audio', async () => {
    const devices = fakeDevices(async () => stream);

    const opened = await ContinuityBrowserCameraService.openPhoneCamera(devices, true);

    expect(opened).toBe(stream);
    const constraints = vi.mocked(devices.getUserMedia).mock.calls[0]?.[0] as MediaStreamConstraints;
    expect(constraints.audio).toBe(false);
    expect(constraints.video).toMatchObject({ facingMode: { ideal: 'environment' } });
  });

  it('explains what to allow when the phone refuses the camera', async () => {
    const denied = Object.assign(new Error('x'), { name: 'NotAllowedError' });
    await expect(ContinuityBrowserCameraService.openPhoneCamera(fakeDevices(async () => { throw denied; }), true))
      .rejects.toThrow('Permite el acceso a la cámara');
  });

  it('needs a secure page and a browser that exposes cameras', async () => {
    await expect(ContinuityBrowserCameraService.openPhoneCamera(fakeDevices(async () => stream), false)).rejects.toThrow('HTTPS');
    await expect(ContinuityBrowserCameraService.openPhoneCamera({} as MediaDevices, true)).rejects.toThrow('no permite');
  });

  it('tells a phone or tablet from a computer by its user agent', () => {
    expect(isPhoneLikeDevice('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36')).toBe(true);
    expect(isPhoneLikeDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148')).toBe(true);
    expect(isPhoneLikeDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15')).toBe(false);
    expect(isPhoneLikeDevice('')).toBe(false);
  });
});
