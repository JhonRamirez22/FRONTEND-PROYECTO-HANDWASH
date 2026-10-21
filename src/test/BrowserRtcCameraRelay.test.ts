import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrowserRtcCameraRelay, parseProducerTelemetry } from '@/lib/BrowserRtcCameraRelay';
import { stationApi } from '@/lib/StationApi';

vi.mock('@/lib/StationApi', () => ({
  stationApi: { webrtcAccess: vi.fn(async () => ({ ticket: 't'.repeat(43), iceServers: [] })) },
}));

class FakeSocket {
  static readonly OPEN = 1;
  static last: FakeSocket;
  readyState = 0;
  sent: Record<string, unknown>[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  constructor() { FakeSocket.last = this; }
  send(data: string) { this.sent.push(JSON.parse(data)); }
  close() { this.readyState = 3; }
  open() { this.readyState = FakeSocket.OPEN; this.onopen?.(); }
}

class FakePeer {
  static last: FakePeer;
  static configs: (RTCConfiguration | undefined)[] = [];
  onicecandidate: ((event: { candidate: RTCIceCandidateInit | null }) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  constructor(config?: RTCConfiguration) { FakePeer.last = this; FakePeer.configs.push(config); }
  createDataChannel() { return { onmessage: null }; }
  addTrack() { return {}; }
  async close() {}
}

describe('browser WebRTC signaling', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('relays trickled ICE but never sends the null end-of-gathering candidate Java rejects', async () => {
    vi.stubGlobal('WebSocket', FakeSocket);
    vi.stubGlobal('RTCPeerConnection', FakePeer);
    const track = { readyState: 'live' };
    const stream = { getVideoTracks: () => [track] } as unknown as MediaStream;

    const connecting = new BrowserRtcCameraRelay().connect('session-1', stream, () => {});
    await vi.waitFor(() => expect(FakeSocket.last?.onopen).toBeTypeOf('function'));
    FakeSocket.last.open();
    const release = await connecting;

    FakePeer.last.onicecandidate?.({ candidate: { candidate: 'candidate:1 1 udp 1 192.168.1.2 5000 typ host',
      sdpMid: '0', sdpMLineIndex: 0 } });
    FakePeer.last.onicecandidate?.({ candidate: { candidate: '', sdpMid: '0', sdpMLineIndex: 0 } });
    FakePeer.last.onicecandidate?.({ candidate: null });

    expect(FakeSocket.last.sent).toEqual([
      { type: 'candidate', candidate: 'candidate:1 1 udp 1 192.168.1.2 5000 typ host', sdpMid: '0', sdpMLineIndex: 0 },
      { type: 'candidate', candidate: '', sdpMid: '0', sdpMLineIndex: 0 },
    ]);
    expect(FakeSocket.last.sent.some((message) => message.candidate === null)).toBe(false);
    release();
  });
});

describe('producer WebRTC telemetry', () => {
  it('accepts only bounded operational status and never requires step labels', () => {
    expect(parseProducerTelemetry(JSON.stringify({
      type: 'producer-status', modelsReady: true, activeModelsReady: true,
      challengerReady: false, inferenceFps: 5, inferenceMs: 91,
      javaTransport: 'connected', clinicalValidation: 'NOT_VALIDATED',
    }))).toEqual({
      modelsReady: true, activeModelsReady: true, challengerReady: false,
      inferenceFps: 5, inferenceMs: 91, javaTransport: 'connected',
      clinicalValidation: 'NOT_VALIDATED',
    });
  });

  it('rejects malformed, oversized, unbounded or clinical-approval claims', () => {
    expect(parseProducerTelemetry('{')).toBeNull();
    expect(parseProducerTelemetry('x'.repeat(4097))).toBeNull();
    expect(parseProducerTelemetry(JSON.stringify({ type: 'producer-status', inferenceFps: 1000 }))).toBeNull();
    expect(parseProducerTelemetry(JSON.stringify({
      type: 'producer-status', modelsReady: true, activeModelsReady: true,
      challengerReady: true, inferenceFps: 5, inferenceMs: 2,
      javaTransport: 'connected', clinicalValidation: 'APPROVED', step: 'PASO_1_PALMAS',
    }))).toBeNull();
  });

  it('builds every peer with the ICE servers Java issued, so a Mac on another network can reach the PC', async () => {
    const turn = { urls: ['turns:turn.example.org:443?transport=tcp'], username: '1792603600:s:BROWSER', credential: 'cred=' };
    vi.mocked(stationApi.webrtcAccess).mockResolvedValueOnce({ ticket: 't'.repeat(43), iceServers: [turn] });
    vi.stubGlobal('WebSocket', FakeSocket);
    vi.stubGlobal('RTCPeerConnection', FakePeer);
    FakePeer.configs = [];
    const stream = { getVideoTracks: () => [{ readyState: 'live' }] } as unknown as MediaStream;

    const connecting = new BrowserRtcCameraRelay().connect('session-1', stream, () => {});
    await vi.waitFor(() => expect(FakeSocket.last?.onopen).toBeTypeOf('function'));
    FakeSocket.last.open();
    const release = await connecting;
    FakeSocket.last.onmessage?.({ data: JSON.stringify({ type: 'peer-left' }) });

    expect(FakePeer.configs).toEqual([{ iceServers: [turn] }, { iceServers: [turn] }]);
    release();
  });
});
