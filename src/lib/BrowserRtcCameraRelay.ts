import { RuntimeEndpointConfig } from './RuntimeEndpointConfig';
import { stationApi } from './StationApi';

export type CameraRelayState = 'connecting' | 'waiting-peer' | 'connected' | 'disconnected' | 'failed';
export interface ProducerTelemetry {
  modelsReady: boolean;
  activeModelsReady: boolean;
  challengerReady: boolean;
  inferenceFps: number;
  inferenceMs: number;
  javaTransport: 'waiting' | 'connected' | 'retrying' | 'rejected' | 'reauthentication-required' | 'session-ended';
  clinicalValidation: 'NOT_VALIDATED';
}

export function parseProducerTelemetry(value: unknown): ProducerTelemetry | null {
  if (typeof value !== 'string' || value.length > 4096) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { return null; }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  const status = parsed as Record<string, unknown>;
  const transports: ProducerTelemetry['javaTransport'][] = [
    'waiting', 'connected', 'retrying', 'rejected', 'reauthentication-required', 'session-ended',
  ];
  if (status.type !== 'producer-status' || typeof status.modelsReady !== 'boolean'
    || typeof status.activeModelsReady !== 'boolean' || typeof status.challengerReady !== 'boolean'
    || typeof status.inferenceFps !== 'number' || !Number.isFinite(status.inferenceFps)
    || status.inferenceFps < 0 || status.inferenceFps > 60
    || typeof status.inferenceMs !== 'number' || !Number.isFinite(status.inferenceMs)
    || status.inferenceMs < 0 || status.inferenceMs > 60_000
    || !transports.includes(status.javaTransport as ProducerTelemetry['javaTransport'])
    || status.clinicalValidation !== 'NOT_VALIDATED') return null;
  return {
    modelsReady: status.modelsReady,
    activeModelsReady: status.activeModelsReady,
    challengerReady: status.challengerReady,
    inferenceFps: status.inferenceFps,
    inferenceMs: status.inferenceMs,
    javaTransport: status.javaTransport as ProducerTelemetry['javaTransport'],
    clinicalValidation: 'NOT_VALIDATED',
  };
}

/** Sends only the browser's live video track to the authenticated RTX peer; it never records media. */
export class BrowserRtcCameraRelay {
  async connect(sessionId: string, stream: MediaStream,
    onState: (state: CameraRelayState) => void, signal?: AbortSignal,
    onTelemetry?: (status: ProducerTelemetry | null) => void): Promise<() => void> {
    const ticket = await stationApi.webrtcTicket(sessionId);
    if (signal?.aborted) throw new DOMException('Enlace WebRTC cancelado', 'AbortError');
    const wsBase = new URL(RuntimeEndpointConfig.websocketBaseUrl(), window.location.origin);
    wsBase.protocol = wsBase.protocol === 'https:' ? 'wss:' : 'ws:';
    wsBase.pathname = `/ws/webrtc/${encodeURIComponent(sessionId)}`;
    wsBase.search = new URLSearchParams({ ticket }).toString();

    const socket = new WebSocket(wsBase);
    let peer!: RTCPeerConnection;
    let queuedCandidates: RTCIceCandidateInit[] = [];
    let disposed = false;
    let offerStarted = false;
    let remoteDescriptionSet = false;
    const send = (payload: unknown) => {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
    };
    const createPeer = () => {
      const activePeer = new RTCPeerConnection({ iceServers: [] });
      peer = activePeer;
      const statusChannel = activePeer.createDataChannel('producer-status');
      statusChannel.onmessage = (event) => {
        if (!disposed && activePeer === peer) onTelemetry?.(parseProducerTelemetry(event.data));
      };
      for (const track of stream.getVideoTracks()) activePeer.addTrack(track, stream);
      activePeer.onicecandidate = ({ candidate }) => send(candidate
        ? { type: 'candidate', candidate: candidate.candidate,
          sdpMid: candidate.sdpMid, sdpMLineIndex: candidate.sdpMLineIndex }
        : { type: 'candidate', candidate: null });
      activePeer.onconnectionstatechange = () => {
        if (disposed || activePeer !== peer) return;
        if (activePeer.connectionState === 'connected') onState('connected');
        else if (activePeer.connectionState === 'failed' || activePeer.connectionState === 'closed') onState('failed');
        else if (activePeer.connectionState === 'disconnected') onState('disconnected');
      };
    };
    try {
      createPeer();
    } catch (error) {
      socket.close();
      throw error;
    }
    socket.onmessage = (event) => {
      let message: Record<string, unknown>;
      try {
        const parsed: unknown = JSON.parse(String(event.data));
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return;
        message = parsed as Record<string, unknown>;
      } catch { return; }
      if (message.type === 'peer-ready') {
        onState('waiting-peer');
        if (offerStarted) return;
        offerStarted = true;
        const activePeer = peer;
        if (!activePeer) return;
        void activePeer.createOffer().then((offer) => activePeer.setLocalDescription(offer))
          .then(() => {
            if (activePeer === peer) send({ type: 'offer', sdp: activePeer.localDescription });
          }).catch(() => onState('failed'));
      } else if (message.type === 'answer' && isDescription(message.sdp, 'answer')) {
        const activePeer = peer;
        if (!activePeer) return;
        void activePeer.setRemoteDescription(message.sdp).then(async () => {
          if (activePeer !== peer) return;
          remoteDescriptionSet = true;
          for (const candidate of queuedCandidates.splice(0)) await activePeer.addIceCandidate(candidate);
        }).catch(() => onState('failed'));
      } else if (message.type === 'candidate') {
        const candidate = parseCandidate(message);
        if (!candidate) return;
        if (!remoteDescriptionSet) {
          if (queuedCandidates.length < 256) queuedCandidates.push(candidate);
        } else {
          const activePeer = peer;
          if (!activePeer) return;
          void activePeer.addIceCandidate(candidate).catch(() => onState('failed'));
        }
      } else if (message.type === 'peer-left') {
        offerStarted = false;
        remoteDescriptionSet = false;
        queuedCandidates = [];
        onTelemetry?.(null);
        onState('waiting-peer');
        const oldPeer = peer;
        try {
          createPeer();
          void oldPeer.close();
        } catch {
          onState('failed');
        }
      }
    };

    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => finish(new Error('Se agotó el tiempo conectando señalización Java.')), 10_000);
        const onAbort = () => finish(new DOMException('Enlace WebRTC cancelado', 'AbortError'));
        const finish = (error?: Error) => {
          window.clearTimeout(timeout);
          signal?.removeEventListener('abort', onAbort);
          if (error) reject(error); else resolve();
        };
        signal?.addEventListener('abort', onAbort, { once: true });
        if (signal?.aborted) { onAbort(); return; }
        socket.onopen = () => finish();
        socket.onerror = () => finish(new Error('No se pudo abrir la señalización WebRTC de Java.'));
        socket.onclose = () => {
          finish(new Error('Java cerró la señalización WebRTC.'));
          if (!disposed) onState('disconnected');
        };
      });
      if (!stream.getVideoTracks().some((track) => track.readyState === 'live')) {
        throw new Error('La cámara dejó de entregar video antes del enlace RTX.');
      }
      onState('waiting-peer');
    } catch (error) {
      disposed = true;
      socket.close();
      await peer.close();
      throw error;
    }

    return () => {
      disposed = true;
      socket.close(1000, 'Fin de sesión');
      void peer.close();
    };
  }
}

function isDescription(value: unknown, expectedType: string): value is RTCSessionDescriptionInit {
  if (typeof value !== 'object' || value === null) return false;
  const description = value as Record<string, unknown>;
  return description.type === expectedType && typeof description.sdp === 'string'
    && description.sdp.length > 0 && description.sdp.length <= 200_000;
}

function parseCandidate(message: Record<string, unknown>): RTCIceCandidateInit | null {
  if (typeof message.candidate !== 'string' || message.candidate.length === 0
    || message.candidate.length > 4_096) return null;
  if (message.sdpMid !== undefined && message.sdpMid !== null
    && (typeof message.sdpMid !== 'string' || message.sdpMid.length > 32)) return null;
  const index = message.sdpMLineIndex;
  if (index !== undefined && index !== null
    && (!Number.isInteger(index) || (index as number) < 0 || (index as number) > 128)) return null;
  return { candidate: message.candidate,
    ...(typeof message.sdpMid === 'string' ? { sdpMid: message.sdpMid } : {}),
    ...(typeof index === 'number' ? { sdpMLineIndex: index } : {}) };
}
