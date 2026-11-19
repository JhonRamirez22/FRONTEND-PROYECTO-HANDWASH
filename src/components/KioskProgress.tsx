import { Check } from 'lucide-react';
import { useSessionStore } from '@/stores/sessionStore';
import { FRICTION_STEPS, STEP_LABELS, WHO_STEPS } from '@/types';
import { formatSeconds } from '@/lib/KioskGuideCatalog';
import { RuntimeEndpointConfig } from '@/lib/RuntimeEndpointConfig';
import { STEP_NAMES, stepNumber, wrongStepMessage } from '@/lib/CameraFrames';
import type { DetectedSummary } from '@/hooks/usePreviewCanvas';
import { KioskGuidance } from './KioskGuidance';
import { KioskWashSummary } from './KioskWashSummary';

/**
 * @param evaluating false while the link to Java, the PC or the camera is down: the last guidance is
 *   then stale, so it is hidden and the panel says the wash is not being evaluated (R-01).
 */
export function KioskProgress({ evaluating = true, detected = null }: { evaluating?: boolean; detected?: DetectedSummary | null }) {
  const active = useSessionStore((state) => state.isActive);
  const current = useSessionStore((state) => state.currentStep);
  const mode = useSessionStore((state) => state.modoEvaluacion);
  const summary = useSessionStore((state) => state.summary);
  const evaluation = useSessionStore((state) => state.frictionEvaluation);
  const steps = mode === 'PROTOCOLO_OMS' ? WHO_STEPS : FRICTION_STEPS;
  const currentIndex = steps.indexOf(current as typeof steps[number]);
  const inEvaluation = mode === 'PROTOCOLO_OMS' ? [] : RuntimeEndpointConfig.stepsInEvaluation();

  return (
    <section className="kiosk-progress" aria-label="Progreso confirmado por Java">
      <div className="kiosk-progress-heading">
        <div className="kiosk-progress-title">
          <h2>Progreso</h2>
          <p>{active && currentIndex >= 0 ? `Paso ${currentIndex + 1} de ${steps.length}` : 'Secuencia del lavado'}</p>
        </div>
        <span role="status" className={`kiosk-progress-state ${active ? 'is-active' : summary ? 'is-finished' : 'is-waiting'}`}>
          {!evaluating && !evaluation?.secuenciaValidada ? 'Sin evaluación'
            : evaluation?.estadoIntento === 'PENDIENTE_PERSISTENCIA' ? 'Guardado pendiente'
            : evaluation?.secuenciaValidada ? 'Seis movimientos validados'
            : evaluation?.estadoIntento === 'PAUSADO' ? 'En pausa'
            : evaluation?.estadoIntento === 'INTERRUMPIDO' ? 'Intento interrumpido'
            : active ? 'Estado recibido de Java' : summary ? 'Sesión finalizada' : 'Esperando sesión'}
        </span>
      </div>
      {active && evaluation && typeof evaluation.puntajePct === 'number' && !(evaluation.estadoIntento === 'COMPLETO_PARCIAL' || evaluation.estadoIntento === 'INTERRUMPIDO')
        && <p className="kiosk-running-score">Calidad promedio hasta ahora: <strong>{evaluation.puntajePct} %</strong> <small>(correcto desde 80 %)</small></p>}
      {evaluating && detected && <LiveStepLine detected={detected} credit={creditOf(evaluation?.pasos.find((item) => item.estado === 'EN_CURSO' || item.estado === 'REQUIERE_REPETICION'))} />}
      {active && evaluating && evaluation && <KioskGuidance evaluation={evaluation} />}
      {evaluation && <KioskWashSummary evaluation={evaluation} />}
      {!(evaluation && (evaluation.estadoIntento === 'COMPLETO_PARCIAL' || evaluation.estadoIntento === 'INTERRUMPIDO')) && <ol>
        {steps.map((step, index) => {
          const assessment = evaluation?.pasos.find((item) => item.paso === step);
          const observed = assessment ? assessment.estado === 'VALIDADO' : active && currentIndex >= 0 && index < currentIndex;
          const currentStep = active && !observed && (assessment
            ? assessment.estado === 'EN_CURSO' || assessment.estado === 'REQUIERE_REPETICION' : step === current);
          return (
            <li key={step} className={currentStep ? 'is-current' : observed ? 'is-observed' : ''}
              aria-current={currentStep ? 'step' : undefined}>
              <span className="kiosk-step-marker" aria-hidden="true">
                {observed ? <Check size={14} strokeWidth={2.5} /> : index + 1}
              </span>
              <span className="kiosk-step-copy">
                <span className="kiosk-step-label">{STEP_LABELS[step] ?? step}</span>
                {inEvaluation.includes(index + 1) && <small className="kiosk-step-evaluation">En evaluación</small>}
                {currentStep && <small>{assessment?.estado === 'REQUIERE_REPETICION' ? 'Corrección pendiente' : 'En curso'} · Java</small>}
                {observed && <small>{assessment ? 'Validado' : 'Observado'}{typeof assessment?.calidadPct === 'number' ? ` · calidad ${assessment.calidadPct} %` : ''} · Java</small>}
                {assessment && assessment.estado !== 'PENDIENTE' && <>
                  <small>{formatSeconds(assessment.tiempoAcreditadoMs)} / {assessment.minimoRequeridoMs / 1000} s observados</small>
                  <span className="kiosk-step-meter" aria-hidden="true">
                    <span style={{ width: `${Math.min(100, Math.round(100 * assessment.tiempoAcreditadoMs / Math.max(1, assessment.minimoRequeridoMs)))}%` }} />
                  </span>
                </>}
              </span>
            </li>
          );
        })}
      </ol>}
      <p className="kiosk-scope-note">Progreso informativo; este piloto no certifica cumplimiento clínico.</p>
    </section>
  );
}

/** What the PC sees right now and what comes next, from the same frames the boxes are drawn on. */
export interface Credit { step: number; percent: number; seconds: number; required: number }

export function creditOf(assessment: { paso: string; tiempoAcreditadoMs: number; minimoRequeridoMs: number } | undefined): Credit | null {
  if (!assessment || assessment.minimoRequeridoMs <= 0) return null;
  const step = Number(/PASO_(\d)/.exec(assessment.paso)?.[1] ?? 0);
  if (step < 1 || step > 6) return null;
  return {
    step, seconds: assessment.tiempoAcreditadoMs / 1000, required: assessment.minimoRequeridoMs / 1000,
    percent: Math.max(0, Math.min(100, Math.round(100 * assessment.tiempoAcreditadoMs / assessment.minimoRequeridoMs))),
  };
}

export function LiveStepLine({ detected, credit }: { detected: DetectedSummary; credit: Credit | null }) {
  const seen = stepNumber(detected.step);
  const next = detected.expected > 0 ? `Paso ${detected.expected} · ${STEP_NAMES[detected.expected - 1]}` : 'Lavado completo';
  return (
    <div className={`kiosk-live-step${detected.error ? ' is-error' : seen ? ' is-seen' : ''}`} role="status">
      <span className="kiosk-live-step-now">
        {detected.error ? wrongStepMessage(seen, detected.expected)
          : seen ? `Detectando: Paso ${seen} · ${STEP_NAMES[seen - 1]}${detected.confidence !== null ? ` (${Math.round(detected.confidence * 100)} %)` : ''}`
            : detected.hands > 0 ? 'Manos detectadas; esperando un paso' : 'Sin manos a la vista'}
      </span>
      {credit && !detected.error && <span className="kiosk-live-step-credit">
        <strong>{credit.percent} %</strong> del Paso {credit.step} · {STEP_NAMES[credit.step - 1]} ({credit.seconds.toFixed(1)} / {credit.required.toFixed(0)} s)
        <span className="kiosk-step-meter big" aria-hidden="true"><span style={{ width: `${credit.percent}%` }} /></span>
      </span>}
      {credit && credit.percent >= 100 && detected.expected > 0 && !detected.error && (
        <span className="kiosk-live-step-done">✓ Paso {credit.step} listo: ya puedes pasar al Paso {Math.min(6, credit.step + 1)} · {STEP_NAMES[Math.min(5, credit.step)]}</span>
      )}
      <span className="kiosk-live-step-next">Sigue: {next}</span>
      <span className="kiosk-live-step-bar" aria-hidden="true"><span style={{ width: `${Math.round(100 * detected.current / 6)}%` }} /></span>
    </div>
  );
}
