import type { CameraRelayState, ProducerTelemetry } from './BrowserRtcCameraRelay';

export type StationGate = 'checking' | 'ready' | 'unregistered' | 'unavailable' | 'resume-error';
export type StationHealthCode =
  | 'OK' | 'SETUP' | 'CHECKING' | 'IDLE' | 'SERVER_UNREACHABLE' | 'SESSION_LOST' | 'CAMERA_LOST'
  | 'ANALYZER_OFFLINE' | 'RECONNECTING_SERVER' | 'RECONNECTING_ANALYZER' | 'ANALYZER_RECOVERING';
/** `offline` means nobody is being evaluated right now; it is never the person's fault. */
export type StationHealthLevel = 'ok' | 'connecting' | 'idle' | 'offline';

export interface StationHealthInput {
  gate: StationGate;
  sessionActive: boolean;
  hasStream: boolean;
  websocket: 'connected' | 'reconnecting' | 'disconnected';
  relay: CameraRelayState | 'idle';
  /** Milliseconds the relay has not been delivering video. */
  relayStalledMs: number;
  telemetryStale: boolean;
  javaTransport: ProducerTelemetry['javaTransport'] | null;
}

export interface StationHealth {
  level: StationHealthLevel;
  code: StationHealthCode;
  title: string;
  detail: string;
}

/** How long a missing PC may take to join before the kiosk says nothing is being evaluated. */
export const ANALYZER_GRACE_MS = 20_000;

const NOT_EVALUATING = 'El lavado no se está evaluando.';

function health(level: StationHealthLevel, code: StationHealthCode, title: string, detail: string): StationHealth {
  return { level, code, title, detail };
}

/** Pure decision, highest priority first, so the screen always names one real cause. */
export function evaluateStationHealth(input: StationHealthInput): StationHealth {
  if (input.gate === 'checking') return health('connecting', 'CHECKING', 'Verificando el puesto', 'Un momento.');
  if (input.gate === 'unregistered') {
    return health('idle', 'SETUP', 'Puesto pendiente de configuración', 'Solicita ayuda al operador.');
  }
  if (input.gate === 'unavailable') {
    return health('offline', 'SERVER_UNREACHABLE', 'Sin conexión con el servidor',
      `${NOT_EVALUATING} Se reintenta automáticamente.`);
  }
  if (input.gate === 'resume-error') {
    return health('offline', 'SESSION_LOST', 'Sesión no recuperable',
      `${NOT_EVALUATING} El sistema intentará abrir una nueva.`);
  }
  if (!input.sessionActive) {
    return health('idle', 'IDLE', 'Esperando sesión', 'El puesto empezará a evaluar cuando haya una sesión activa.');
  }
  if (input.websocket === 'disconnected') {
    return health('offline', 'SERVER_UNREACHABLE', 'Sin conexión con el servidor',
      `${NOT_EVALUATING} Se reintenta automáticamente.`);
  }
  if (!input.hasStream) {
    return health('offline', 'CAMERA_LOST', 'Cámara desconectada',
      `${NOT_EVALUATING} Se intenta recuperar la cámara.`);
  }
  if (input.websocket === 'reconnecting') {
    return health('connecting', 'RECONNECTING_SERVER', 'Reconectando con el servidor', 'Un momento.');
  }
  if (input.relay !== 'connected') {
    if (input.relayStalledMs > ANALYZER_GRACE_MS) {
      return health('offline', 'ANALYZER_OFFLINE', 'Sin conexión con el PC de análisis',
        `${NOT_EVALUATING} Se reintenta automáticamente.`);
    }
    return health('connecting', 'RECONNECTING_ANALYZER', 'Conectando con el PC de análisis', 'Un momento.');
  }
  if (input.telemetryStale) {
    return health('offline', 'ANALYZER_OFFLINE', 'El PC de análisis no responde',
      `${NOT_EVALUATING} Se reintenta automáticamente.`);
  }
  if (input.javaTransport === 'rejected' || input.javaTransport === 'reauthentication-required'
    || input.javaTransport === 'retrying' || input.javaTransport === 'session-ended') {
    return health('connecting', 'ANALYZER_RECOVERING', 'El PC de análisis se está reconectando', 'Un momento.');
  }
  return health('ok', 'OK', 'Evaluando', 'Estado confirmado por Java.');
}
