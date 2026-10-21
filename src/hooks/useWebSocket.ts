import { useCallback, useEffect, useRef } from 'react';
import { BackendMessageMapper } from '@/lib/BackendMessageMapper';
import { SessionWebSocketClient } from '@/lib/SessionWebSocketClient';
import { RuntimeEndpointConfig } from '@/lib/RuntimeEndpointConfig';
import { stationApi } from '@/lib/StationApi';
import { useConnectionStore } from '@/stores/connectionStore';
import { useSessionStore } from '@/stores/sessionStore';

const messageMapper = new BackendMessageMapper();
const API_URL = RuntimeEndpointConfig.apiBaseUrl();

export function useWebSocket(ticketProvider?: (sessionId: string) => Promise<string>) {
  const clientRef = useRef<SessionWebSocketClient | null>(null);
  const setStatus = useConnectionStore((state) => state.setStatus);
  const incrementReconnectAttempts = useConnectionStore((state) => state.incrementReconnectAttempts);
  const resetReconnectAttempts = useConnectionStore((state) => state.resetReconnectAttempts);
  const applyDetectionUpdate = useSessionStore((state) => state.applyDetectionUpdate);
  const finishSession = useSessionStore((state) => state.finishSession);

  const handleMessage = useCallback((payload: string) => {
    try {
      const parsed = messageMapper.parse(payload);
      if (parsed.kind === 'ignored') return;

      if (parsed.kind === 'summary') {
        finishSession(parsed.summary);
        clientRef.current?.closeCurrent(1000, 'Sesión finalizada');
        setStatus('disconnected');
        if (RuntimeEndpointConfig.isCloudMode()) {
          void stationApi.clearSession().catch(() => {
            console.warn('No se pudo limpiar la capacidad de sesión del puesto.');
          });
        }
        return;
      }
      applyDetectionUpdate(parsed.update);
    } catch {
      console.error('Failed to parse WebSocket message');
    }
  }, [applyDetectionUpdate, finishSession, setStatus]);

  if (clientRef.current === null) {
    clientRef.current = new SessionWebSocketClient({
      onMessage: handleMessage,
      onStatusChange: setStatus,
      onConnected: resetReconnectAttempts,
      onReconnectAttempt: incrementReconnectAttempts,
      isSessionActive: () => useSessionStore.getState().isActive,
    }, undefined, RuntimeEndpointConfig.websocketBaseUrl(), API_URL,
    ticketProvider ?? (RuntimeEndpointConfig.isCloudMode()
      ? (sessionId) => stationApi.websocketTicket(sessionId)
      : undefined),
    // Cloud stations run unattended: keep retrying with the capped backoff instead of giving up.
    RuntimeEndpointConfig.isCloudMode() ? Number.POSITIVE_INFINITY : undefined);
  }

  const connect = useCallback((sessionId: string, accessToken: string | null = null) => {
    clientRef.current?.connect(sessionId, accessToken);
  }, []);

  const disconnect = useCallback(() => {
    clientRef.current?.disconnect();
  }, []);

  useEffect(() => {
    return disconnect;
  }, [disconnect]);

  return { connect, disconnect };
}
