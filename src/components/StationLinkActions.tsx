import { useState } from 'react';
import { Clipboard, LoaderCircle, Link2 } from 'lucide-react';
import { stationLinkUrl, type StationLinkTarget } from '@/lib/stationLink';
import { QrImage } from './QrImage';

export interface IssuedStationLink { code: string; expiresInSeconds: number }

interface StationLinkActionsProps {
  stationId: string;
  stationName: string;
  /** Where the console is served, e.g. https://app.example; the link is built from it. */
  origin: string;
  onIssue: (stationId: string, mac: boolean) => Promise<IssuedStationLink>;
}

/** ADMIN hands over one link and the device works: no key to type, no activation code. */
export function StationLinkActions({ stationId, stationName, origin, onIssue }: StationLinkActionsProps) {
  const [busy, setBusy] = useState<'mac' | 'phone' | 'panel' | null>(null);
  const [issued, setIssued] = useState<{ url: string; minutes: number; mac: boolean; target: StationLinkTarget } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function issue(mac: boolean, target: StationLinkTarget = 'operator') {
    if (busy) return;
    setBusy(target === 'panel' ? 'panel' : mac ? 'mac' : 'phone');
    setError(null);
    setNotice(null);
    try {
      const link = await onIssue(stationId, mac);
      setIssued({ url: stationLinkUrl(origin, link.code, target), minutes: Math.round(link.expiresInSeconds / 60), mac, target });
    } catch (cause) {
      setIssued(null);
      setError(cause instanceof Error ? cause.message : 'No se pudo generar el enlace.');
    } finally {
      setBusy(null);
    }
  }

  async function copy() {
    if (!issued) return;
    try { await navigator.clipboard.writeText(issued.url); setNotice('Enlace copiado.'); }
    catch { setError('No se pudo copiar automáticamente. Selecciónalo y cópialo a mano.'); }
  }

  return (
    <div className="station-link-actions">
      <div className="station-link-buttons">
        <button className="button-primary" type="button" disabled={busy !== null} onClick={() => void issue(false, 'panel')}>
          {busy === 'panel' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
          Enlace para el profesor
        </button>
        <button className="button-quiet" type="button" disabled={busy !== null} onClick={() => void issue(true)}>
          {busy === 'mac' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
          Enlace para el Mac del puesto
        </button>
        <button className="button-quiet" type="button" disabled={busy !== null} onClick={() => void issue(false)}>
          {busy === 'phone' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
          Enlace para un celular
        </button>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {issued && <div className="station-link-result" role="status" aria-live="polite">
        <label htmlFor={`station-link-${stationId}`}>
          {issued.target === 'panel' ? `Panel en vivo de “${stationName}”` : issued.mac ? `Pantalla de “${stationName}”` : `Consola de “${stationName}” en un celular`}
        </label>
        <div className="station-link-row">
          <input id={`station-link-${stationId}`} readOnly value={issued.url} onFocus={(event) => event.currentTarget.select()} />
          <button className="button-quiet" type="button" onClick={() => void copy()}><Clipboard className="h-4 w-4" />Copiar enlace</button>
        </div>
        <p className="admin-data-footnote">Se abre una sola vez y vence en {issued.minutes} min. Ábrelo en el dispositivo y ya queda listo.</p>
        {notice && <p className="station-admin-notice">{notice}</p>}
        <QrImage value={issued.url} label={`QR del enlace de ${stationName}`} size={160} />
      </div>}
    </div>
  );
}
