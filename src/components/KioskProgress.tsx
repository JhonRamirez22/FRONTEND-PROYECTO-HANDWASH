import { Check } from 'lucide-react';
import { useSessionStore } from '@/stores/sessionStore';
import { FRICTION_STEPS, STEP_LABELS, WHO_STEPS } from '@/types';

export function KioskProgress() {
  const active = useSessionStore((state) => state.isActive);
  const current = useSessionStore((state) => state.currentStep);
  const mode = useSessionStore((state) => state.modoEvaluacion);
  const summary = useSessionStore((state) => state.summary);
  const steps = mode === 'PROTOCOLO_OMS' ? WHO_STEPS : FRICTION_STEPS;
  const currentIndex = steps.indexOf(current as typeof steps[number]);

  return (
    <section className="kiosk-progress" aria-label="Progreso confirmado por Java" aria-live="polite">
      <div className="kiosk-progress-heading">
        <div className="kiosk-progress-title">
          <h2>Progreso</h2>
          <p>{active && currentIndex >= 0 ? `Paso ${currentIndex + 1} de ${steps.length}` : 'Secuencia del lavado'}</p>
        </div>
        <span className={`kiosk-progress-state ${active ? 'is-active' : summary ? 'is-finished' : 'is-waiting'}`}>
          {active ? 'Estado recibido de Java' : summary ? 'Sesión finalizada' : 'Esperando sesión'}
        </span>
      </div>
      <ol>
        {steps.map((step, index) => {
          const observed = active && currentIndex >= 0 && index < currentIndex;
          const currentStep = active && step === current;
          return (
            <li key={step} className={currentStep ? 'is-current' : observed ? 'is-observed' : ''}
              aria-current={currentStep ? 'step' : undefined}>
              <span className="kiosk-step-marker" aria-hidden="true">
                {observed ? <Check size={14} strokeWidth={2.5} /> : index + 1}
              </span>
              <span className="kiosk-step-copy">
                <span className="kiosk-step-label">{STEP_LABELS[step] ?? step}</span>
                {currentStep && <small>En curso · Java</small>}
                {observed && <small>Observado · Java</small>}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="kiosk-scope-note">Progreso informativo; este piloto no certifica cumplimiento clínico.</p>
    </section>
  );
}
