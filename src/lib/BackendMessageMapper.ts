import type {
  DetectionStateUpdate,
  EvaluationMode,
  HandWashStep,
  InfractionEvent,
  SessionSummaryEvent,
  SoapEvidence,
  FrictionEvaluation,
} from '@/types';
import { FRICTION_STEPS } from '@/types';

type JsonRecord = Record<string, unknown>;

export type DashboardMessage =
  | { kind: 'state'; update: DetectionStateUpdate }
  | { kind: 'summary'; summary: SessionSummaryEvent }
  | { kind: 'ignored' };

const STEP_CODES = new Set<HandWashStep>([
  'PASO_1_PALMAS', 'PASO_2_DORSOS', 'PASO_3_INTERDIGITALES',
  'PASO_4_NUDILLOS', 'PASO_5_PULGAR', 'PASO_6_PUNTA_DE_DEDOS',
  'PASO_7_CIRCULARES', 'OMS_01_MOJAR_MANOS', 'OMS_02_APLICAR_JABON',
  'OMS_03_FROTAR_PALMAS', 'OMS_04_FROTAR_DORSOS',
  'OMS_05_FROTAR_ENTRE_DEDOS', 'OMS_06_FROTAR_DORSO_DE_DEDOS',
  'OMS_07_FROTAR_PULGARES', 'OMS_08_FROTAR_PUNTAS_DE_DEDOS',
  'OMS_09_ENJUAGAR_MANOS', 'OMS_10_SECAR_TOALLA_DESECHABLE',
  'OMS_11_CERRAR_GRIFO_CON_TOALLA', 'OMS_CONTACTO_RIESGO', 'FONDO',
]);

const SOAP_EVIDENCE_CODES = new Set<SoapEvidence>([
  'ESPUMA_VISIBLE', 'SIN_ESPUMA_VISIBLE', 'NO_VERIFICABLE',
]);

/** Converts untrusted Java WebSocket JSON into one typed dashboard update. */
export class BackendMessageMapper {
  constructor(private readonly now: () => string = () => new Date().toISOString()) {}

  parse(payload: string): DashboardMessage {
    const value: unknown = JSON.parse(payload);
    if (!this.isRecord(value)) return { kind: 'ignored' };

    const type = typeof value.messageType === 'string'
      ? value.messageType
      : typeof value.type === 'string' ? value.type : '';
    if (type === 'SESSION_SUMMARY') {
      return { kind: 'summary', summary: this.toSummary(value) };
    }
    if (type && type !== 'STATE_UPDATE' && type !== 'STATE_CHANGE' && type !== 'INFRACTION') {
      return { kind: 'ignored' };
    }
    const evaluation = this.toFrictionEvaluation(value.evaluacionFriccion);
    if (value.evaluacionFriccion != null && (!evaluation || typeof value.sessionId !== 'string')) return { kind: 'ignored' };
    return { kind: 'state', update: { ...this.toStateUpdate(value),
      ...(evaluation ? { frictionEvaluation: evaluation } : {}),
    } };
  }

  private toStateUpdate(message: JsonRecord): DetectionStateUpdate {
    const step = this.toStep(message.estadoActual);
    const candidate = this.toStep(message.claseCandidata);
    const retry = this.toFiniteNumber(message.intentosReiniciados);
    const error = this.isRecord(message.ultimoErrorReinicio)
      && typeof message.ultimoErrorReinicio.detalle === 'string'
      && message.ultimoErrorReinicio.detalle.trim()
      ? message.ultimoErrorReinicio.detalle.trim()
      : undefined;
    const rawConfidence = message.confianzaCandidata;

    return {
      ...(typeof message.sessionId === 'string' ? { sessionId: message.sessionId } : {}),
      currentStep: step === 'FONDO' ? null : step,
      elapsedSeconds: step && step !== 'FONDO'
        ? Math.max(0, Math.floor((this.toFiniteNumber(message.tiempoAcumuladoMs) ?? 0) / 1000))
        : null,
      waitingForStart: message.estadoSesion === 'ESPERANDO_INICIO',
      evaluationMode: this.toEvaluationMode(message.modoEvaluacion),
      soapCoverage: this.toSoapCoverage(message.coberturaJabon),
      soapCoverageComplete: message.coberturaJabonCompleta === true,
      intentionState: typeof message.estadoIntencion === 'string'
        ? message.estadoIntencion : 'NO_EVALUADA',
      intentionReason: typeof message.motivoIntencion === 'string'
        ? message.motivoIntencion : '',
      visibleHands: this.clamp(this.toFiniteNumber(message.manosVisibles) ?? 0, 0, 2),
      intentionElapsedMs: Math.max(0, this.toFiniteNumber(message.tiempoConfirmacionIntencionMs) ?? 0),
      intentionThresholdMs: Math.max(0, this.toFiniteNumber(message.umbralConfirmacionIntencionMs) ?? 0),
      candidateStep: candidate && candidate !== 'FONDO' ? candidate : '',
      candidateConfidence: typeof rawConfidence === 'number' && Number.isFinite(rawConfidence)
        ? this.clamp(rawConfidence, 0, 1) : null,
      retryCount: retry === null ? null : Math.max(0, Math.floor(retry)),
      ...(error ? { lastRetryError: error } : {}),
      ...(typeof message.secuenciaFriccionObservadaCompleta === 'boolean'
        ? { frictionSequenceObservedComplete: message.secuenciaFriccionObservadaCompleta }
        : {}),
      infraction: this.toInfraction(message.infraccion, step),
    };
  }

  private toFrictionEvaluation(value: unknown): FrictionEvaluation | undefined {
    if (!this.isRecord(value) || value.versionPolitica !== 'FRICCION_BALANCEADA_V2') return undefined;
    const integer = (v: unknown, minimum = 0): boolean => typeof v === 'number' && Number.isSafeInteger(v) && v >= minimum;
    const steps = (v: unknown): boolean => Array.isArray(v) && v.length === 6 && v.every((step, index) =>
      this.isRecord(step) && step.paso === FRICTION_STEPS[index]
      && ['PENDIENTE', 'EN_CURSO', 'VALIDADO', 'REQUIERE_REPETICION'].includes(String(step.estado))
      && integer(step.tiempoAcreditadoMs) && integer(step.minimoRequeridoMs, 1)
      && (step.motivo === null || typeof step.motivo === 'string'));
    if (!integer(value.revisionEstado) || !integer(value.numeroIntento, 1)
      || !['ESPERANDO_INICIO', 'ACTIVO', 'PAUSADO', 'COMPLETO_PARCIAL', 'INTERRUMPIDO', 'PENDIENTE_PERSISTENCIA'].includes(String(value.estadoIntento))
      || !FRICTION_STEPS.includes(value.pasoEsperado as HandWashStep)
      || !(value.motivoRecuperacion === null || typeof value.motivoRecuperacion === 'string')
      || !steps(value.pasos) || !integer(value.duracionMinimaFriccionMs, 1) || !integer(value.objetivoProcedimientoMs, 1)
      || typeof value.secuenciaValidada !== 'boolean' || typeof value.persistenciaPendiente !== 'boolean') return undefined;
    if (value.ultimoResultado !== null && (!this.isRecord(value.ultimoResultado)
      || !integer(value.ultimoResultado.numeroIntento, 1) || typeof value.ultimoResultado.resultado !== 'string'
      || !(value.ultimoResultado.motivo === null || typeof value.ultimoResultado.motivo === 'string')
      || !steps(value.ultimoResultado.pasos))) return undefined;
    if (value.secuenciaValidada && (value.persistenciaPendiente || value.estadoIntento !== 'COMPLETO_PARCIAL'
      || !(value.pasos as JsonRecord[]).every((step) => step.estado === 'VALIDADO'))) return undefined;
    return value as unknown as FrictionEvaluation;
  }

  private toSummary(message: JsonRecord): SessionSummaryEvent {
    const mode = this.toEvaluationMode(message.modoEvaluacion);
    const coverage = this.toSoapCoverage(message.coberturaJabon);
    const infractions = this.toInfractions(message.infracciones) ?? [];
    const finalAttemptInfractions = this.toInfractions(message.infraccionesIntentoFinal);

    return {
      type: 'SESSION_SUMMARY',
      estadoSesion: typeof message.estadoSesion === 'string' ? message.estadoSesion : undefined,
      tiempoTotalSegundos: Math.max(0, this.toFiniteNumber(message.tiempoTotalSegundos) ?? 0),
      tiempoPorPaso: this.toNumberRecord(message.tiempoPorPaso),
      confianzaPromedio: this.clamp(this.toFiniteNumber(message.confianzaPromedio) ?? 0, 0, 1),
      infracciones: infractions,
      ...(finalAttemptInfractions ? { infraccionesIntentoFinal: finalAttemptInfractions } : {}),
      aprobado: message.aprobado === true,
      resultado: typeof message.resultado === 'string' ? message.resultado : undefined,
      procedimientoCompletoValidado: message.procedimientoCompletoValidado === true,
      alcanceEvaluacion: typeof message.alcanceEvaluacion === 'string'
        ? message.alcanceEvaluacion : undefined,
      accionesNoDetectadas: Array.isArray(message.accionesNoDetectadas)
        ? message.accionesNoDetectadas.filter((item): item is string => typeof item === 'string')
        : undefined,
      intentosReiniciados: Math.max(0, this.toFiniteNumber(message.intentosReiniciados) ?? 0),
      intentoFinal: Math.max(0, this.toFiniteNumber(message.intentoFinal) ?? 0),
      intentoFinalSinInfracciones: message.intentoFinalSinInfracciones === true,
      modoEvaluacion: mode ?? undefined,
      coberturaJabon: coverage ?? undefined,
      coberturaJabonCompleta: message.coberturaJabonCompleta === true,
      duracionMinimaObjetivoMs: Math.max(0, this.toFiniteNumber(message.duracionMinimaObjetivoMs) ?? 0),
    };
  }

  private toInfractions(value: unknown): InfractionEvent[] | undefined {
    if (!Array.isArray(value)) return undefined;
    return value
      .filter((item): item is JsonRecord => this.isRecord(item))
      .map((item) => this.toInfraction(item, null))
      .filter((item): item is InfractionEvent => item !== null);
  }

  private toInfraction(value: unknown, currentStep: HandWashStep | null): InfractionEvent | null {
    if (!this.isRecord(value)) return null;
    return {
      type: 'INFRACTION',
      step: String(value.paso ?? value.step ?? currentStep ?? ''),
      motivo: String(value.detalle ?? value.motivo ?? ''),
      timestamp: String(value.timestamp ?? this.now()),
    };
  }

  private toStep(value: unknown): HandWashStep | null {
    return typeof value === 'string' && STEP_CODES.has(value as HandWashStep)
      ? value as HandWashStep : null;
  }

  private toEvaluationMode(value: unknown): EvaluationMode | null {
    return value === 'PROTOCOLO_OMS' || value === 'FRICCION_PARCIAL' ? value : null;
  }

  private toSoapCoverage(value: unknown): Record<string, SoapEvidence> | null {
    if (!this.isRecord(value)) return null;
    return Object.fromEntries(
      Object.entries(value).filter((entry): entry is [string, SoapEvidence] =>
        typeof entry[1] === 'string' && SOAP_EVIDENCE_CODES.has(entry[1] as SoapEvidence)),
    );
  }

  private toNumberRecord(value: unknown): Record<string, number> {
    if (!this.isRecord(value)) return {};
    return Object.fromEntries(
      Object.entries(value).filter((entry): entry is [string, number] =>
        typeof entry[1] === 'number' && Number.isFinite(entry[1])),
    );
  }

  private toFiniteNumber(value: unknown): number | null {
    if ((typeof value !== 'number' && typeof value !== 'string') || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  private clamp(value: number, minimum: number, maximum: number): number {
    return Math.max(minimum, Math.min(maximum, value));
  }

  private isRecord(value: unknown): value is JsonRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
