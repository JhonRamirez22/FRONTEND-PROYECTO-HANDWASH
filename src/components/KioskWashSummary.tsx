import { Check, X } from 'lucide-react';
import { stepOutcome } from '@/lib/KioskGuideCatalog';
import { STEP_LABELS, type FrictionEvaluation } from '@/types';

/** Final ✓/✗ per movement for a finished attempt, exactly as Java stored it. */
export function KioskWashSummary({ evaluation }: { evaluation: FrictionEvaluation }) {
  if (evaluation.estadoIntento !== 'COMPLETO_PARCIAL' && evaluation.estadoIntento !== 'INTERRUMPIDO') return null;
  return (
    <section className="kiosk-summary" aria-label={`Resumen del intento ${evaluation.numeroIntento}`}>
      <h3>Resumen del intento {evaluation.numeroIntento}</h3>
      <ul>
        {evaluation.pasos.map((step) => {
          const outcome = stepOutcome(step);
          return (
            <li key={step.paso} className={outcome.ok ? 'is-ok' : 'is-missing'}>
              <span className="kiosk-summary-mark" aria-hidden="true">
                {outcome.ok ? <Check size={14} strokeWidth={2.5} /> : <X size={14} strokeWidth={2.5} />}
              </span>
              <span>{STEP_LABELS[step.paso] ?? step.paso}</span>
              <small>{outcome.text}</small>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
