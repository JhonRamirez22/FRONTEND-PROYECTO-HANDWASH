import { RuntimeEndpointConfig } from '@/lib/RuntimeEndpointConfig';
import { parseIceServers, type WebRtcAccess } from '@/lib/StationApi';

const CODE = /^[A-Za-z0-9_-]{40,64}$/;

/** The one-time code inside the QR link #/camera?c=CODE; null for any other hash. */
export function cameraCodeFromHash(hash: string): string | null {
  if (!hash.startsWith('#/camera?')) return null;
  const code = new URLSearchParams(hash.slice('#/camera?'.length)).get('c');
  return code !== null && CODE.test(code) ? code : null;
}

export type CameraStateResult =
  | { kind: 'active'; sessionId: string }
  | { kind: 'waiting' }
  | { kind: 'replaced' }
  | { kind: 'expired' };

export type CameraTicketResult =
  | { kind: 'ready'; sessionId: string; access: WebRtcAccess }
  | { kind: 'waiting' }
  | { kind: 'replaced' }
  | { kind: 'expired' };

async function payloadOf(response: Response): Promise<Record<string, unknown>> {
  try {
    const value: unknown = await response.json();
    return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

/** The phone side of the QR: it holds only a camera token, never a console or ADMIN session. */
export class CameraPairingApi {
  constructor(private readonly base: () => string = () => RuntimeEndpointConfig.apiBaseUrl()) {}

  async redeem(code: string): Promise<{ token: string; stationName: string }> {
    if (!CODE.test(code)) throw new Error('El código del celular no es válido. Escanea el QR otra vez.');
    const response = await fetch(`${this.base()}/api/v1/camera/redeem`, {
      method: 'POST', credentials: 'omit', cache: 'no-store',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }),
    });
    const payload = await payloadOf(response);
    if (response.status === 401) throw new Error('El código venció o ya se usó. Pide un QR nuevo en el panel.');
    if (!response.ok || typeof payload.cameraToken !== 'string') throw new Error('No se pudo conectar la cámara. Reintenta en unos segundos.');
    return { token: payload.cameraToken, stationName: typeof payload.stationName === 'string' ? payload.stationName : '' };
  }

  /** Which session the station has open now; cheap, issues no ticket. A network failure counts as waiting. */
  async state(token: string): Promise<CameraStateResult> {
    let response: Response;
    try {
      response = await fetch(`${this.base()}/api/v1/camera/state`, {
        method: 'POST', credentials: 'omit', cache: 'no-store', headers: { 'X-Camera-Token': token },
      });
    } catch {
      return { kind: 'waiting' };
    }
    if (response.status === 409) return { kind: 'replaced' };
    if (response.status === 401) return { kind: 'expired' };
    const payload = await payloadOf(response);
    return response.ok && typeof payload.sessionId === 'string' ? { kind: 'active', sessionId: payload.sessionId } : { kind: 'waiting' };
  }

  async ticket(token: string): Promise<CameraTicketResult> {
    let response: Response;
    try {
      response = await fetch(`${this.base()}/api/v1/camera/ticket`, {
        method: 'POST', credentials: 'omit', cache: 'no-store', headers: { 'X-Camera-Token': token },
      });
    } catch {
      return { kind: 'waiting' };
    }
    if (response.status === 204) return { kind: 'waiting' };
    if (response.status === 409) return { kind: 'replaced' };
    if (response.status === 401) return { kind: 'expired' };
    const payload = await payloadOf(response);
    const ticket = payload.ticket as Record<string, unknown> | undefined;
    if (!response.ok || typeof payload.sessionId !== 'string' || !ticket || typeof ticket.ticket !== 'string' || ticket.ticket.length < 32) {
      return { kind: 'waiting' };
    }
    return { kind: 'ready', sessionId: payload.sessionId, access: { ticket: ticket.ticket, iceServers: parseIceServers(ticket.iceServers) } };
  }
}
