import { useState } from 'react';
import { LoaderCircle, Play, Square } from 'lucide-react';
import { useSession } from '@/hooks/useSession';
import { useSessionStore } from '@/stores/sessionStore';
import type { Protocolo } from '@/types';
import { RuntimeEndpointConfig } from '@/lib/RuntimeEndpointConfig';

export function ControlPanel() {
  const [protocolo, setProtocolo] = useState<Protocolo>('DOMESTICO');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { start, stop, isActive, isOwner } = useSession();
  const sessionId = useSessionStore((state) => state.sessionId);
  const cloudMode = RuntimeEndpointConfig.isCloudMode();

  async function handleStart() {
    setIsLoading(true);
    setError(null);
    try {
      await start(protocolo);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudo iniciar la sesión.');
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
          <h2 id="session-controls-title">Control de sesión</h2>
          <p>El backend Java valida el orden de las observaciones.</p>
        </div>
        <span className={`state-tag ${isActive ? 'state-tag-active' : 'state-tag-muted'}`}>
          {isActive ? 'Activa' : 'Inactiva'}
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
            ? 'La sesión está abierta en Java. El productor RTX aún no está conectado; no se están evaluando pasos desde esta cámara.'
            : 'Primero enlaza la cámara local. La conexión de video con la PC RTX aún no está disponible.'}
        </p>
      )}

      {error && <p className="form-error" role="alert">{error}</p>}

      {!isActive ? (
        <button className="button-primary session-action" type="button" onClick={() => void handleStart()} disabled={isLoading}>
          {isLoading ? <LoaderCircle className="animate-spin" size={17} /> : <Play size={17} fill="currentColor" />}
          {isLoading ? 'Iniciando sesión…' : 'Iniciar sesión'}
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
