import { Check, Clock, AlertTriangle } from 'lucide-react';
import { useSessionStore } from '@/stores/sessionStore';
import { FRICTION_STEPS, SOAP_REGION_LABELS, STEP_LABELS, WHO_STEPS } from '@/types';
import type { HandWashStep, SoapEvidence } from '@/types';
import type { DeploymentStatus } from '@/lib/DeploymentStatusService';
import { cn } from '@/lib/utils';

interface StepStepperProps {
  deploymentStatus: DeploymentStatus;
}

export function StepStepper({ deploymentStatus }: StepStepperProps) {
  const currentStep = useSessionStore((s) => s.currentStep);
  const infractions = useSessionStore((s) => s.infractions);
  const isActive = useSessionStore((s) => s.isActive);
  const summary = useSessionStore((s) => s.summary);
  const elapsedSeconds = useSessionStore((s) => s.elapsedSeconds);
  const retries = useSessionStore((s) => s.intentosReiniciados);
  const lastRetryError = useSessionStore((s) => s.ultimoErrorReinicio);
  const mode = useSessionStore((s) => s.modoEvaluacion);
  const soapCoverage = useSessionStore((s) => s.coberturaJabon);
  const soapCoverageComplete = useSessionStore((s) => s.coberturaJabonCompleta);
  const intentionState = useSessionStore((s) => s.estadoIntencion);
  const intentionReason = useSessionStore((s) => s.motivoIntencion);
  const cameraHandsVisible = useSessionStore((s) => s.cameraHandsVisible);
  const visibleIntentionHands = useSessionStore((s) => s.manosVisiblesIntencion);
  const intentionElapsedMs = useSessionStore((s) => s.tiempoConfirmacionIntencionMs);
  const intentionThresholdMs = useSessionStore((s) => s.umbralConfirmacionIntencionMs);
  const candidateClass = useSessionStore((s) => s.claseCandidata);
  const candidateConfidence = useSessionStore((s) => s.confianzaCandidata);
  const frictionSequenceObservedComplete = useSessionStore(
    (s) => s.secuenciaFriccionObservadaCompleta,
  );
  const steps = mode === 'PROTOCOLO_OMS' ? WHO_STEPS : FRICTION_STEPS;

  const infractionSteps = new Set(infractions.map((i) => i.step));
  const finalAttemptInfractionSteps = new Set(
    (summary?.infraccionesIntentoFinal ?? []).map((infraction) => infraction.step),
  );
  const backendApproval = summary?.aprobado === true
    && summary.procedimientoCompletoValidado === true;
  const approved = deploymentStatus.clinicalDecisionAllowed && backendApproval;
  const summarySequenceObserved = summary?.aprobado === true
    || summary?.resultado?.startsWith('SECUENCIA_COMPLETADA')
    || summary?.resultado?.startsWith('SECUENCIA_OMS_COMPLETADA');

  const getStepStatus = (step: HandWashStep) => {
    if (summary) {
      if (finalAttemptInfractionSteps.has(step)) return 'infraction';
      if (approved) return 'completed';
      return summarySequenceObserved ? 'informational' : 'pending';
    }
    if (!isActive) return 'pending';
    if (infractionSteps.has(step)) return 'infraction';
    if (mode === 'FRICCION_PARCIAL' && frictionSequenceObservedComplete) return 'informational';
    if (step === currentStep) return 'active';
    const currentIndex = steps.indexOf(currentStep as HandWashStep);
    const stepIndex = steps.indexOf(step);
    if (currentIndex >= 0 && stepIndex >= 0 && stepIndex < currentIndex) {
      return deploymentStatus.clinicalDecisionAllowed ? 'completed' : 'informational';
    }
    return 'pending';
  };

  const formatElapsed = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const intentionMessages: Record<string, string> = {
    SIN_EVIDENCIA: 'Esperando evidencia reciente de las manos.',
    MANOS_PRESENTES: 'Manos visibles; confirma la fricción inicial de palmas.',
    INTENCION_CANDIDATA: 'Confirmando la detección sostenida de palmas.',
    LAVADO_PROBABLE: 'La clase visual sugiere fricción; el movimiento real no está verificado.',
    PAUSA: 'La evaluación está en pausa; espera una observación válida.',
    NO_EVALUADA: 'La intención no se evalúa en este modo.',
    SIN_EVIDENCIA_RECIENTE: 'La evidencia de las manos falta o caducó; espera una observación nueva.',
    ENCUADRE_INCOMPLETO: 'Se necesita evidencia reciente de ambas manos en el encuadre.',
    EVIDENCIA_ESPACIAL_NO_VERIFICABLE: 'No se pudo verificar la posición relativa de ambas manos; mantenlas visibles y espera otra observación.',
    MOVIMIENTO_INICIAL_NO_DETECTADO: 'Las manos están visibles, pero no se detecta fricción inicial; frota palma con palma frente a la cámara.',
    MOVIMIENTO_ACTIVO_NO_DETECTADO: 'No se detectó movimiento en este paso; vuelve a frotar las manos y mantén ambas dentro del encuadre.',
    EVIDENCIA_INVALIDA: 'La evidencia recibida no pasó la validación; espera una observación nueva.',
    SIN_GESTO_DE_LAVADO: 'No se reconoció una clase de fricción válida; frota las manos frente a la cámara.',
    INICIE_CON_PALMAS: 'Empieza por el movimiento de palmas.',
    GESTO_INCIERTO: 'La confianza en el movimiento de palmas no alcanza el umbral de inicio.',
    SIN_RELOJ_SERVIDOR: 'No se pudo validar el tiempo de la observación.',
    'Palmas reconocidas de forma sostenida; inicia la evaluación': 'La detección sostenida de palmas inicia la evaluación; no verifica la fricción real.',
    'Confirmando reconocimiento sostenido de palmas': 'Confirma el inicio frotando las palmas frente a la cámara.',
    'Paso YOLO confiable con ambas manos visibles': 'El modelo propuso una clase de paso con ambas manos visibles; Java valida el orden.',
    'Esperando evidencia de movimiento': 'Esperando evidencia reciente para evaluar el lavado.',
    'Debe volver a confirmar fricción de palmas': 'Confirma nuevamente el inicio frotando las palmas.',
  };
  const intentionStatus = intentionMessages[intentionState] ?? intentionState.replace(/_/g, ' ').toLowerCase();
  const intentionDetail = intentionMessages[intentionReason] ?? intentionReason;

  return (
    <div className="neumorphic rounded-2xl p-5">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="font-heading text-lg font-semibold text-card-foreground">
          {mode === 'PROTOCOLO_OMS' ? 'Lavado OMS: agua y jabón' : 'Movimientos de fricción'}
        </h2>
        {isActive && (
          <div className="flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
            <Clock className="h-3 w-3" />
            {formatElapsed(elapsedSeconds)}
          </div>
        )}
      </div>

      {isActive && mode !== 'PROTOCOLO_OMS' && (
        <div className="mb-4 rounded-xl border border-border/60 bg-muted/30 px-3 py-2.5 text-xs" role="status" aria-live="polite">
          <p className="font-semibold text-card-foreground">Intención: {intentionStatus}</p>
          {intentionDetail && intentionDetail !== intentionStatus && (
            <p className="mt-1 text-muted-foreground">Motivo: {intentionDetail}</p>
          )}
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground">
            <span>YOLO local (último sondeo): {cameraHandsVisible === null ? 'sin dato' : `${cameraHandsVisible}/2`}</span>
            <span>Evidencia recibida por Java: {visibleIntentionHands}/2</span>
            {intentionThresholdMs > 0 && (
              <span>Confirmación: {intentionElapsedMs}/{intentionThresholdMs} ms</span>
            )}
            {candidateClass && (
              <span>
                Candidato: {STEP_LABELS[candidateClass] ?? candidateClass}
                {candidateConfidence !== null ? ` (${Math.round(candidateConfidence * 100)} %)` : ''}
              </span>
            )}
          </div>
        </div>
      )}

      {isActive && mode === 'PROTOCOLO_OMS' && candidateClass && (
        <div className="mb-4 text-xs text-muted-foreground" role="status" aria-live="polite">
          <p className="font-semibold text-card-foreground">
            Movimiento candidato, sin confirmar: {STEP_LABELS[candidateClass] ?? candidateClass}.
          </p>
          <p className="mt-1">
            El paso avanza cuando otra observación reciente coincide; este candidato aún no cuenta como completado.
          </p>
          {candidateConfidence !== null && <p>Confianza: {Math.round(candidateConfidence * 100)} %.</p>}
        </div>
      )}

      {isActive && mode === 'FRICCION_PARCIAL' && frictionSequenceObservedComplete && (
        <div className="mb-4 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2.5 text-xs text-foreground" role="status" aria-live="polite">
          Se observaron los seis movimientos de fricción. Esto no verifica el lavado OMS completo ni constituye aprobación clínica.
        </div>
      )}

      {retries > 0 && isActive && (
        <div className="mb-4 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-foreground" role="status" aria-live="polite">
          <p className="font-semibold">Intento reiniciado {retries} {retries === 1 ? 'vez' : 'veces'}.</p>
          {lastRetryError && <p className="mt-1">{lastRetryError}</p>}
          <p className="mt-1">Empieza otra vez por {mode === 'PROTOCOLO_OMS' ? 'Mojar las manos' : 'Palmas'}.</p>
        </div>
      )}

      <div className="space-y-1">
        {steps.map((step, index) => {
          const status = getStepStatus(step);
          return (
            <div key={step} className="flex items-center gap-3">
              <div className="relative flex flex-col items-center">
                <div
                  role="img"
                  aria-label={`${STEP_LABELS[step] ?? step}: ${status === 'completed' ? 'completado y clínicamente validado' : status === 'informational' ? 'registrado como progreso informativo, sin aprobación clínica' : status === 'active' ? 'en curso' : status === 'infraction' ? 'con infracción' : 'pendiente'}`}
                  className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all duration-300',
                    status === 'active' && 'bg-primary text-primary-foreground ring-4 ring-primary/20 scale-110',
                    status === 'completed' && 'bg-success text-success-foreground',
                    status === 'informational' && 'bg-warning text-warning-foreground',
                    status === 'infraction' && 'bg-destructive text-destructive-foreground animate-pulse-slow',
                    status === 'pending' && 'bg-muted text-muted-foreground'
                  )}
                >
                  {status === 'completed' ? (
                    <Check className="h-4 w-4" strokeWidth={3} />
                  ) : status === 'informational' ? (
                    <AlertTriangle className="h-4 w-4" />
                  ) : status === 'infraction' ? (
                    <AlertTriangle className="h-4 w-4" />
                  ) : (
                    index + 1
                  )}
                </div>
                {index < steps.length - 1 && (
                  <div
                    className={cn(
                      'w-0.5 h-4 my-0.5 transition-colors duration-300',
                      status === 'completed' ? 'bg-success' : 'bg-muted'
                    )}
                  />
                )}
              </div>
              <div className="flex-1 py-1">
                <span
                  className={cn(
                    'text-sm font-medium transition-colors duration-200',
                    status === 'active' && 'text-primary font-bold',
                    status === 'completed' && 'text-success',
                    status === 'informational' && 'text-warning',
                    status === 'infraction' && 'text-destructive',
                    status === 'pending' && 'text-muted-foreground'
                  )}
                >
                  {STEP_LABELS[step] ?? step}
                </span>
                {status === 'infraction' && (
                  <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-bold text-destructive uppercase">
                    Infraccion
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {mode === 'PROTOCOLO_OMS' && (
        <div className="mt-5 border-t border-border/60 pt-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Predicción visual de espuma por región
            </h3>
            <span className={cn(
              'rounded-full px-2 py-1 text-[10px] font-bold',
              'bg-warning/10 text-warning'
            )}>
              {soapCoverageComplete
                ? 'Predicción completa'
                : `Predicción en ${Object.values(soapCoverage).filter((state) => state === 'ESPUMA_VISIBLE').length}/12 regiones`}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {Object.entries(SOAP_REGION_LABELS).map(([region, label]) => {
              const state: SoapEvidence = soapCoverage[region] ?? 'NO_VERIFICABLE';
              return (
                <div key={region} className="flex items-center justify-between gap-2 rounded-lg bg-muted/30 px-2 py-1.5 text-[10px]">
                  <span className="text-muted-foreground">{label}</span>
                  <span className={cn(
                    'shrink-0 font-bold text-muted-foreground'
                  )}>
                    {state === 'ESPUMA_VISIBLE' ? 'Predice espuma' : state === 'SIN_ESPUMA_VISIBLE' ? 'Predice sin espuma' : 'Sin evidencia evaluable'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!isActive && !summary && (
        <div className="mt-5 rounded-xl bg-muted/50 px-4 py-3 text-center text-xs font-medium text-muted-foreground">
          Inicie una sesion para ver el progreso
        </div>
      )}
      <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
        {mode === 'PROTOCOLO_OMS'
          ? 'La espuma es evidencia visual, no prueba química. La aprobación permanece desactivada hasta validar el modelo y no certifica esterilidad ni ausencia de microorganismos.'
          : 'El modelo actual solo evalúa estos movimientos de fricción; no verifica el procedimiento completo de la OMS.'}
      </p>
    </div>
  );
}
