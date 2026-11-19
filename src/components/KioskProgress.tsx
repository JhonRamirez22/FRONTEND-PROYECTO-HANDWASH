import { Check } from 'lucide-react';
import { useSessionStore } from '@/stores/sessionStore';
import { FRICTION_STEPS, STEP_LABELS, WHO_STEPS } from '@/types';
import { formatSeconds } from '@/lib/KioskGuideCatalog';
import { RuntimeEndpointConfig } from '@/lib/RuntimeEndpointConfig';
import { STEP_NAMES, stepNumber } from '@/lib/CameraFrames';
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
      {evaluating && detected && <LiveStepLine detected={detected} />}
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
                {observed && <small>{assessment ? 'Validado' : 'Observado'} · Java</small>}
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
function LiveStepLine({ detected }: { detected: DetectedSummary }) {
  const seen = stepNumber(detected.step);
  const next = detected.expected > 0 ? `Paso ${detected.expected} · ${STEP_NAMES[detected.expected - 1]}` : 'Lavado completo';
  return (
    <div className={`kiosk-live-step${detected.error ? ' is-error' : seen ? ' is-seen' : ''}`} role="status">
      <span className="kiosk-live-step-now">
        {detected.error ? 'Paso fuera de orden: se reinicia desde Palmas'
          : seen ? `Detectando: Paso ${seen} · ${STEP_NAMES[seen - 1]}${detected.confidence !== null ? ` (${Math.round(detected.confidence * 100)} %)` : ''}`
            : detected.hands > 0 ? 'Manos detectadas; esperando un paso' : 'Sin manos a la vista'}
      </span>
      <span className="kiosk-live-step-next">Sigue: {next}</span>
      <span className="kiosk-live-step-bar" aria-hidden="true"><span style={{ width: `${Math.round(100 * detected.current / 6)}%` }} /></span>
    </div>
  );
}
