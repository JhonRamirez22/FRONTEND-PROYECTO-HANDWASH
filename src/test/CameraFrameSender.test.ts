import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CameraFrameSender } from '../lib/CameraFrameSender';

class FakeSocket {
  static instances: FakeSocket[] = [];
  readyState = 0;
  bufferedAmount = 0;
  binaryType = '';
  sent: ArrayBuffer[] = [];
  onopen: (() => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: string) { FakeSocket.instances.push(this); }
  send(data: ArrayBuffer) { this.sent.push(data); }
  close() { this.readyState = 3; }
  open() { this.readyState = 1; this.onopen?.(); }
  end(code = 1006) { this.readyState = 3; this.onclose?.({ code }); }
}

const stream = {} as MediaStream;
const jpeg = () => new Uint8Array([0xff, 0xd8, 1, 2]).buffer;

describe('CameraFrameSender', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal('WebSocket', FakeSocket); FakeSocket.instances = []; });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  function make(overrides: { encode?: () => Promise<ArrayBuffer | null>; ticket?: () => Promise<string> } = {}) {
    const ticket = overrides.ticket ?? vi.fn(async () => 'T'.repeat(43));
    const encode = overrides.encode ?? vi.fn(async () => jpeg());
    const sender = new CameraFrameSender(ticket, 'wss://api.example', { fps: 10, encode });
    const states: string[] = [];
    const stop = sender.run('s1', stream, (state) => states.push(state));
    return { ticket, encode, states, stop };
  }

  it('connects to the camera channel with a fresh ticket and sends numbered JPEG frames', async () => {
    const { states, stop } = make();
    await vi.advanceTimersByTimeAsync(10);
    expect(FakeSocket.instances[0]!.url).toBe(`wss://api.example/ws/camera-in/s1?ticket=${'T'.repeat(43)}`);
    expect(FakeSocket.instances[0]!.binaryType).toBe('arraybuffer');
    FakeSocket.instances[0]!.open();
    await vi.advanceTimersByTimeAsync(350);

    const sent = FakeSocket.instances[0]!.sent;
    expect(sent.length).toBeGreaterThanOrEqual(3);
    expect(new DataView(sent[0]!).getUint32(0, false)).toBe(0);
    expect(new DataView(sent[1]!).getUint32(0, false)).toBe(1);
    expect(new Uint8Array(sent[0]!)[4]).toBe(0xff);
    expect(states).toContain('connected');
    stop();
  });

  it('drops frames instead of queueing them when the network is slow', async () => {
    const { stop } = make();
    await vi.advanceTimersByTimeAsync(10);
    const socket = FakeSocket.instances[0]!;
    socket.open();
    socket.bufferedAmount = 5_000_000;
    await vi.advanceTimersByTimeAsync(500);
    expect(socket.sent.length).toBe(0);
    socket.bufferedAmount = 0;
    await vi.advanceTimersByTimeAsync(250);
    expect(socket.sent.length).toBeGreaterThan(0);
    stop();
  });

  it('reconnects with a new ticket after the connection drops, and says so', async () => {
    const { ticket, states, stop } = make();
    await vi.advanceTimersByTimeAsync(10);
    FakeSocket.instances[0]!.open();
    FakeSocket.instances[0]!.end(1006);
    expect(states).toContain('reconnecting');
    await vi.advanceTimersByTimeAsync(1500);
    expect(FakeSocket.instances.length).toBe(2);
    expect(ticket).toHaveBeenCalledTimes(2);
    stop();
  });

  it('gives up when another camera replaced this one (close code 4000)', async () => {
    const { states, stop } = make();
    await vi.advanceTimersByTimeAsync(10);
    FakeSocket.instances[0]!.open();
    FakeSocket.instances[0]!.end(4000);
    await vi.advanceTimersByTimeAsync(5000);
    expect(states).toContain('failed');
    expect(FakeSocket.instances.length).toBe(1);
    stop();
  });

  it('stop() closes the socket and nothing more is sent', async () => {
    const { stop } = make();
    await vi.advanceTimersByTimeAsync(10);
    const socket = FakeSocket.instances[0]!;
    socket.open();
    stop();
    const before = socket.sent.length;
    await vi.advanceTimersByTimeAsync(500);
    expect(socket.readyState).toBe(3);
    expect(socket.sent.length).toBe(before);
  });
});
