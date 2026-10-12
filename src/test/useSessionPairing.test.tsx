import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSession } from '../hooks/useSession';
import { useSessionStore } from '../stores/sessionStore';
import { ContinuityBrowserCameraService } from '../lib/ContinuityBrowserCameraService';
import { stationApi } from '../lib/StationApi';

const socket = vi.hoisted(() => ({ connect: vi.fn(), disconnect: vi.fn() }));
vi.mock('../hooks/useWebSocket', () => ({ useWebSocket: () => socket }));

function jsonResponse(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('useSession pairing', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    socket.connect.mockReset();
    socket.disconnect.mockReset();
    useSessionStore.setState({ sessionId: null, accessToken: null, isOwner: false,
      protocolo: null, isActive: false });
  });

  it('creates a cloud session through the same-origin station BFF without a human token', async () => {
    vi.stubEnv('VITE_HANDWASH_CLOUD_MODE', 'true');
    vi.spyOn(stationApi, 'createSession').mockResolvedValue({
      sessionId: 'cloud-session', protocolo: 'DOMESTICO',
    });
    const { result } = renderHook(() => useSession());

    await act(async () => {
      await result.current.start('DOMESTICO');
    });

    expect(stationApi.createSession).toHaveBeenCalledWith('DOMESTICO', expect.any(String));
    expect(useSessionStore.getState().sessionId).toBe('cloud-session');
    expect(useSessionStore.getState().accessToken).toBeNull();
    expect(socket.connect).toHaveBeenCalledWith('cloud-session', null);
  });

  it('opens the cloud camera preview without creating a session or exposing a pairing code', async () => {
    vi.stubEnv('VITE_HANDWASH_CLOUD_MODE', 'true');
    const stream = { getTracks: vi.fn(() => []) } as unknown as MediaStream;
    vi.spyOn(ContinuityBrowserCameraService, 'open').mockResolvedValue(stream);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useSession());

    let linked: Awaited<ReturnType<typeof result.current.linkCloudCamera>> | undefined;
    await act(async () => {
      linked = await result.current.linkCloudCamera(new AbortController().signal);
    });

    expect(linked?.stream).toBe(stream);
    expect(linked?.message).toContain('Vista previa local');
    expect(useSessionStore.getState().sessionId).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(socket.connect).not.toHaveBeenCalled();
  });

  it('recovers an expired viewer through local pairing without rotating the producer', async () => {
    useSessionStore.getState().startSession('old-camera', 'DOMESTICO', 'expired-viewer', false);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(jsonResponse({ status: 'connected', message: 'Cámara enlazada',
        session: { sessionId: 'new-camera', protocolo: 'DOMESTICO', role: 'VIEWER', accessToken: 'new-viewer' },
      }));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useSession());
    await act(async () => {
      expect(await result.current.linkCamera(new AbortController().signal)).toBe('Cámara enlazada');
    });
    expect(fetchMock.mock.calls[1][0]).toBe(`${window.location.origin}/api/v1/camera/link`);
    expect(useSessionStore.getState().sessionId).toBe('new-camera');
    expect(useSessionStore.getState().isOwner).toBe(false);
    expect(socket.connect).toHaveBeenCalledWith('new-camera', 'new-viewer');
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/auth/login'))).toBe(false);
  });

  it('does not apply a late link result to a replacement session', async () => {
    useSessionStore.getState().startSession('first-camera', 'DOMESTICO', 'viewer', false);
    let release!: (value: Response) => void;
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise<Response>((resolve) => { release = resolve; })));
    const { result } = renderHook(() => useSession());
    const request = result.current.linkCamera(new AbortController().signal);
    await act(async () => {
      useSessionStore.getState().startSession('second-camera', 'DOMESTICO', 'other-viewer', false);
      release(jsonResponse({ status: 'connected', message: 'Anterior enlazado' }));
      await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    });
    expect(useSessionStore.getState().sessionId).toBe('second-camera');
    expect(socket.connect).not.toHaveBeenCalled();
  });

  it('creates a distinct session on ambiguous discovery and returns its code', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'SESIONES_ACTIVAS_AMBIGUAS' }, 409))
      .mockResolvedValueOnce(jsonResponse({
        sessionId: 'new-session', protocolo: 'DOMESTICO', pairingCode: 'ABCDE-FGHIJ', accessToken: 'owner-token',
      }));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useSession());

    let code: string | null = null;
    await act(async () => { code = await result.current.start('DOMESTICO'); });

    expect(code).toBe('ABCDE-FGHIJ');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ protocolo: 'DOMESTICO', producerProtocolVersion: '2' }),
    });
    expect(useSessionStore.getState().sessionId).toBe('new-session');
    expect(socket.connect).toHaveBeenCalledWith('new-session', 'owner-token');
  });

  it('reuses the unique matching session and loads its pairing code', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ sessionId: 'existing', protocolo: 'DOMESTICO', accessRequired: false }))
      .mockResolvedValueOnce(jsonResponse({
        sessionId: 'existing', protocolo: 'DOMESTICO', pairingCode: 'KLMNO-PQRST',
      }));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useSession());

    let code: string | null = null;
    await act(async () => { code = await result.current.start('DOMESTICO'); });

    expect(code).toBe('KLMNO-PQRST');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(socket.connect).toHaveBeenCalledWith('existing', null);
  });

  it('does not claim an existing protected session without its token', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        sessionId: 'someone-else', protocolo: 'DOMESTICO', accessRequired: true,
      }))
      .mockResolvedValueOnce(jsonResponse({
        sessionId: 'new-session', protocolo: 'DOMESTICO',
        pairingCode: 'ABCDE-FGHIJ', accessToken: 'new-owner-token',
      }));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useSession());

    await act(async () => { await result.current.start('DOMESTICO'); });

    expect(useSessionStore.getState().sessionId).toBe('new-session');
    expect(useSessionStore.getState().accessToken).toBe('new-owner-token');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keeps the session and token when the server rejects stopping it', async () => {
    useSessionStore.getState().startSession('existing', 'DOMESTICO', 'owner-token');
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: 'ACCESO_NO_AUTORIZADO' }, 401));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useSession());

    await expect(act(async () => { await result.current.stop(); })).rejects.toThrow();
    expect(useSessionStore.getState().isActive).toBe(true);
    expect(useSessionStore.getState().accessToken).toBe('owner-token');
    expect(socket.disconnect).not.toHaveBeenCalled();
  });

  it('joins a camera-owned session and leaves without deleting it', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      sessionId: 'iphone-session', protocolo: 'CLINICO_QUIRURGICO',
      role: 'VIEWER', accessToken: 'viewer-token',
    }));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useSession());

    await act(async () => { await result.current.join('ABCDE-FGHIJ'); });
    expect(useSessionStore.getState().isOwner).toBe(false);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/v1/auth/dashboard-login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'ABCDE-FGHIJ' }),
    });
    expect(socket.connect).toHaveBeenCalledWith('iphone-session', 'viewer-token');

    await act(async () => { await result.current.stop(); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(socket.disconnect).toHaveBeenCalled();
    expect(useSessionStore.getState().isActive).toBe(false);
  });
});
