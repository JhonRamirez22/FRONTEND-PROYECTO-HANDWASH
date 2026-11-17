import type { RefObject } from 'react';
import { Camera, Check, Smartphone, VideoOff } from 'lucide-react';
import type { AgentDescription } from '@/lib/CameraAgent';
import { QrImage } from './QrImage';

export interface CameraOption { deviceId: string; label: string; likelyIphone: boolean }

interface CameraLinkPanelProps {
  linked: boolean;
  busy: boolean;
  error: string | null;
  choices: CameraOption[];
  chosen: string;
  onChoose: (deviceId: string) => void;
  /** Use exactly this camera of this device. */
  onLink: (deviceId?: string) => void;
  /** Look for the iPhone through Continuity (asks the browser for camera permission first). */
  onLinkIphone: () => void;
  /** On a phone: use its own camera. On a computer: show a QR that opens this console on the phone. */
  onLinkPhone: () => void;
  isPhone: boolean;
  phoneLink: { url: string; secondsLeft: number } | null;
  videoRef: RefObject<HTMLVideoElement>;
  /** Where the iPhone helper stands, when it was requested. */
  agentNote?: AgentDescription | null;
  /** Give up on the helper and try the browser camera instead. */
  onUseBrowser?: () => void;
}

/** Links the iPhone (Continuity) or an Android phone; the video then goes straight to the YOLO PC. */
export function CameraLinkPanel({
  linked, busy, error, choices, chosen, onChoose, onLink, onLinkIphone, onLinkPhone, isPhone, phoneLink, videoRef, agentNote = null, onUseBrowser,
}: CameraLinkPanelProps) {
  return (
    <div className="operator-panel operator-camera-panel">
      <div className="operator-panel-heading">
        <h2>Vincular cámara</h2>
        {linked ? <Check className="operator-ok" /> : <VideoOff className="operator-muted" />}
      </div>
      <p>Elige cómo conectar la cámara. Al iniciar el turno, el video va directo al PC con YOLO.</p>
      {linked
        ? <video ref={videoRef} className="operator-camera-preview" autoPlay muted playsInline aria-label="Vista previa local de la cámara vinculada" />
        : <div className="operator-camera-empty"><Camera size={25} /><span>Aún no hay cámara vinculada</span></div>}
      {error && <p className="operator-error" role="alert">{error}</p>}

      <div className="operator-camera-actions">
        <button className="operator-button operator-button--primary" type="button" disabled={busy} onClick={onLinkIphone}>
          <Camera size={16} /> {busy ? 'Buscando el iPhone…' : 'Conectar iPhone (Cámara de Continuidad)'}
        </button>
        <button className="operator-button operator-button--primary" type="button" disabled={busy} onClick={onLinkPhone}>
          <Smartphone size={16} /> {isPhone ? 'Usar la cámara de este celular' : 'Conectar un celular Android'}
        </button>
      </div>
      {agentNote && <p className={`operator-agent-note is-${agentNote.tone}`} role="status">{agentNote.text}</p>}
      {agentNote?.browserFallback && onUseBrowser && (
        <button className="operator-button operator-button--secondary" type="button" disabled={busy} onClick={onUseBrowser}>
          <Camera size={16} /> Probar con el navegador
        </button>
      )}
      <p className="operator-footnote">
        iPhone: se usa el ayudante de este Mac (INICIAR-CAMARA-IPHONE), que lee la cámara de Continuidad directo de macOS, sin navegador. Mantén el iPhone cerca, desbloqueado y con Wi-Fi y Bluetooth.
        {isPhone ? '' : ' Celular Android u otro: se muestra un código QR; ábrelo con la cámara del celular.'}
      </p>

      {isPhone && linked && <p className="operator-footnote">Deja esta pantalla abierta y el celular cargando: si se bloquea, el video se corta.</p>}

      {phoneLink && <div className="operator-phone-link" role="status">
        <QrImage value={phoneLink.url} label="QR para abrir la consola en el celular" size={176} />
        <p>Escanea con el celular, abre el enlace y pulsa “Usar la cámara de este celular”. El código vence en {phoneLink.secondsLeft} s.</p>
      </div>}

      {choices.length > 0 && <>
        <label className="operator-field-label" htmlFor="camera-choice">Cámaras disponibles en este equipo</label>
        <select id="camera-choice" className="operator-select" value={chosen} onChange={(event) => onChoose(event.target.value)}>
          {choices.map((choice) => (
            <option key={choice.deviceId} value={choice.deviceId}>{choice.label}{choice.likelyIphone ? ' (iPhone)' : ''}</option>
          ))}
        </select>
        <button className="operator-button operator-button--secondary" type="button" disabled={busy || !chosen} onClick={() => onLink(chosen)}>
          <Camera size={16} /> Usar esta cámara
        </button>
      </>}
    </div>
  );
}
