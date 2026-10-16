import { useState, type FormEvent } from 'react';
import { ArrowRight, LoaderCircle, ShieldCheck } from 'lucide-react';
import { stationApi } from '@/lib/StationApi';

interface StationEnrollmentPageProps {
  onEnrolled: (stationName: string) => void;
  onRetry: () => void;
  unavailable?: boolean;
  error?: string | null;
}

export function StationEnrollmentPage({ onEnrolled, onRetry, unavailable = false, error: initialError }:
  StationEnrollmentPageProps) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const station = await stationApi.enroll(code);
      setCode('');
      onEnrolled(station.stationName);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo registrar este puesto.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="access-page station-enrollment-page">
      <header className="station-enrollment-header">
        <a className="brand-lockup station-enrollment-brand" href="#/" aria-label="HandWash, puesto">
          <span className="brand-mark"><img src="/handwash-logo.png" alt="" /></span>
          <span><strong>HandWash</strong><small>Estación de lavado</small></span>
        </a>
        <span className={`station-enrollment-status ${unavailable ? 'is-warning' : ''}`} role="status">
          <span className={`status-indicator ${unavailable ? 'is-warning' : 'is-pending'}`} aria-hidden="true" />
          {unavailable ? 'Servicio sin respuesta' : 'Inscripción pendiente'}
        </span>
      </header>

      <section className="access-panel" aria-labelledby="station-enrollment-title">
        <div className="access-copy">
          <h1 id="station-enrollment-title">Registrar este puesto</h1>
          <p>Un administrador debe entregar un código de inscripción de un solo uso. Después, este equipo podrá iniciar sesiones sin cuenta personal.</p>
        </div>
        {error && !unavailable && <p className="form-error" role="alert">{error}</p>}
        {unavailable ? (
          <div className="setup-notice" role="alert">
            <strong>No se pudo contactar el servicio</strong>
            <span>El puesto no se registró. Comprueba la conexión y vuelve a intentarlo.</span>
            <button className="admin-retry-button" type="button" onClick={onRetry}>Reintentar</button>
          </div>
        ) : (
          <form className="station-enrollment-form" onSubmit={(event) => void handleSubmit(event)}>
            <label htmlFor="station-enrollment-code">Código de inscripción</label>
            <input
              id="station-enrollment-code"
              name="enrollmentCode"
              type="password"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              inputMode="text"
              minLength={30}
              maxLength={100}
              required
              aria-describedby="station-enrollment-help"
            />
            <p id="station-enrollment-help">El código vence en 10 minutos y solo puede usarse una vez.</p>
            <button className="button-primary access-submit" type="submit" disabled={submitting || code.trim().length < 30}>
              {submitting ? <><LoaderCircle className="animate-spin" size={17} /> Registrando puesto…</>
                : <>Registrar estación <ArrowRight size={17} /> </>}
            </button>
          </form>
        )}
        <div className="access-note"><ShieldCheck size={16} /><span>La credencial del puesto se mantiene en una cookie segura y no se expone al navegador.</span></div>
      </section>
      <aside className="access-aside">
        <h2>Listo para la cámara; inferencia aún pendiente</h2>
        <p>La cámara solicita permiso al iniciar. La vista previa permanece en este navegador; todavía no se transmite a la PC RTX ni se evalúan pasos.</p>
        <div className="access-limits" role="group" aria-label="Estado de la integración">
          <span><i className="legend-dot dot-blue" />Continuity: vista local</span>
          <span><i className="legend-dot dot-amber" />RTX / YOLO: sin conectar</span>
          <span><i className="legend-dot dot-service" />Servicio: {unavailable ? 'sin verificar' : 'puesto sin registrar'}</span>
          <span><i className="legend-dot dot-gray" />Imágenes: no se guardan</span>
        </div>
      </aside>
    </main>
  );
}
