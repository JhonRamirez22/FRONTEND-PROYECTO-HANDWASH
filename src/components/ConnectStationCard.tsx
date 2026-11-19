import { useState, type FormEvent } from 'react';
import { Check, LoaderCircle, Plus } from 'lucide-react';
import type { ConnectedStation } from '@/lib/connectStation';
import { StationLinkActions, type IssuedStationLink } from './StationLinkActions';

interface ConnectStationCardProps {
  onConnect: (name: string) => Promise<ConnectedStation>;
  onIssueLink: (stationId: string, mac: boolean) => Promise<IssuedStationLink>;
  /** Where the console is served; the links are built from it. */
  origin: string;
}

export function ConnectStationCard({ onConnect, onIssueLink, origin }: ConnectStationCardProps) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState<ConnectedStation | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      setConnected(await onConnect(name.trim()));
      setName('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo crear el puesto.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-data-section connect-station" aria-labelledby="connect-station-title">
      <div className="admin-section-header">
        <div className="admin-section-title"><Plus className="h-4 w-4" /><h2 id="connect-station-title">Conectar un puesto</h2></div>
      </div>
      <p className="admin-data-footnote">Escribe el nombre del lavamanos. Te damos un enlace para su Mac: al abrirlo ya funciona, sin escribir keys. El PC con YOLO se conecta solo.</p>

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
        <ol className="connect-station-steps">
          <li><strong>En el Mac del lavamanos:</strong> genera el enlace, ábrelo en ese Mac y listo.</li>
          <li><strong>En el PC con YOLO:</strong> ejecuta <code>INICIAR-HANDWASH</code>. Muestra un código; apruébalo abajo en “PCs esperando”. Después se conecta solo.</li>
        </ol>
        <StationLinkActions stationId={connected.stationId} stationName={connected.stationName} origin={origin} onIssue={onIssueLink} />
        <button className="button-quiet" type="button" onClick={() => setConnected(null)}>
          <Check className="h-4 w-4" />Listo
        </button>
      </div>}
    </section>
  );
}
