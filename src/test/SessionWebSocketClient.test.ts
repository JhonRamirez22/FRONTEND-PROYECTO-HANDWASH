import { afterEach, describe, expect, it, vi } from 'vitest';
import { SessionWebSocketClient } from '@/lib/SessionWebSocketClient';

class FakeSocket {
  static CLOSING = 2;
  readyState = 0;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(readonly url: string) {}

  close() { this.readyState = 3; }
}

describe('SessionWebSocketClient', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('sends the opaque session capability in its dedicated header when requesting a ticket', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ ticket: 'one-use-ticket-value-12345678901234567890' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ));
    vi.stubGlobal('fetch', fetchMock);
    const sockets: FakeSocket[] = [];
    const client = new SessionWebSocketClient({
      onMessage: vi.fn(), onStatusChange: vi.fn(), onConnected: vi.fn(),
      onReconnectAttempt: vi.fn(), isSessionActive: () => true,
    }, (url) => {
      const socket = new FakeSocket(url);
      sockets.push(socket);
      return socket as unknown as WebSocket;
    }, 'ws://127.0.0.1:8080', 'http://127.0.0.1:8080');

    client.connect('session-1', 'opaque-session-capability');
    await vi.waitFor(() => expect(sockets).toHaveLength(1));
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8080/api/v1/session/session-1/websocket-ticket',
      expect.objectContaining({ headers: { 'X-Session-Token': 'opaque-session-capability' } }),
    );
  });

  it('uses a one-use ticket instead of the long-lived token and ignores stale socket events', async () => {
    const sockets: FakeSocket[] = [];
    const onMessage = vi.fn();
    const onStatusChange = vi.fn();
    const client = new SessionWebSocketClient({
      onMessage,
      onStatusChange,
      onConnected: vi.fn(),
      onReconnectAttempt: vi.fn(),
      isSessionActive: () => true,
    }, (url) => {
      const socket = new FakeSocket(url);
      sockets.push(socket);
      return socket as unknown as WebSocket;
    }, 'ws://127.0.0.1:8080/', 'http://127.0.0.1:8080', async () => 'one-use-ticket-value-12345678901234567890');

    client.connect('session-1', 'secret-token');
    await vi.waitFor(() => expect(sockets).toHaveLength(1));
    const oldSocket = sockets[0];
    expect(new URL(oldSocket.url).pathname).toBe('/ws/session-1');
    expect(new URL(oldSocket.url).searchParams.get('ticket')).toBe('one-use-ticket-value-12345678901234567890');
    expect(new URL(oldSocket.url).searchParams.has('access_token')).toBe(false);

    client.connect('session-2');
    await vi.waitFor(() => expect(sockets).toHaveLength(2));
    oldSocket.onmessage?.({ data: '{"stale":true}' } as MessageEvent);
    sockets[1].onmessage?.({ data: '{"fresh":true}' } as MessageEvent);
    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onMessage).toHaveBeenCalledWith('{"fresh":true}');
  });

  it('reconnects with bounded backoff and cancels a pending retry on disconnect', async () => {
    vi.useFakeTimers();
    const sockets: FakeSocket[] = [];
    const onReconnectAttempt = vi.fn();
    const onStatusChange = vi.fn();
    const client = new SessionWebSocketClient({
      onMessage: vi.fn(),
      onStatusChange,
      onConnected: vi.fn(),
      onReconnectAttempt,
      isSessionActive: () => true,
    }, (url) => {
      const socket = new FakeSocket(url);
      sockets.push(socket);
      return socket as unknown as WebSocket;
    }, 'ws://localhost:8080', 'http://localhost:8080', async () => 'fresh-ticket-value-12345678901234567890');

    client.connect('session-1');
    await Promise.resolve();
    await Promise.resolve();
    sockets[0].onclose?.({} as CloseEvent);
    expect(onStatusChange).toHaveBeenLastCalledWith('disconnected');
    vi.advanceTimersByTime(999);
    expect(sockets).toHaveLength(1);
    vi.advanceTimersByTime(1);
    await Promise.resolve();
    await Promise.resolve();
    expect(sockets).toHaveLength(2);
    expect(onReconnectAttempt).toHaveBeenCalledTimes(1);

    sockets[1].onclose?.({} as CloseEvent);
    client.disconnect();
    vi.advanceTimersByTime(30_000);
    expect(sockets).toHaveLength(2);
  });
});
