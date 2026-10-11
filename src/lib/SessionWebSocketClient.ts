import type { ConnectionState } from '@/types';
import { RuntimeEndpointConfig } from '@/lib/RuntimeEndpointConfig';

const MAX_RECONNECT_ATTEMPTS = 10;
const BASE_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 30_000;

export interface SessionWebSocketHandlers {
  onMessage: (payload: string) => void;
  onStatusChange: (status: ConnectionState['status']) => void;
  onConnected: () => void;
  onReconnectAttempt: () => void;
  isSessionActive: () => boolean;
}

type WebSocketFactory = (url: string) => WebSocket;
type TicketProvider = (sessionId: string, accessToken: string | null) => Promise<string>;

async function requestTicket(
  sessionId: string,
  accessToken: string | null,
  apiBaseUrl: string,
): Promise<string> {
  const headers: Record<string, string> = {};
  if (accessToken) headers['X-Session-Token'] = accessToken;
  const response = await fetch(
    `${apiBaseUrl.replace(/\/+$/, '')}/api/v1/session/${encodeURIComponent(sessionId)}/websocket-ticket`,
    { method: 'POST', headers },
  );
  if (!response.ok) throw new Error(`WebSocket ticket request failed: HTTP ${response.status}`);
  const payload = (await response.json()) as { ticket?: unknown };
  if (typeof payload.ticket !== 'string' || payload.ticket.length < 32) {
    throw new Error('Backend returned an invalid WebSocket ticket');
  }
  return payload.ticket;
}

/** Owns one authenticated session socket and its bounded reconnection lifecycle. */
export class SessionWebSocketClient {
  private socket: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private connectionGeneration = 0;
  private readonly baseUrl: string;

  constructor(
    private readonly handlers: SessionWebSocketHandlers,
    private readonly createSocket: WebSocketFactory = (url) => new WebSocket(url),
    baseUrl = RuntimeEndpointConfig.websocketBaseUrl(),
    apiBaseUrl = RuntimeEndpointConfig.apiBaseUrl(),
    private readonly provideTicket: TicketProvider = (sessionId, token) =>
      requestTicket(sessionId, token, apiBaseUrl),
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  connect(sessionId: string, accessToken: string | null = null): void {
    this.clearReconnectTimer();
    const generation = ++this.connectionGeneration;
    const previous = this.socket;
    this.socket = null;
    if (previous && previous.readyState < WebSocket.CLOSING) {
      previous.close(1000, 'Nueva conexión de sesión');
    }

    this.handlers.onStatusChange('reconnecting');
    void this.connectWithTicket(sessionId, accessToken, generation);
  }

  private async connectWithTicket(
    sessionId: string,
    accessToken: string | null,
    generation: number,
  ): Promise<void> {
    let ticket: string;
    try {
      ticket = await this.provideTicket(sessionId, accessToken);
    } catch {
      if (generation !== this.connectionGeneration) return;
      this.handlers.onStatusChange('disconnected');
      if (this.handlers.isSessionActive()) this.scheduleReconnect(sessionId, accessToken);
      return;
    }
    if (generation !== this.connectionGeneration) return;

    const url = new URL(`${this.baseUrl}/ws/${encodeURIComponent(sessionId)}`);
    url.searchParams.set('ticket', ticket);

    const socket = this.createSocket(url.toString());
    this.socket = socket;
    socket.onopen = () => {
      if (this.socket !== socket || generation !== this.connectionGeneration) return;
      this.clearReconnectTimer();
      this.reconnectAttempts = 0;
      this.handlers.onStatusChange('connected');
      this.handlers.onConnected();
    };
    socket.onmessage = (event) => {
      if (this.socket === socket && generation === this.connectionGeneration) {
        this.handlers.onMessage(String(event.data));
      }
    };
    socket.onclose = () => {
      if (this.socket !== socket || generation !== this.connectionGeneration) return;
      this.socket = null;
      this.handlers.onStatusChange('disconnected');
      if (this.handlers.isSessionActive()) this.scheduleReconnect(sessionId, accessToken);
    };
    socket.onerror = () => {
      if (this.socket === socket && generation === this.connectionGeneration) socket.close();
    };
  }

  closeCurrent(code = 1000, reason = 'Conexión cerrada'): void {
    this.connectionGeneration += 1;
    const current = this.socket;
    this.socket = null;
    if (current && current.readyState < WebSocket.CLOSING) current.close(code, reason);
  }

  disconnect(): void {
    this.clearReconnectTimer();
    this.reconnectAttempts = 0;
    this.closeCurrent(1000, 'Cliente desconectado');
  }

  private scheduleReconnect(sessionId: string, accessToken: string | null): void {
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      this.handlers.onStatusChange('disconnected');
      return;
    }
    const delay = Math.min(
      BASE_RECONNECT_DELAY_MS * 2 ** this.reconnectAttempts,
      MAX_RECONNECT_DELAY_MS,
    );
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectAttempts += 1;
      this.handlers.onReconnectAttempt();
      this.connect(sessionId, accessToken);
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer === null) return;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }
}
