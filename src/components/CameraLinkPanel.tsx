import type { RefObject } from 'react';
import { Camera, Check, VideoOff } from 'lucide-react';

export interface CameraOption { deviceId: string; label: string; likelyIphone: boolean }

interface CameraLinkPanelProps {
  linked: boolean;
  busy: boolean;
  error: string | null;
  choices: CameraOption[];
  chosen: string;
  onChoose: (deviceId: string) => void;
  /** No id: look for the iPhone automatically; an id: use exactly that camera. */
  onLink: (deviceId?: string) => void;
  videoRef: RefObject<HTMLVideoElement>;
}

/** Links the iPhone (Continuity) or any camera of this device; the video then goes straight to the YOLO PC. */
export function CameraLinkPanel({ linked, busy, error, choices, chosen, onChoose, onLink, videoRef }: CameraLinkPanelProps) {
  return (
    <div className="operator-panel operator-camera-panel">
      <div className="operator-panel-heading">
        <h2>Vincular cámara</h2>
        {linked ? <Check className="operator-ok" /> : <VideoOff className="operator-muted" />}
      </div>
      <p>Conecta el iPhone (cámara Continuity) o cualquier cámara de este equipo. Al iniciar el turno, el video va directo al PC con YOLO.</p>
      {linked
        ? <video ref={videoRef} className="operator-camera-preview" autoPlay muted playsInline aria-label="Vista previa local de la cámara vinculada" />
        : <div className="operator-camera-empty"><Camera size={25} /><span>Aún no hay cámara vinculada</span></div>}
      {error && <p className="operator-error" role="alert">{error}</p>}
      <button className="operator-button operator-button--primary" type="button" disabled={busy} onClick={() => onLink(undefined)}>
        <Camera size={16} /> {busy ? 'Buscando cámaras…' : linked ? 'Cambiar cámara' : 'Vincular cámara'}
      </button>
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
