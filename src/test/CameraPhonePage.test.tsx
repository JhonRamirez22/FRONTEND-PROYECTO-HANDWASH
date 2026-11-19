import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { CameraPhonePage } from '@/components/CameraPhonePage';
import type { CameraPairingApi } from '@/lib/CameraPairingApi';

const CODE = 'A'.repeat(43);
const TOKEN = 'T'.repeat(43);
const stream = { getTracks: () => [{ stop: vi.fn() }], getVideoTracks: () => [{ readyState: 'live' }] } as unknown as MediaStream;

function fakeApi(overrides: Partial<Record<'redeem' | 'state', unknown>> = {}) {
  return {
    redeem: vi.fn(async () => ({ token: TOKEN, stationName: 'LAVAMANOS TEST' })),
    state: vi.fn(async () => ({ kind: 'active', sessionId: 's1' })),
    ticket: vi.fn(),
    ...overrides,
  } as unknown as CameraPairingApi;
}

describe('CameraPhonePage', () => {
  afterEach(() => { cleanup(); window.sessionStorage.clear(); window.location.hash = ''; });

  it('redeems the QR, opens the rear camera and starts publishing to the active session', async () => {
    window.location.hash = `#/camera?c=${CODE}`;
    const api = fakeApi();
    const run = vi.fn(() => () => undefined);
    const openCamera = vi.fn(async () => stream);

    render(<CameraPhonePage api={api} openCamera={openCamera} makeSupervisor={() => ({ run })} pollMs={10} />);

    await waitFor(() => expect(run).toHaveBeenCalledWith('s1', stream, expect.any(Function)));
    expect(api.redeem).toHaveBeenCalledWith(CODE);
    expect(openCamera).toHaveBeenCalled();
    expect(window.location.hash).toBe('#/camera');
    expect(screen.getByText('LAVAMANOS TEST')).toBeTruthy();
  });

  it('says so when another phone replaced this camera and stops publishing', async () => {
    window.sessionStorage.setItem('handwash.camera.token', TOKEN);
    const stop = vi.fn();
    const api = fakeApi({ state: vi.fn(async () => ({ kind: 'replaced' })) });
    render(<CameraPhonePage api={api} openCamera={async () => stream} makeSupervisor={() => ({ run: () => stop })} pollMs={10} />);
    expect(await screen.findByText(/reemplazada/i)).toBeTruthy();
  });

  it('asks to scan again when there is no code and no saved token', async () => {
    render(<CameraPhonePage api={fakeApi()} openCamera={async () => stream} makeSupervisor={() => ({ run: () => () => undefined })} pollMs={10} />);
    expect(await screen.findByText(/Escanea el QR/i)).toBeTruthy();
  });

  it('explains a camera permission that was refused', async () => {
    window.sessionStorage.setItem('handwash.camera.token', TOKEN);
    render(<CameraPhonePage api={fakeApi()} openCamera={async () => { throw new DOMException('no', 'NotAllowedError'); }}
      makeSupervisor={() => ({ run: () => () => undefined })} pollMs={10} />);
    expect(await screen.findByText(/permiso de cámara/i)).toBeTruthy();
  });
});

describe('CameraPhonePage stability', () => {
  afterEach(() => { cleanup(); window.sessionStorage.clear(); window.location.hash = ''; });

  it('keeps one relay for the session even when the parent re-renders with new dependency objects', async () => {
    window.sessionStorage.setItem('handwash.camera.token', TOKEN);
    const stop = vi.fn();
    const run = vi.fn(() => stop);
    const props = () => ({ api: fakeApi(), openCamera: async () => stream, makeSupervisor: () => ({ run }), pollMs: 10 });

    const { rerender } = render(<CameraPhonePage {...props()} />);
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    for (let i = 0; i < 5; i += 1) rerender(<CameraPhonePage {...props()} />);
    await new Promise((resolve) => setTimeout(resolve, 80));

    expect(run).toHaveBeenCalledTimes(1);
    expect(stop).not.toHaveBeenCalled();
  });
});
