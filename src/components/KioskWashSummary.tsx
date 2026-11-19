import { Check, X } from 'lucide-react';
import { stepOutcome } from '@/lib/KioskGuideCatalog';
import { PASS_MARK_PCT, STEP_LABELS, type FrictionEvaluation } from '@/types';

/** Final ✓/✗ per movement for a finished attempt, exactly as Java stored it. */
export function KioskWashSummary({ evaluation }: { evaluation: FrictionEvaluation }) {
  if (evaluation.estadoIntento !== 'COMPLETO_PARCIAL' && evaluation.estadoIntento !== 'INTERRUMPIDO') return null;
  const verdict = evaluation.veredicto ?? evaluation.ultimoResultado?.veredicto ?? null;
  const score = evaluation.ultimoResultado?.puntajePct ?? evaluation.puntajePct ?? 0;
  return (
    <section className="kiosk-summary" aria-label={`Resumen del intento ${evaluation.numeroIntento}`}>
      <h3>Resumen del intento {evaluation.numeroIntento}</h3>
      {verdict && (
        <p className={`kiosk-verdict is-${verdict === 'CORRECTO' ? 'ok' : 'bad'}`} role="status">
          <strong>{verdict === 'CORRECTO' ? 'Lavado correcto' : 'Lavado rechazado'}</strong>
          <span>{score} % de calidad promedio · mínimo {PASS_MARK_PCT} %</span>
        </p>
      )}
      <ul>
        {evaluation.pasos.map((step) => {
          const outcome = stepOutcome(step);
          return (
            <li key={step.paso} className={outcome.ok ? 'is-ok' : 'is-missing'}>
              <span className="kiosk-summary-mark" aria-hidden="true">
                {outcome.ok ? <Check size={14} strokeWidth={2.5} /> : <X size={14} strokeWidth={2.5} />}
              </span>
              <span>{STEP_LABELS[step.paso] ?? step.paso}</span>
              <small>{typeof step.calidadPct === 'number' ? `${step.calidadPct} % · ` : ''}{outcome.text}</small>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
