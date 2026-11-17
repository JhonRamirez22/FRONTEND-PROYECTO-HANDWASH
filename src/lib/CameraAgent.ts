export interface AgentView {
  online: boolean;
  /** The console asked for the iPhone helper (renewed while the console stays open). */
  wanted: boolean;
  state: 'none' | 'offline' | 'ready' | 'streaming' | 'waiting' | 'no-iphone' | 'error';
  device: string;
  message: string;
}

export interface AgentDescription {
  tone: 'ok' | 'wait' | 'warn';
  text: string;
  /** After a while without a helper, the browser camera is offered as a way out. */
  browserFallback: boolean;
}

const HELPER_GRACE_MS = 12_000;

/** What the iPhone button shows next to it: plain Spanish, never a guess about the video. */
export function describeAgent(input: { agent: AgentView | null; requested: boolean; waitedMs: number }): AgentDescription | null {
  const { agent, requested, waitedMs } = input;
  if (!requested) return null;
  if (!agent?.online) {
    return waitedMs < HELPER_GRACE_MS
      ? { tone: 'wait', text: 'Buscando el ayudante de este Mac…', browserFallback: false }
      : { tone: 'warn', browserFallback: true,
        text: 'El ayudante del Mac no está abierto. En el Mac abre INICIAR-CAMARA-IPHONE (carpeta HandWash_Camara_Mac) o usa el navegador.' };
  }
  switch (agent.state) {
    case 'streaming': return { tone: 'ok', text: 'Enviando el video del iPhone al PC con YOLO.', browserFallback: false };
    case 'no-iphone': return { tone: 'warn', browserFallback: true,
      text: 'El ayudante no ve el iPhone: acércalo, desbloquéalo y activa Wi-Fi y Bluetooth (mismo Apple ID que el Mac).' };
    case 'error': return { tone: 'warn', browserFallback: true,
      text: `El ayudante tuvo un problema: ${agent.message || 'revisa el permiso de cámara de Terminal'}.` };
    default: return { tone: 'ok', browserFallback: false,
      text: `Ayudante conectado${agent.device ? ` (${agent.device})` : ''}. Inicia el turno para empezar a enviar el video.` };
  }
}
