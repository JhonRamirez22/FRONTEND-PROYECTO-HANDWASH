import { useEffect, useRef, useState } from 'react';
import { LoaderCircle, Play, Square } from 'lucide-react';
import { useSession } from '@/hooks/useSession';
import { useSessionStore } from '@/stores/sessionStore';
import type { Protocolo } from '@/types';
import { RuntimeEndpointConfig } from '@/lib/RuntimeEndpointConfig';
import type { ActiveStationSession } from '@/lib/StationApi';

interface ControlPanelProps {
  onBeforeStart?: () => Promise<void>;
  onStartFailure?: () => void;
  publicStation?: boolean;
  initialSession?: ActiveStationSession | null;
}

export function ControlPanel({ onBeforeStart, onStartFailure, publicStation = false, initialSession = null }: ControlPanelProps) {
  const [protocolo, setProtocolo] = useState<Protocolo>('DOMESTICO');
  const [isLoading, setIsLoading] = useState(false);
  const [resuming, setResuming] = useState(Boolean(initialSession));
  const [error, setError] = useState<string | null>(null);
  const { start, stop, resume, isActive, isOwner } = useSession();
  const sessionId = useSessionStore((state) => state.sessionId);
  const cloudMode = RuntimeEndpointConfig.isCloudMode();
  const requestId = useRef<string | null>(null);
  const resumedSessionId = useRef<string | null>(null);

  useEffect(() => {
    if (!initialSession || resumedSessionId.current === initialSession.sessionId) return;
    resumedSessionId.current = initialSession.sessionId;
    try {
      resume(initialSession);
    } catch {
      setError('No se pudo reconectar con la sesión activa del puesto.');
    } finally {
      setResuming(false);
    }
  }, [initialSession, resume]);

  async function handleStart() {
    setIsLoading(true);
    setError(null);
    try {
      await onBeforeStart?.();
      if (cloudMode && requestId.current === null) requestId.current = crypto.randomUUID();
      await start(protocolo, requestId.current ?? undefined);
      requestId.current = null;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudo iniciar la sesión.');
      onStartFailure?.();
    } finally {
      setIsLoading(false);
    }
  }

  async function handleStop() {
    setIsLoading(true);
    setError(null);
    try {
      await stop();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudo detener la sesión.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className="panel panel-padding" aria-labelledby="session-controls-title">
      <div className="panel-title-row">
        <div>
          <h2 id="session-controls-title">{publicStation ? 'Puesto de lavado' : 'Control de sesión'}</h2>
          <p>El backend Java valida el orden de las observaciones.</p>
        </div>
        <span className={`state-tag ${isActive ? 'state-tag-active' : 'state-tag-muted'}`}>
          {resuming ? 'Recuperando' : isActive ? 'Activa' : 'Inactiva'}
        </span>
      </div>

      {!isActive && (
        <fieldset className="duration-fieldset">
          <legend>Objetivo de duración</legend>
          <div className="duration-options">
            <button type="button" aria-pressed={protocolo === 'DOMESTICO'}
              onClick={() => setProtocolo('DOMESTICO')}>
              40 s
            </button>
            <button type="button" aria-pressed={protocolo === 'CLINICO_QUIRURGICO'}
              onClick={() => setProtocolo('CLINICO_QUIRURGICO')}>
              60 s
            </button>
          </div>
          <p>Duración objetivo de este prototipo; no representa una validación clínica.</p>
        </fieldset>
      )}

      {isActive && (
        <div className="session-id-block">
          <span>Sesión</span>
          <code>{sessionId ?? 'Sin sesión'}</code>
        </div>
      )}

      {cloudMode && (
        <p className="integration-note">
          {isActive
            ? 'Java mantiene la sesión. La cámara negocia WebRTC directo con el PC RTX; solo se mostrarán pasos que Java confirme.'
            : 'Al iniciar se solicitará la cámara y se abrirá la sesión. Después se negociará el enlace WebRTC con el PC RTX.'}
        </p>
      )}

      {error && <p className="form-error" role="alert">{error}</p>}

      {!isActive ? (
        <button className="button-primary session-action" type="button" onClick={() => void handleStart()} disabled={isLoading || resuming}>
          {isLoading || resuming ? <LoaderCircle className="animate-spin" size={17} /> : <Play size={17} fill="currentColor" />}
          {resuming ? 'Recuperando sesión…' : isLoading ? (publicStation ? 'Preparando puesto…' : 'Iniciando sesión…')
            : (publicStation ? 'Iniciar detección' : 'Iniciar sesión')}
        </button>
      ) : (
        <button className="button-danger session-action" type="button" onClick={() => void handleStop()} disabled={isLoading}>
          {isLoading ? <LoaderCircle className="animate-spin" size={17} /> : <Square size={16} fill="currentColor" />}
          {isLoading ? 'Cerrando sesión…' : isOwner ? 'Finalizar sesión' : 'Salir de la sesión'}
        </button>
      )}
    </section>
  );
}
