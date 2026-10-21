import { create } from 'zustand';
import type {
  SessionState,
  Protocolo,
  InfractionEvent,
  SessionSummaryEvent,
  HandWashStep,
  EvaluationMode,
  SoapEvidence,
  DetectionStateUpdate,
} from '@/types';

interface SessionStore extends SessionState {
  startSession: (sessionId: string, protocolo: Protocolo, accessToken?: string | null, isOwner?: boolean) => void;
  endSession: () => void;
  setCurrentStep: (step: HandWashStep) => void;
  addInfraction: (infraction: InfractionEvent) => void;
  setSummary: (summary: SessionSummaryEvent) => void;
  finishSession: (summary: SessionSummaryEvent) => void;
  setElapsedSeconds: (seconds: number) => void;
  clearProgress: () => void;
  setDetectionDiagnostics: (diagnostics: {
    estadoIntencion: string;
    motivoIntencion: string;
    manosVisiblesIntencion: number;
    tiempoConfirmacionIntencionMs: number;
    umbralConfirmacionIntencionMs: number;
    claseCandidata: HandWashStep | '';
  confianzaCandidata: number | null;
  secuenciaFriccionObservadaCompleta: boolean;
  }) => void;
  applyDetectionUpdate: (update: DetectionStateUpdate) => void;
  setRetryCount: (count: number) => void;
  setLastRetryError: (detail: string | null) => void;
  setCameraHandsVisible: (count: number | null) => void;
  setEvaluationMode: (mode: EvaluationMode) => void;
  setSoapCoverage: (coverage: Record<string, SoapEvidence>, complete: boolean) => void;
}

export const useSessionStore = create<SessionStore>((set) => ({
  frictionEvaluation: null,
  sessionId: null,
  accessToken: null,
  isOwner: false,
  protocolo: null,
  isActive: false,
  currentStep: '',
  previousStep: '',
  elapsedSeconds: 0,
  infractions: [],
  summary: null,
  intentosReiniciados: 0,
  ultimoErrorReinicio: null,
  modoEvaluacion: null,
  coberturaJabon: {},
  coberturaJabonCompleta: false,
  estadoIntencion: 'NO_EVALUADA',
  motivoIntencion: '',
  cameraHandsVisible: null,
  manosVisiblesIntencion: 0,
  tiempoConfirmacionIntencionMs: 0,
  umbralConfirmacionIntencionMs: 0,
  claseCandidata: '',
  confianzaCandidata: null,
  secuenciaFriccionObservadaCompleta: false,

  startSession: (sessionId, protocolo, accessToken = null, isOwner = true) =>
    set({
      frictionEvaluation: null,
      sessionId,
      accessToken,
      isOwner,
      protocolo,
      isActive: true,
      currentStep: '',
      previousStep: '',
      elapsedSeconds: 0,
      infractions: [],
      summary: null,
      intentosReiniciados: 0,
      ultimoErrorReinicio: null,
      modoEvaluacion: null,
      coberturaJabon: {},
      coberturaJabonCompleta: false,
      estadoIntencion: 'NO_EVALUADA',
      motivoIntencion: '',
      cameraHandsVisible: null,
      manosVisiblesIntencion: 0,
      tiempoConfirmacionIntencionMs: 0,
      umbralConfirmacionIntencionMs: 0,
      claseCandidata: '',
      confianzaCandidata: null,
      secuenciaFriccionObservadaCompleta: false,
    }),

  endSession: () =>
    set({
      frictionEvaluation: null,
      sessionId: null,
      isActive: false,
      accessToken: null,
      isOwner: false,
      protocolo: null,
      currentStep: '',
      previousStep: '',
      elapsedSeconds: 0,
      infractions: [],
      summary: null,
      intentosReiniciados: 0,
      ultimoErrorReinicio: null,
      modoEvaluacion: null,
      coberturaJabon: {},
      coberturaJabonCompleta: false,
      estadoIntencion: 'NO_EVALUADA',
      motivoIntencion: '',
      cameraHandsVisible: null,
      manosVisiblesIntencion: 0,
      tiempoConfirmacionIntencionMs: 0,
      umbralConfirmacionIntencionMs: 0,
      claseCandidata: '',
      confianzaCandidata: null,
      secuenciaFriccionObservadaCompleta: false,
    }),

  setCurrentStep: (step) =>
    set((state) => ({
      previousStep: state.currentStep,
      currentStep: step,
    })),

  addInfraction: (infraction) => set((state) => ({
    infractions: appendUniqueInfraction(state.infractions, infraction),
  })),

  applyDetectionUpdate: (update) => set((state) => {
    if (update.sessionId && update.sessionId !== state.sessionId) return state;
    const incoming = update.frictionEvaluation;
    const previous = state.frictionEvaluation;
    if (previous && (!incoming || incoming.revisionEstado <= previous.revisionEstado
      || incoming.numeroIntento < previous.numeroIntento)) return state;
    const startsAttempt = update.currentStep === 'PASO_1_PALMAS'
      || update.currentStep === 'OMS_01_MOJAR_MANOS';
    const clear = update.waitingForStart || (startsAttempt && state.currentStep === '');
    let infractions = clear ? [] : state.infractions;
    if (update.infraction) infractions = appendUniqueInfraction(infractions, update.infraction);

    return {
      ...(incoming ? { frictionEvaluation: incoming } : {}),
      ...(clear ? {
        currentStep: '', previousStep: '', elapsedSeconds: 0,
      } : {}),
      ...(update.currentStep ? {
        previousStep: clear ? '' : state.currentStep,
        currentStep: update.currentStep,
        elapsedSeconds: update.elapsedSeconds ?? 0,
      } : {}),
      ...(update.waitingForStart ? { currentStep: '', previousStep: '', elapsedSeconds: 0 } : {}),
      infractions,
      ...(update.evaluationMode ? { modoEvaluacion: update.evaluationMode } : {}),
      ...(update.soapCoverage ? {
        coberturaJabon: update.soapCoverage,
        coberturaJabonCompleta: update.soapCoverageComplete,
      } : {}),
      estadoIntencion: update.intentionState,
      motivoIntencion: update.intentionReason,
      manosVisiblesIntencion: update.visibleHands,
      tiempoConfirmacionIntencionMs: update.intentionElapsedMs,
      umbralConfirmacionIntencionMs: update.intentionThresholdMs,
      claseCandidata: update.candidateStep,
      confianzaCandidata: update.candidateConfidence,
      ...(update.retryCount === null ? {} : { intentosReiniciados: update.retryCount }),
      ...(update.lastRetryError ? { ultimoErrorReinicio: update.lastRetryError } : {}),
      secuenciaFriccionObservadaCompleta: update.waitingForStart
        ? false
        : update.frictionSequenceObservedComplete ?? state.secuenciaFriccionObservadaCompleta,
    };
  }),

  setSummary: (summary) => set({ summary }),
  finishSession: (summary) => set({
    frictionEvaluation: null,
    summary,
    sessionId: null,
    accessToken: null,
    isOwner: false,
    protocolo: null,
    isActive: false,
    cameraHandsVisible: null,
    ...(summary.modoEvaluacion ? { modoEvaluacion: summary.modoEvaluacion } : {}),
    ...(summary.coberturaJabon ? {
      coberturaJabon: summary.coberturaJabon,
      coberturaJabonCompleta: summary.coberturaJabonCompleta ?? false,
    } : {}),
  }),

  setElapsedSeconds: (seconds) => set({ elapsedSeconds: seconds }),
  clearProgress: () => set({
    frictionEvaluation: null,
    currentStep: '', previousStep: '', elapsedSeconds: 0, infractions: [],
    secuenciaFriccionObservadaCompleta: false,
  }),
  setDetectionDiagnostics: (diagnostics) => set(diagnostics),
  setRetryCount: (intentosReiniciados) => set({ intentosReiniciados }),
  setLastRetryError: (ultimoErrorReinicio) => set({ ultimoErrorReinicio }),
  setCameraHandsVisible: (cameraHandsVisible) => set({ cameraHandsVisible }),
  setEvaluationMode: (modoEvaluacion) => set({ modoEvaluacion }),
  setSoapCoverage: (coberturaJabon, coberturaJabonCompleta) => set({ coberturaJabon, coberturaJabonCompleta }),
}));

function appendUniqueInfraction(
  existing: InfractionEvent[],
  incoming: InfractionEvent,
): InfractionEvent[] {
  const duplicate = existing.some((item) => item.step === incoming.step
    && item.motivo === incoming.motivo && item.timestamp === incoming.timestamp);
  return duplicate ? existing : [...existing.slice(-199), incoming];
}
