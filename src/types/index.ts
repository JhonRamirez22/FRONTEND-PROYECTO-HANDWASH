export type HandWashStep =
  | 'PASO_1_PALMAS'
  | 'PASO_2_DORSOS'
  | 'PASO_3_INTERDIGITALES'
  | 'PASO_4_NUDILLOS'
  | 'PASO_5_PULGAR'
  | 'PASO_6_PUNTA_DE_DEDOS'
  | 'PASO_7_CIRCULARES'
  | 'OMS_01_MOJAR_MANOS'
  | 'OMS_02_APLICAR_JABON'
  | 'OMS_03_FROTAR_PALMAS'
  | 'OMS_04_FROTAR_DORSOS'
  | 'OMS_05_FROTAR_ENTRE_DEDOS'
  | 'OMS_06_FROTAR_DORSO_DE_DEDOS'
  | 'OMS_07_FROTAR_PULGARES'
  | 'OMS_08_FROTAR_PUNTAS_DE_DEDOS'
  | 'OMS_09_ENJUAGAR_MANOS'
  | 'OMS_10_SECAR_TOALLA_DESECHABLE'
  | 'OMS_11_CERRAR_GRIFO_CON_TOALLA'
  | 'OMS_CONTACTO_RIESGO'
  | 'FONDO';

export type Protocolo = 'AGUA_Y_JABON' | 'CLINICO_QUIRURGICO' | 'DOMESTICO';
export type EvaluationMode = 'PROTOCOLO_OMS' | 'FRICCION_PARCIAL';
export type SoapEvidence = 'ESPUMA_VISIBLE' | 'SIN_ESPUMA_VISIBLE' | 'NO_VERIFICABLE';

export interface StateChangeEvent {
  type: 'STATE_CHANGE';
  previousStep: string;
  currentStep: string;
  elapsedSeconds: number;
}

export interface InfractionEvent {
  type: 'INFRACTION';
  step: string;
  motivo: string;
  timestamp: string;
}

export interface SessionSummaryEvent {
  type: 'SESSION_SUMMARY';
  estadoSesion?: string;
  tiempoTotalSegundos: number;
  tiempoPorPaso: Record<string, number>;
  confianzaPromedio: number;
  infracciones: InfractionEvent[];
  /** Violations belonging to the final attempt, distinct from retry history. */
  infraccionesIntentoFinal?: InfractionEvent[];
  aprobado: boolean;
  resultado?: string;
  procedimientoCompletoValidado?: boolean;
  alcanceEvaluacion?: string;
  accionesNoDetectadas?: string[];
  intentosReiniciados?: number;
  intentoFinal?: number;
  intentoFinalSinInfracciones?: boolean;
  modoEvaluacion?: EvaluationMode;
  coberturaJabon?: Record<string, SoapEvidence>;
  coberturaJabonCompleta?: boolean;
  duracionMinimaObjetivoMs?: number;
}

export type WebSocketMessage =
  | StateChangeEvent
  | InfractionEvent
  | SessionSummaryEvent;

export interface ConnectionState {
  status: 'connected' | 'reconnecting' | 'disconnected';
  reconnectAttempts: number;
}

export interface SessionState {
  frictionEvaluation: FrictionEvaluation | null;
  sessionId: string | null;
  accessToken: string | null;
  isOwner: boolean;
  protocolo: Protocolo | null;
  isActive: boolean;
  currentStep: string;
  previousStep: string;
  elapsedSeconds: number;
  infractions: InfractionEvent[];
  summary: SessionSummaryEvent | null;
  intentosReiniciados: number;
  ultimoErrorReinicio: string | null;
  modoEvaluacion: EvaluationMode | null;
  coberturaJabon: Record<string, SoapEvidence>;
  coberturaJabonCompleta: boolean;
  estadoIntencion: string;
  motivoIntencion: string;
  cameraHandsVisible: number | null;
  manosVisiblesIntencion: number;
  tiempoConfirmacionIntencionMs: number;
  umbralConfirmacionIntencionMs: number;
  claseCandidata: HandWashStep | '';
  confianzaCandidata: number | null;
  secuenciaFriccionObservadaCompleta: boolean;
}

/** A validated, single-message update from the Java session WebSocket. */
export interface DetectionStateUpdate {
  sessionId?: string;
  frictionEvaluation?: FrictionEvaluation;
  currentStep: HandWashStep | null;
  elapsedSeconds: number | null;
  waitingForStart: boolean;
  evaluationMode: EvaluationMode | null;
  soapCoverage: Record<string, SoapEvidence> | null;
  soapCoverageComplete: boolean;
  intentionState: string;
  intentionReason: string;
  visibleHands: number;
  intentionElapsedMs: number;
  intentionThresholdMs: number;
  candidateStep: HandWashStep | '';
  candidateConfidence: number | null;
  retryCount: number | null;
  lastRetryError?: string;
  frictionSequenceObservedComplete?: boolean;
  infraction: InfractionEvent | null;
}

export type FrictionStepStatus = 'PENDIENTE' | 'EN_CURSO' | 'VALIDADO' | 'REQUIERE_REPETICION';
export interface FrictionEvaluation {
  versionPolitica: 'FRICCION_BALANCEADA_V2';
  revisionEstado: number;
  numeroIntento: number;
  estadoIntento: 'ESPERANDO_INICIO' | 'ACTIVO' | 'PAUSADO' | 'COMPLETO_PARCIAL' | 'INTERRUMPIDO' | 'PENDIENTE_PERSISTENCIA';
  pasoEsperado: HandWashStep;
  motivoRecuperacion: string | null;
  pasos: FrictionStepEvaluation[];
  duracionMinimaFriccionMs: number;
  objetivoProcedimientoMs: number;
  secuenciaValidada: boolean;
  persistenciaPendiente: boolean;
  ultimoResultado: { numeroIntento: number; resultado: string; motivo: string | null; pasos: FrictionStepEvaluation[] } | null;
  guia: KioskGuide;
}

/** Closed catalog of Java kiosk instructions; the kiosk only translates them. */
export const KIOSK_GUIDE_CODES = [
  'INICIA_CON_PALMAS', 'CONTINUA_PASO', 'CAMBIA_A_PASO', 'VUELVE_A_PASO', 'SIGUE_EL_ORDEN',
  'MUESTRA_AMBAS_MANOS', 'MANTEN_EL_MOVIMIENTO', 'LAVADO_COMPLETO', 'LAVADO_INCOMPLETO',
  'REINICIA_LAVADO', 'ESPERA_TECNICA',
] as const;
export type KioskGuideCode = typeof KIOSK_GUIDE_CODES[number];
export const KIOSK_GUIDE_TONES = ['INFO', 'CORRECCION', 'EXITO', 'ALERTA', 'TECNICO'] as const;
export type KioskGuideTone = typeof KIOSK_GUIDE_TONES[number];
export interface KioskGuide {
  codigo: KioskGuideCode;
  paso: HandWashStep | null;
  faltanteMs: number | null;
  tono: KioskGuideTone;
}
export interface FrictionStepEvaluation {
  paso: HandWashStep;
  estado: FrictionStepStatus;
  tiempoAcreditadoMs: number;
  minimoRequeridoMs: number;
  motivo: string | null;
}

export const STEP_LABELS: Partial<Record<HandWashStep, string>> & Record<string, string> = {
  PASO_1_PALMAS: 'Palmas',
  PASO_2_DORSOS: 'Dorsos',
  PASO_3_INTERDIGITALES: 'Interdigitales',
  PASO_4_NUDILLOS: 'Nudillos',
  PASO_5_PULGAR: 'Pulgar',
  PASO_6_PUNTA_DE_DEDOS: 'Punta de dedos',
  PASO_7_CIRCULARES: 'Circulares',
  OMS_01_MOJAR_MANOS: 'Mojar ambas manos',
  OMS_02_APLICAR_JABON: 'Aplicar jabón',
  OMS_03_FROTAR_PALMAS: 'Frotar palma con palma',
  OMS_04_FROTAR_DORSOS: 'Frotar dorsos',
  OMS_05_FROTAR_ENTRE_DEDOS: 'Frotar entre los dedos',
  OMS_06_FROTAR_DORSO_DE_DEDOS: 'Frotar dorsos de los dedos',
  OMS_07_FROTAR_PULGARES: 'Frotar ambos pulgares',
  OMS_08_FROTAR_PUNTAS_DE_DEDOS: 'Frotar puntas de dedos',
  OMS_09_ENJUAGAR_MANOS: 'Enjuagar ambas manos',
  OMS_10_SECAR_TOALLA_DESECHABLE: 'Secar con toalla desechable',
  OMS_11_CERRAR_GRIFO_CON_TOALLA: 'Cerrar grifo con la toalla',
  OMS_CONTACTO_RIESGO: 'Contacto de riesgo',
  FONDO: 'Fondo',
};

export const STEP_COLORS: Record<HandWashStep, string> = {
  PASO_1_PALMAS: '#3b82f6',
  PASO_2_DORSOS: '#8b5cf6',
  PASO_3_INTERDIGITALES: '#06b6d4',
  PASO_4_NUDILLOS: '#f59e0b',
  PASO_5_PULGAR: '#10b981',
  PASO_6_PUNTA_DE_DEDOS: '#ec4899',
  PASO_7_CIRCULARES: '#6366f1',
  OMS_01_MOJAR_MANOS: '#0ea5e9',
  OMS_02_APLICAR_JABON: '#06b6d4',
  OMS_03_FROTAR_PALMAS: '#3b82f6',
  OMS_04_FROTAR_DORSOS: '#8b5cf6',
  OMS_05_FROTAR_ENTRE_DEDOS: '#a855f7',
  OMS_06_FROTAR_DORSO_DE_DEDOS: '#d946ef',
  OMS_07_FROTAR_PULGARES: '#ec4899',
  OMS_08_FROTAR_PUNTAS_DE_DEDOS: '#f43f5e',
  OMS_09_ENJUAGAR_MANOS: '#0284c7',
  OMS_10_SECAR_TOALLA_DESECHABLE: '#10b981',
  OMS_11_CERRAR_GRIFO_CON_TOALLA: '#14b8a6',
  OMS_CONTACTO_RIESGO: '#dc2626',
  FONDO: '#9ca3af',
};

/** Legacy model classes: these are friction movements, not the full WHO protocol. */
export const FRICTION_STEPS: HandWashStep[] = [
  'PASO_1_PALMAS',
  'PASO_2_DORSOS',
  'PASO_3_INTERDIGITALES',
  'PASO_4_NUDILLOS',
  'PASO_5_PULGAR',
  'PASO_6_PUNTA_DE_DEDOS',
];

export const WHO_STEPS: HandWashStep[] = [
  'OMS_01_MOJAR_MANOS',
  'OMS_02_APLICAR_JABON',
  'OMS_03_FROTAR_PALMAS',
  'OMS_04_FROTAR_DORSOS',
  'OMS_05_FROTAR_ENTRE_DEDOS',
  'OMS_06_FROTAR_DORSO_DE_DEDOS',
  'OMS_07_FROTAR_PULGARES',
  'OMS_08_FROTAR_PUNTAS_DE_DEDOS',
  'OMS_09_ENJUAGAR_MANOS',
  'OMS_10_SECAR_TOALLA_DESECHABLE',
  'OMS_11_CERRAR_GRIFO_CON_TOALLA',
];

export const SOAP_REGION_LABELS: Record<string, string> = {
  PALMA_IZQUIERDA: 'Palma izquierda',
  PALMA_DERECHA: 'Palma derecha',
  DORSO_IZQUIERDO: 'Dorso izquierdo',
  DORSO_DERECHO: 'Dorso derecho',
  INTERDIGITALES_IZQUIERDA: 'Entre dedos, mano izquierda',
  INTERDIGITALES_DERECHA: 'Entre dedos, mano derecha',
  DORSO_DE_DEDOS_IZQUIERDO: 'Dorso de dedos izquierdo',
  DORSO_DE_DEDOS_DERECHO: 'Dorso de dedos derecho',
  PULGAR_IZQUIERDO: 'Pulgar izquierdo',
  PULGAR_DERECHO: 'Pulgar derecho',
  PUNTAS_DE_DEDOS_IZQUIERDA: 'Puntas de dedos izquierdas',
  PUNTAS_DE_DEDOS_DERECHA: 'Puntas de dedos derechas',
};
