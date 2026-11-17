import { useState, type FormEvent } from 'react';
import { Check, Clipboard, LoaderCircle, Plus } from 'lucide-react';
import type { ConnectedStation } from '@/lib/connectStation';

interface ConnectStationCardProps {
  onConnect: (name: string) => Promise<ConnectedStation>;
  /** Link the Mac's operator opens; shown as step 2. */
  operatorUrl: string;
}

export function ConnectStationCard({ onConnect, operatorUrl }: ConnectStationCardProps) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [connected, setConnected] = useState<ConnectedStation | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !name.trim()) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      setConnected(await onConnect(name.trim()));
      setName('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo crear el puesto.');
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!connected) return;
    try { await navigator.clipboard.writeText(connected.key); setNotice('Key copiada.'); }
    catch { setError('No se pudo copiar automáticamente. Selecciónala y cópiala a mano.'); }
  }

  return (
    <section className="admin-data-section connect-station" aria-labelledby="connect-station-title">
      <div className="admin-section-header">
        <div className="admin-section-title"><Plus className="h-4 w-4" /><h2 id="connect-station-title">Conectar un puesto</h2></div>
      </div>
      <p className="admin-data-footnote">Escribe el nombre del lavamanos. Te damos una sola key que sirve para el Mac del puesto y para el PC con YOLO.</p>

      <form className="station-code-form" onSubmit={(event) => void submit(event)}>
        <div>
          <label htmlFor="connect-station-name">Nombre del puesto</label>
          <input id="connect-station-name" value={name} maxLength={80} required placeholder="Ej. Lavamanos A"
            onChange={(event) => setName(event.target.value)} autoComplete="off" />
        </div>
        <button className="button-primary" type="submit" disabled={busy || !name.trim()}>
          {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Crear puesto
        </button>
      </form>
      {error && <p className="form-error connect-station-message" role="alert">{error}</p>}

      {connected && <div className="connect-station-result" role="status" aria-live="polite">
        <h3>“{connected.stationName}” está listo</h3>
        <p className="connect-station-warning">Esta key solo se muestra una vez. Cópiala ahora y entrégala por un canal privado.</p>
        <div className="connect-station-key">
          <code>{connected.key}</code>
          <button className="button-quiet" type="button" onClick={() => void copy()}><Clipboard className="h-4 w-4" />Copiar key</button>
        </div>
        {notice && <p className="station-admin-notice">{notice}</p>}
        <ol className="connect-station-steps">
          <li><strong>En el PC con YOLO:</strong> abre <code>INICIAR-HANDWASH</code> y pega la key cuando la pida. Déjalo encendido y se conecta solo.</li>
          <li><strong>En el Mac del lavamanos:</strong> abre <a href={operatorUrl}>{operatorUrl}</a> y pega la misma key.</li>
        </ol>
        <button className="button-quiet" type="button" onClick={() => { setConnected(null); setNotice(null); }}>
          <Check className="h-4 w-4" />Ya la guardé
        </button>
      </div>}
    </section>
  );
}
