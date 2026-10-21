import { useState } from 'react';
import { CalendarClock, LoaderCircle, Play, Square } from 'lucide-react';
import type { ShiftView } from '@/lib/OperatorApi';
import { formatRemaining, SHIFT_HOURS } from '@/lib/shiftFormat';

interface OperatorShiftPanelProps {
  shift: ShiftView | null;
  busy: boolean;
  onStart: (hours: number) => void;
  onStop: () => void;
  now?: () => number;
}

/** Opens or closes the unattended window; Java starts and restarts the session by itself. */
export function OperatorShiftPanel({ shift, busy, onStart, onStop, now = Date.now }: OperatorShiftPanelProps) {
  const [hours, setHours] = useState<number>(8);
  const active = shift?.active === true && shift.endsAtEpochMs !== null;
  return (
    <section className="operator-shift" aria-labelledby="operator-shift-title">
      <div className="operator-panel-heading">
        <div><p className="operator-eyebrow">Operación sin supervisión</p><h2 id="operator-shift-title">Turno</h2></div>
        <CalendarClock />
      </div>
      {active && shift?.endsAtEpochMs != null ? <>
        <p className="operator-shift-status" role="status">
          Turno activo hasta {new Date(shift.endsAtEpochMs).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
          {' '}· quedan {formatRemaining(shift.endsAtEpochMs - now())}
        </p>
        <p className="operator-footnote">El puesto evalúa sin operador y abre sola una sesión nueva si la anterior termina.
          Finalizar el turno cierra la sesión.</p>
        <button className="operator-button operator-button--danger" type="button" disabled={busy}
          onClick={() => { if (window.confirm('¿Finalizar el turno? El puesto dejará de evaluar.')) onStop(); }}>
          {busy ? <LoaderCircle className="animate-spin" size={16} /> : <Square size={15} />} Finalizar turno
        </button>
      </> : <>
        <label className="operator-field-label" htmlFor="operator-shift-hours">Duración del turno</label>
        <select id="operator-shift-hours" value={hours} onChange={(event) => setHours(Number(event.target.value))}>
          {SHIFT_HOURS.map((option) => <option key={option} value={option}>{option} horas</option>)}
        </select>
        <p className="operator-footnote">Con el turno abierto el puesto queda evaluando persona tras persona. Mantén esta
          pestaña del Mac abierta con la cámara autorizada.</p>
        <button className="operator-button operator-button--primary" type="button" disabled={busy} onClick={() => onStart(hours)}>
          {busy ? <LoaderCircle className="animate-spin" size={16} /> : <Play size={16} />} Iniciar turno
        </button>
      </>}
    </section>
  );
}
