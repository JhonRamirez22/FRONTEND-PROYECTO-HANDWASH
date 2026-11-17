import { useCallback, useEffect, useState } from 'react';
import { Check, Monitor, X } from 'lucide-react';

export interface PendingPc { userCode: string; deviceName: string; address: string; ageSeconds: number }
export interface StationOption { stationId: string; stationName: string }

interface PendingPcsPanelProps {
  loadPending: () => Promise<PendingPc[]>;
  loadStations: () => Promise<StationOption[]>;
  approve: (userCode: string, stationId: string) => Promise<void>;
  reject: (userCode: string) => Promise<void>;
  pollMs?: number;
}

/** PCs with YOLO that announced themselves and wait for approval: compare the code on the PC, pick the station, approve. */
export function PendingPcsPanel({ loadPending, loadStations, approve, reject, pollMs = 4_000 }: PendingPcsPanelProps) {
  const [pending, setPending] = useState<PendingPc[]>([]);
  const [stations, setStations] = useState<StationOption[]>([]);
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [waiting, known] = await Promise.all([loadPending(), loadStations()]);
      setPending(waiting);
      setStations(known);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo consultar los PCs en espera.');
    }
  }, [loadPending, loadStations]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), pollMs);
    return () => window.clearInterval(timer);
  }, [refresh, pollMs]);

  async function run(userCode: string, action: () => Promise<void>, done: string) {
    if (busy) return;
    setBusy(userCode);
    setError(null);
    setNotice(null);
    try { await action(); setNotice(done); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo completar la acción.'); }
    finally { setBusy(null); }
  }

  return (
    <section className="admin-data-section pending-pcs" aria-labelledby="pending-pcs-title">
      <div className="admin-section-header">
        <div className="admin-section-title"><Monitor className="h-4 w-4" /><h2 id="pending-pcs-title">PCs esperando</h2></div>
      </div>
      <p className="admin-data-footnote">En el PC con la RTX ejecuta <code>INICIAR-HANDWASH</code>: muestra un código. Cuando aparezca aquí el mismo código, apruébalo y el PC queda conectado solo.</p>
      {error && <p className="form-error pending-pcs-message" role="alert">{error}</p>}
      {notice && <p className="station-admin-notice pending-pcs-message" role="status">{notice}</p>}
      {pending.length === 0
        ? <p className="admin-secondary-empty">Ningún PC esperando. Ejecuta INICIAR-HANDWASH en el PC con la RTX.</p>
        : stations.length === 0
          ? <p className="admin-secondary-empty">Crea primero un puesto con “Conectar un puesto” y luego aprueba el PC.</p>
          : <ul className="pending-pcs-list">{pending.map((pc) => {
            const stationId = chosen[pc.userCode] ?? stations[0]?.stationId ?? '';
            return <li key={pc.userCode}>
              <div className="pending-pcs-id"><code className="pending-pcs-code">{pc.userCode}</code>
                <span>{pc.deviceName} · hace {pc.ageSeconds} s</span></div>
              <label htmlFor={`pc-${pc.userCode}`} className="pending-pcs-label">Puesto para {pc.deviceName}</label>
              <select id={`pc-${pc.userCode}`} value={stationId} onChange={(event) => setChosen({ ...chosen, [pc.userCode]: event.target.value })}>
                {stations.map((station) => <option key={station.stationId} value={station.stationId}>{station.stationName}</option>)}
              </select>
              <button className="button-primary" type="button" disabled={busy !== null || !stationId}
                onClick={() => void run(pc.userCode, () => approve(pc.userCode, stationId), `PC “${pc.deviceName}” aprobado: se conecta solo en unos segundos.`)}>
                <Check className="h-4 w-4" />Aprobar
              </button>
              <button className="button-quiet" type="button" disabled={busy !== null}
                onClick={() => void run(pc.userCode, () => reject(pc.userCode), 'Solicitud rechazada.')}>
                <X className="h-4 w-4" />Rechazar
              </button>
            </li>;
          })}</ul>}
    </section>
  );
}
