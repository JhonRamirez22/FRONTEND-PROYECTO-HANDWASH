import { useEffect, useState } from 'react';
import { Link2 } from 'lucide-react';
import { StationLinkActions, type IssuedStationLink } from './StationLinkActions';

interface StationSummary { stationId: string; stationName: string }

interface StationLinksPanelProps {
  loadStations: () => Promise<StationSummary[]>;
  onIssue: (stationId: string, mac: boolean) => Promise<IssuedStationLink>;
  origin: string;
}

/** A link for any existing station: the Mac or phone that opens it is ready, no key involved. */
export function StationLinksPanel({ loadStations, onIssue, origin }: StationLinksPanelProps) {
  const [stations, setStations] = useState<StationSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadStations()
      .then((list) => { if (alive) setStations(list); })
      .catch((cause: unknown) => { if (alive) setError(cause instanceof Error ? cause.message : 'No se pudieron cargar los puestos.'); });
    return () => { alive = false; };
  }, [loadStations]);

  return (
    <section className="admin-data-section" aria-labelledby="station-links-title">
      <div className="admin-section-header">
        <div className="admin-section-title"><Link2 className="h-4 w-4" /><h2 id="station-links-title">Enlaces de puesto</h2></div>
      </div>
      <p className="admin-data-footnote">Pásale el enlace a un Mac o celular: al abrirlo queda funcionando en ese puesto, sin keys ni códigos.</p>
      {error && <p className="form-error connect-station-message" role="alert">{error}</p>}
      {stations?.length === 0 && <p className="admin-data-footnote">Aún no hay puestos. Crea uno arriba.</p>}
      <div className="station-links-list">
        {stations?.map((station) => <div key={station.stationId} className="station-links-item">
          <h3>{station.stationName}</h3>
          <StationLinkActions stationId={station.stationId} stationName={station.stationName} origin={origin} onIssue={onIssue} />
        </div>)}
      </div>
    </section>
  );
}
