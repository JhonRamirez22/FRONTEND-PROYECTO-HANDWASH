import { RuntimeEndpointConfig } from './RuntimeEndpointConfig';
import type { Protocolo } from '@/types';

export class CameraLinkError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export class ContinuityCameraService {
  static async link(sessionId: string, accessToken: string, signal?: AbortSignal): Promise<string> {
    const controller = new AbortController();
    const cancel = () => controller.abort();
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) controller.abort();
    const timeout = window.setTimeout(() => controller.abort(), 5_000);
    try {
      const response = await fetch(
        `${RuntimeEndpointConfig.apiBaseUrl()}/api/v1/session/${encodeURIComponent(sessionId)}/camera/link`,
        { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` },
          signal: controller.signal, cache: 'no-store' },
      );
      if ([401, 404, 409].includes(response.status)) throw new CameraLinkError('La sesión de cámara cambió; vuelve a enlazar.', response.status);
      const body = await response.json() as { status?: string; message?: string };
      if (typeof body.message !== 'string') throw new Error('Respuesta de cámara inválida.');
      if (response.status === 429 && body.status === 'busy') return body.message;
      if (!response.ok) throw new Error(body.message);
      if (body.status !== 'connected' && body.status !== 'reconnecting') {
        throw new Error('No se pudo confirmar la solicitud de enlace.');
      }
      return body.message;
    } finally {
      signal?.removeEventListener('abort', cancel);
      window.clearTimeout(timeout);
    }
  }

  static async linkLocal(signal: AbortSignal): Promise<{
    message: string; session: { sessionId: string; protocolo: Protocolo; role: 'VIEWER'; accessToken: string };
  }> {
    const response = await fetch(`${window.location.origin}/api/v1/camera/link`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Handwash-Local-UI': '1' },
      body: '{}', signal, cache: 'no-store',
    });
    if (response.status === 404) throw new Error('Usa scripts/start_handwash_web.sh para habilitar el enlace local.');
    const body = await response.json();
    if (!response.ok) throw new Error(typeof body.message === 'string' ? body.message : 'No se pudo enlazar el iPhone. Vuelve a intentarlo.');
    const session = body.session;
    if (!session || typeof session.sessionId !== 'string' || !session.sessionId
      || typeof session.accessToken !== 'string' || !session.accessToken
      || session.role !== 'VIEWER'
      || !['DOMESTICO', 'CLINICO_QUIRURGICO'].includes(session.protocolo)
      || typeof body.message !== 'string'
      || !['connected', 'reconnecting'].includes(body.status)) {
      throw new Error('Respuesta de enlace local inválida.');
    }
    return { message: body.message, session };
  }
}
