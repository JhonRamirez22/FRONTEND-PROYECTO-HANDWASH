import { afterEach, describe, expect, it, vi } from 'vitest';
import { OperatorApi } from '@/lib/OperatorApi';
import { KEY_SESSION } from '@/lib/OperatorKeySession';

describe('operator WebRTC access client', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('asks for a ticket with the console session and parses the ICE servers safely', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => String(input) === '/api/station/csrf'
      ? new Response(JSON.stringify({ token: 'a'.repeat(64) }), { status: 200 })
      : new Response(JSON.stringify({ ticket: 'T'.repeat(43), iceServers: [
        { urls: ['stun:stun.example:19302'] }, { urls: 'javascript:alert(1)' }, { urls: ['turn:1.2.3.4:3478'], username: 'u', credential: 'c' }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const access = await new OperatorApi().webrtcAccess(KEY_SESSION, '11111111-1111-4111-8111-111111111111');

    expect(access.ticket).toBe('T'.repeat(43));
    expect(access.iceServers.map((server) => server.urls)).toEqual([['stun:stun.example:19302'], ['turn:1.2.3.4:3478']]);
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe('/api/operator?action=webrtc-ticket');
    expect(JSON.parse(String(init.body))).toEqual({ sessionId: '11111111-1111-4111-8111-111111111111' });
  });

  it('fails clearly when Java gives no usable ticket', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => String(input) === '/api/station/csrf'
      ? new Response(JSON.stringify({ token: 'a'.repeat(64) }), { status: 200 })
      : new Response(JSON.stringify({ code: 'AUTH_REQUIRED' }), { status: 401 })));
    await expect(new OperatorApi().webrtcAccess(KEY_SESSION, 's')).rejects.toThrow();
  });
});

describe('operator camera helper client', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads the helper state and requests or withdraws the iPhone camera', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/station/csrf') return new Response(JSON.stringify({ token: 'a'.repeat(64) }), { status: 200 });
      if (url === '/api/operator?action=camera-agent') {
        return new Response(JSON.stringify({ online: true, wanted: true, state: 'streaming', device: 'iPhone', message: '' }), { status: 200 });
      }
      return new Response(JSON.stringify({ requested: true }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const api = new OperatorApi();

    expect(await api.cameraAgent(KEY_SESSION)).toMatchObject({ online: true, state: 'streaming' });
    await api.requestCameraAgent(KEY_SESSION, true);

    const calls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(calls).toContain('/api/operator?action=camera-agent-request');
    const request = fetchMock.mock.calls.find((call) => String(call[0]).includes('camera-agent-request'))?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toEqual({ wanted: true });
  });
});
