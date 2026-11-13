import { useState } from 'react';
import { CircleAlert, ClipboardCheck } from 'lucide-react';
import { stepNumber } from '@/lib/stepNumber';

const STEP_NAMES = ['Palmas', 'Dorsos', 'Interdigitales', 'Nudillos', 'Pulgar', 'Punta de dedos'] as const;

interface RehearsalPanelProps {
  detectedStep: string;
  /** Confirms the step, or corrects it when `correctedTo` is given. Counts only; nothing visual is sent. */
  onFeedback: (step: number, correctedTo?: number) => Promise<void>;
}

/** Rehearsal mode: the operator confirms or corrects what the system detected so its accuracy can be measured. */
export function RehearsalPanel({ detectedStep, onFeedback }: RehearsalPanelProps) {
  const [enabled, setEnabled] = useState(false);
  const [confirmed, setConfirmed] = useState(0);
  const [corrected, setCorrected] = useState(0);
  const [actual, setActual] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const detected = stepNumber(detectedStep);

  async function send(correctedTo?: number) {
    if (detected === null || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onFeedback(detected, correctedTo);
      if (correctedTo === undefined) setConfirmed((count) => count + 1);
      else setCorrected((count) => count + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo registrar la respuesta.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="operator-rehearsal">
      <label className="operator-footnote">
        <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />{' '}
        Modo ensayo
      </label>
      {enabled && <>
        <p className="operator-footnote"><ClipboardCheck size={15} /> Solo se guardan conteos por paso; no se guarda video ni imágenes.</p>
        {detected === null
          ? <p className="operator-footnote" role="status">Esperando un paso detectado…</p>
          : <div role="group" aria-label="Respuesta del operador">
            <strong>Detectado: paso {detected} · {STEP_NAMES[detected - 1]}</strong>
            <button className="operator-button operator-button--primary" type="button" disabled={busy}
              onClick={() => void send()}>Es correcto</button>
            <label className="operator-field-label" htmlFor="rehearsal-actual">Paso realmente realizado</label>
            <select id="rehearsal-actual" value={actual} onChange={(event) => setActual(Number(event.target.value))}>
              {STEP_NAMES.map((name, index) => <option key={name} value={index + 1}>{index + 1} · {name}</option>)}
            </select>
            <button className="operator-button operator-button--secondary" type="button"
              disabled={busy || actual === detected} onClick={() => void send(actual)}>Corregir</button>
          </div>}
        <p className="operator-footnote">{confirmed} confirmados · {corrected} corregidos</p>
        {error && <p className="operator-error" role="alert"><CircleAlert size={15} /> {error}</p>}
      </>}
    </div>
  );
}
