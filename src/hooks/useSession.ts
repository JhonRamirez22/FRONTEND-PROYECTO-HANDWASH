import { useCallback } from 'react';
import { useSessionStore } from '@/stores/sessionStore';
import { useWebSocket } from './useWebSocket';
import type { Protocolo } from '@/types';
import { RuntimeEndpointConfig } from '@/lib/RuntimeEndpointConfig';
import { CameraLinkError, ContinuityCameraService } from '@/lib/ContinuityCameraService';
import { ContinuityBrowserCameraService, stopTracks } from '@/lib/ContinuityBrowserCameraService';
import { cognitoAdminAuth } from '@/lib/adminAuth';

const API_URL = RuntimeEndpointConfig.apiBaseUrl();

export function useSession() {
  const { startSession, endSession, isActive, sessionId, accessToken, isOwner } = useSessionStore();
  const { connect, disconnect } = useWebSocket();

  const linkCamera = useCallback(async (signal: AbortSignal) => {
    const current = useSessionStore.getState();
    if (current.isActive && current.sessionId && current.accessToken) {
      try {
        const message = await ContinuityCameraService.link(current.sessionId, current.accessToken, signal);
        if (signal.aborted || useSessionStore.getState().sessionId !== current.sessionId) {
          throw new DOMException('Enlace cancelado', 'AbortError');
        }
        return message;
      } catch (error) {
        if (!(error instanceof CameraLinkError)) throw error;
      }
    }
    if (signal.aborted || useSessionStore.getState().sessionId !== current.sessionId) {
      throw new DOMException('Enlace cancelado', 'AbortError');
    }
    const result = await ContinuityCameraService.linkLocal(signal);
    if (signal.aborted || useSessionStore.getState().sessionId !== current.sessionId) {
      throw new DOMException('Enlace cancelado', 'AbortError');
    }
    const { session } = result;
    startSession(session.sessionId, session.protocolo, session.accessToken, false);
    connect(session.sessionId, session.accessToken);
    return result.message;
  }, [startSession, connect]);

  const start = useCallback(
    async (protocolo: Protocolo) => {
      try {
        const cloudMode = RuntimeEndpointConfig.isCloudMode();
        const humanToken = cloudMode ? cognitoAdminAuth.getAccessToken() : null;
        if (cloudMode && !humanToken) throw new Error('Inicia sesión como OPERADOR para abrir una sesión.');

        if (cloudMode) {
          const response = await fetch(`${API_URL}/api/v1/session`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${humanToken}`,
            },
            body: JSON.stringify({ protocolo, producerProtocolVersion: '2' }),
            cache: 'no-store',
          });
          if (!response.ok) {
            throw new Error(response.status === 403
              ? 'La cuenta Cognito requiere el grupo OPERATOR o ADMIN.'
              : `No se pudo crear la sesión: HTTP ${response.status}`);
          }
          const data = await response.json() as {
            sessionId: string; protocolo: Protocolo; accessToken?: string; pairingCode?: string;
          };
          if (!data.sessionId || !data.accessToken) throw new Error('Respuesta de sesión cloud inválida.');
          startSession(data.sessionId, data.protocolo, data.accessToken, true);
          connect(data.sessionId, data.accessToken);
          return data.pairingCode ?? null;
        }

        const activeResponse = await fetch(`${API_URL}/api/v1/session/active`);
        let data: { sessionId: string; protocolo: Protocolo; pairingCode?: string; accessToken?: string } | null = null;

        if (activeResponse.ok && activeResponse.status !== 204) {
          const active = (await activeResponse.json()) as { sessionId: string; protocolo: Protocolo; accessRequired?: boolean };
          if (active.protocolo === protocolo && active.accessRequired === false) {
            const detailResponse = await fetch(`${API_URL}/api/v1/session/${active.sessionId}`);
            if (!detailResponse.ok) throw new Error('No se pudo consultar la sesión activa');
            data = (await detailResponse.json()) as { sessionId: string; protocolo: Protocolo; pairingCode?: string };
          }
        } else if (activeResponse.status !== 204 && activeResponse.status !== 409) {
          throw new Error(`No se pudo consultar la sesión activa: HTTP ${activeResponse.status}`);
        }

        const response = data ? null : await fetch(`${API_URL}/api/v1/session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ protocolo, producerProtocolVersion: '2' }),
        });

        if (response && !response.ok) {
          throw new Error(`Failed to create session: ${response.statusText}`);
        }

        if (!data && response) data = (await response.json()) as { sessionId: string; protocolo: Protocolo; pairingCode?: string; accessToken?: string };
        if (!data) throw new Error('No se pudo obtener una sesión activa');
        if (response && !data.accessToken) throw new Error('Falta el token de sesión');
        startSession(data.sessionId, protocolo, data.accessToken ?? null);
        connect(data.sessionId, data.accessToken ?? null);
        return data.pairingCode ?? null;
      } catch (error) {
        console.error('Error starting session:', error);
        throw error;
      }
    },
    [startSession, connect]
  );

  const join = useCallback(async (code: string) => {
    const response = await fetch(`${API_URL}/api/v1/auth/dashboard-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: code.trim() }),
    });
    if (!response.ok) {
      throw new Error(response.status === 404
        ? 'Código inválido o sesión terminada'
        : `No se pudo vincular la sesión: HTTP ${response.status}`);
    }
    const paired = (await response.json()) as {
      sessionId: string; protocolo: Protocolo; role: 'VIEWER'; accessToken: string;
    };
    if (!paired.sessionId || !paired.accessToken || paired.role !== 'VIEWER') {
      throw new Error('Respuesta de vinculación del dashboard inválida');
    }
    startSession(paired.sessionId, paired.protocolo, paired.accessToken, false);
    connect(paired.sessionId, paired.accessToken);
  }, [startSession, connect]);

  const stop = useCallback(async () => {
    if (!sessionId) return;

    if (!isOwner) {
      disconnect();
      endSession();
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/v1/session/${sessionId}`, {
        method: 'DELETE',
        headers: accessToken ? { 'X-Session-Token': accessToken } : {},
      });
      if (!response.ok) throw new Error(`No se pudo detener la sesión: HTTP ${response.status}`);
      disconnect();
      endSession();
    } catch (error) {
      console.error('Error stopping session:', error);
      throw error;
    }
  }, [sessionId, accessToken, isOwner, disconnect, endSession]);

  const linkCloudCamera = useCallback(async (signal: AbortSignal) => {
    if (!RuntimeEndpointConfig.isCloudMode()) throw new Error('La captura web solo está disponible en modo cloud.');
    if (!cognitoAdminAuth.getAccessToken()) {
      throw new Error('Inicia sesión como OPERADOR antes de abrir la cámara.');
    }
    const stream = await ContinuityBrowserCameraService.open();
    if (signal.aborted) {
      stopTracks(stream);
      throw new DOMException('Enlace cancelado', 'AbortError');
    }
    return {
      stream,
      message: 'Vista previa local abierta. Sin relay WebRTC, el video no llega a la PC RTX ni se evalúan pasos.',
    };
  }, []);

  return { start, join, stop, linkCamera, linkCloudCamera, isActive, isOwner };
}
