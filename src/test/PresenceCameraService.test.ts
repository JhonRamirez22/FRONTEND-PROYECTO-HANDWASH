import { describe, expect, it, vi } from 'vitest';
import { PresenceCameraService, isBuiltInCamera } from '@/lib/PresenceCameraService';

function stream(label: string): MediaStream {
  const track = { label, readyState: 'live', stop: vi.fn(), addEventListener: vi.fn() };
  return { getVideoTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream;
}

describe('presence camera selection', () => {
  it('accepts only the Mac built-in camera, never the iPhone or virtual cameras', () => {
    expect(isBuiltInCamera('FaceTime HD Camera')).toBe(true);
    expect(isBuiltInCamera('Cámara FaceTime HD integrada')).toBe(true);
    expect(isBuiltInCamera('MacBook Pro Camera')).toBe(true);
    expect(isBuiltInCamera('iPhone de Jhon Camera')).toBe(false);
    expect(isBuiltInCamera('Desk View Camera')).toBe(false);
    expect(isBuiltInCamera('OBS Virtual Camera')).toBe(false);
    expect(isBuiltInCamera('')).toBe(false);
  });

  it('keeps the first stream when the default device is already the built-in camera', async () => {
    const builtIn = stream('FaceTime HD Camera');
    const media = { getUserMedia: vi.fn().mockResolvedValue(builtIn), enumerateDevices: vi.fn() } as unknown as MediaDevices;
    expect(await PresenceCameraService.open(media, true)).toBe(builtIn);
    expect(media.enumerateDevices).not.toHaveBeenCalled();
  });

  it('closes an iPhone default and reopens the built-in device by id', async () => {
    const iphone = stream('iPhone Camera');
    const builtIn = stream('FaceTime HD Camera');
    const media = {
      getUserMedia: vi.fn().mockResolvedValueOnce(iphone).mockResolvedValueOnce(builtIn),
      enumerateDevices: vi.fn().mockResolvedValue([
        { kind: 'videoinput', deviceId: 'phone', label: 'iPhone Camera' },
        { kind: 'videoinput', deviceId: 'mac', label: 'FaceTime HD Camera' },
      ]),
    } as unknown as MediaDevices;

    expect(await PresenceCameraService.open(media, true)).toBe(builtIn);
    expect(iphone.getTracks()[0]!.stop).toHaveBeenCalled();
    expect(vi.mocked(media.getUserMedia).mock.calls[1]![0]).toMatchObject({ video: { deviceId: { exact: 'mac' } } });
  });

  it('fails clearly without a built-in camera or a secure context', async () => {
    const media = {
      getUserMedia: vi.fn().mockResolvedValue(stream('iPhone Camera')),
      enumerateDevices: vi.fn().mockResolvedValue([{ kind: 'videoinput', deviceId: 'phone', label: 'iPhone Camera' }]),
    } as unknown as MediaDevices;
    await expect(PresenceCameraService.open(media, true)).rejects.toThrow('cámara integrada');
    await expect(PresenceCameraService.open(media, false)).rejects.toThrow('HTTPS');
  });
});
