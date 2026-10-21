import { useEffect, useRef } from 'react';
import { Check, X } from 'lucide-react';
import { KioskChime } from '@/lib/KioskChime';
import { formatSeconds, kioskGuideText, showsStepProgress } from '@/lib/KioskGuideCatalog';
import type { FrictionEvaluation } from '@/types';

const RADIUS = 46;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const chime = new KioskChime();

/** One instruction chosen by Java, plus the credited time of the movement it refers to. */
export function KioskGuidance({ evaluation }: { evaluation: FrictionEvaluation }) {
  const guide = evaluation.guia;
  const text = kioskGuideText(guide);
  const step = guide.paso ? evaluation.pasos.find((item) => item.paso === guide.paso) : undefined;
  const progress = showsStepProgress(guide.codigo) && step
    ? Math.min(1, step.tiempoAcreditadoMs / step.minimoRequeridoMs) : null;
  const announced = useRef(`${evaluation.numeroIntento}:${guide.codigo}:${guide.paso}`);

  useEffect(() => {
    const key = `${evaluation.numeroIntento}:${guide.codigo}:${guide.paso}`;
    if (key === announced.current) return;
    announced.current = key;
    if (!KioskChime.enabled()) return;
    if (guide.codigo === 'CAMBIA_A_PASO') chime.play(880);
    else if (guide.codigo === 'LAVADO_COMPLETO') chime.play(1175);
  }, [evaluation.numeroIntento, guide.codigo, guide.paso]);

  return (
    <div className={`kiosk-guidance kiosk-guidance--${guide.tono.toLowerCase()}`} role="status" aria-live="polite">
      {progress !== null && step ? (
        <svg className="kiosk-ring" viewBox="0 0 112 112" role="img"
          aria-label={`${formatSeconds(step.tiempoAcreditadoMs)} de ${step.minimoRequeridoMs / 1000} segundos observados`}>
          <circle className="kiosk-ring-track" cx="56" cy="56" r={RADIUS} />
          <circle className="kiosk-ring-value" cx="56" cy="56" r={RADIUS}
            strokeDasharray={CIRCUMFERENCE} strokeDashoffset={CIRCUMFERENCE * (1 - progress)} />
          <text x="56" y="58" className="kiosk-ring-number">{Math.max(0, Math.ceil((guide.faltanteMs ?? 0) / 1000))}</text>
          <text x="56" y="80" className="kiosk-ring-unit">seg</text>
        </svg>
      ) : guide.codigo === 'CAMBIA_A_PASO' || guide.codigo === 'LAVADO_COMPLETO' ? (
        <span className="kiosk-guidance-badge" aria-hidden="true"><Check size={34} strokeWidth={2.5} /></span>
      ) : guide.codigo === 'LAVADO_INCOMPLETO' ? (
        <span className="kiosk-guidance-badge is-alert" aria-hidden="true"><X size={34} strokeWidth={2.5} /></span>
      ) : null}
      <div className="kiosk-guidance-copy">
        <strong>{text.title}</strong>
        <span>{text.detail}</span>
      </div>
    </div>
  );
}
