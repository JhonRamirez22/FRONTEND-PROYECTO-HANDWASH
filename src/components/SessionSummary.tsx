import { CheckCircle, XCircle, Clock, TrendingUp, AlertTriangle } from 'lucide-react';
import { useSessionStore } from '@/stores/sessionStore';
import { SOAP_REGION_LABELS, STEP_LABELS } from '@/types';
import type { HandWashStep, SoapEvidence } from '@/types';
import type { DeploymentStatus } from '@/lib/DeploymentStatusService';
import { cn } from '@/lib/utils';

interface SessionSummaryProps {
  deploymentStatus: DeploymentStatus;
}

export function SessionSummary({ deploymentStatus }: SessionSummaryProps) {
  const summary = useSessionStore((s) => s.summary);

  if (!summary) return null;

  const procedureValidated = summary.procedimientoCompletoValidado === true;
  const backendApproval = summary.aprobado === true && procedureValidated;
  const approved = deploymentStatus.clinicalDecisionAllowed && backendApproval;
  const sequenceCompleted = !approved && (
    summary.estadoSesion === 'COMPLETADA'
    || backendApproval
    || summary.resultado?.startsWith('SECUENCIA_COMPLETADA')
    || summary.resultado?.startsWith('SECUENCIA_OMS_COMPLETADA')
  );
  const title = approved
    ? 'Sesión aprobada'
    : sequenceCompleted
      ? 'Secuencia completada'
      : 'Sesión incompleta';

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  return (
    <div className="neumorphic rounded-2xl p-6">
      <div className="mb-6 text-center">
        <div
          role="img"
          aria-label={approved ? 'Procedimiento validado' : sequenceCompleted ? 'Secuencia parcial completada' : 'Sesión incompleta'}
          className={cn(
            'mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full transition-all duration-500',
            approved
              ? 'bg-success/10 text-success shadow-neumorphic-sm'
              : sequenceCompleted
                ? 'bg-warning/10 text-warning shadow-neumorphic-sm'
                : 'bg-destructive/10 text-destructive shadow-neumorphic-sm'
          )}
        >
          {approved ? (
            <CheckCircle className="h-10 w-10" strokeWidth={2} />
          ) : sequenceCompleted ? (
            <AlertTriangle className="h-10 w-10" strokeWidth={2} />
          ) : (
            <XCircle className="h-10 w-10" strokeWidth={2} />
          )}
        </div>
        <h2 className={cn(
          'font-heading text-2xl font-bold',
          approved ? 'text-success' : sequenceCompleted ? 'text-warning' : 'text-destructive'
        )}>
          {title}
        </h2>
        <div className="mt-2 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Clock className="h-4 w-4" />
          <span>Tiempo total: <span className="font-semibold text-foreground">{formatTime(summary.tiempoTotalSegundos)}</span></span>
        </div>
      </div>

      {sequenceCompleted && !deploymentStatus.clinicalDecisionAllowed && (
        <div role="alert" className="mb-6 rounded-xl border border-warning/30 bg-warning/5 p-4 text-sm">
          <p className="font-semibold text-foreground">Resultado informativo; no es una aprobación clínica</p>
          <p className="mt-1 text-muted-foreground">{deploymentStatus.notice}</p>
        </div>
      )}

      {!procedureValidated && summary.accionesNoDetectadas?.length ? (
        <div className="mb-6 rounded-xl border border-warning/30 bg-warning/5 p-4 text-sm">
          <p className="font-semibold text-foreground">Evaluación parcial</p>
          <p className="mt-1 text-muted-foreground">
            {summary.modoEvaluacion === 'PROTOCOLO_OMS' && summary.resultado?.startsWith('SECUENCIA_OMS_COMPLETADA')
              ? 'Una eventual aprobación clínica requiere validar independientemente el modelo y la evidencia, además de una autorización clínica firmada. Esta secuencia no certifica el cumplimiento del protocolo ni la eliminación de microorganismos.'
              : `Faltan evidencias para validar: ${summary.accionesNoDetectadas.map((action) => STEP_LABELS[action as HandWashStep] ?? action.replace(/_/g, ' ').toLowerCase()).join(', ')}.`}
          </p>
        </div>
      ) : null}

      {summary.modoEvaluacion === 'PROTOCOLO_OMS' && (
        <div className="mb-6 rounded-xl border border-border/60 bg-muted/20 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-foreground">Predicción visual de espuma</h3>
            <span className={cn(
              'rounded-full px-2.5 py-1 text-xs font-bold',
              'bg-warning/10 text-warning'
            )}>
              {summary.coberturaJabonCompleta ? 'Predicción completa' : 'Predicción parcial'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {Object.entries(SOAP_REGION_LABELS).map(([region, label]) => {
              const state: SoapEvidence = summary.coberturaJabon?.[region] ?? 'NO_VERIFICABLE';
              return (
                <div key={region} className="flex items-center justify-between gap-2 rounded-lg bg-background/70 px-2.5 py-2 text-xs">
                  <span className="text-muted-foreground">{label}</span>
                  <span className={cn(
                    'font-semibold',
                    'text-muted-foreground'
                  )}>
                    {state === 'ESPUMA_VISIBLE' ? 'Predice espuma visible' : state === 'SIN_ESPUMA_VISIBLE' ? 'Predice sin espuma' : 'Sin evidencia evaluable'}
                  </span>
                </div>
              );
            })}
          </div>
          {summary.duracionMinimaObjetivoMs ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Objetivo mínimo observado: {Math.ceil(summary.duracionMinimaObjetivoMs / 1000)} s.
            </p>
          ) : null}
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            Es una salida visual del modelo aún no validado; puede equivocarse y no demuestra presencia química de jabón ni eliminación de microorganismos.
          </p>
        </div>
      )}

      {(summary.intentosReiniciados ?? 0) > 0 && (
        <div className="mb-6 rounded-xl border border-warning/30 bg-warning/5 p-4 text-sm">
          <p className="font-semibold text-foreground">Reintentos realizados: {summary.intentosReiniciados}</p>
          <p className="mt-1 text-muted-foreground">
            Los intentos incorrectos se conservaron en el historial y no se mezclaron con el último intento.
          </p>
        </div>
      )}

      <div className="mb-6">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Score promedio de confianza recibida
            </h3>
          </div>
          <span className="text-sm font-bold text-foreground">
            {Math.round(summary.confianzaPromedio * 100)}%
          </span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-muted/50 neumorphic-inset">
          <div
            className="h-full rounded-full bg-primary transition-all duration-700 ease-out"
            style={{ width: `${summary.confianzaPromedio * 100}%` }}
          />
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          Es el score reportado por el productor; no equivale a precisión del paso ni a calidad clínica del lavado.
        </p>
      </div>

      <div className="mb-6">
        <h3 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Tiempo por Paso
        </h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {Object.entries(summary.tiempoPorPaso).map(([step, seconds]) => (
            <div
              key={step}
              className="rounded-xl bg-muted/30 px-3 py-2 text-center transition-colors hover:bg-muted/50"
            >
              <span className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {STEP_LABELS[step as HandWashStep] ?? step}
              </span>
              <span className="font-mono text-sm font-bold text-foreground">
                {formatTime(seconds as number)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {summary.infracciones.length > 0 && (
        <div>
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Infracciones ({summary.infracciones.length})
            </h3>
          </div>
          <div className="space-y-1.5">
            {summary.infracciones.map((infraction, index) => (
              <div
                key={`${infraction.timestamp}-${index}`}
                className="flex items-center justify-between rounded-lg bg-destructive/5 px-3 py-2 text-sm"
              >
                <span className="font-semibold text-destructive">
                  {STEP_LABELS[infraction.step as HandWashStep] ?? infraction.step}
                </span>
                <span className="text-muted-foreground text-xs">{infraction.motivo}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
