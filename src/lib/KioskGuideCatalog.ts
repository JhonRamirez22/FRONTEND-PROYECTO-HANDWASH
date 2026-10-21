import { STEP_LABELS, type FrictionStepEvaluation, type KioskGuide, type KioskGuideCode } from '@/types';

export interface KioskGuideText {
  title: string;
  detail: string;
}

/** Seconds with one decimal and Spanish decimal comma, e.g. 4,5. */
export function formatSeconds(ms: number): string {
  return (ms / 1000).toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

const label = (guide: KioskGuide) => (guide.paso ? STEP_LABELS[guide.paso] ?? guide.paso : '');
const seconds = (ms: number | null) => Math.max(1, Math.ceil((ms ?? 0) / 1000));

/** Exhaustive by type: a new Java code fails the build until it is translated here. */
const MESSAGES: Record<KioskGuideCode, (guide: KioskGuide) => KioskGuideText> = {
  INICIA_CON_PALMAS: () => ({ title: 'Empieza: Palmas', detail: 'Frota palma contra palma con ambas manos en el recuadro.' }),
  CONTINUA_PASO: (g) => ({ title: label(g), detail: `Sigue frotando ${seconds(g.faltanteMs)} s más.` }),
  CAMBIA_A_PASO: (g) => ({ title: `Cambia a: ${label(g)}`, detail: 'Paso anterior validado.' }),
  VUELVE_A_PASO: (g) => ({ title: `Vuelve a ${label(g)}`, detail: `Faltan ${seconds(g.faltanteMs)} s. Los pasos validados se conservan.` }),
  SIGUE_EL_ORDEN: (g) => ({ title: `Orden: primero ${label(g)}`, detail: 'Haz los movimientos en el orden indicado.' }),
  MUESTRA_AMBAS_MANOS: () => ({ title: 'Muestra ambas manos', detail: 'Mantén las dos manos dentro del recuadro.' }),
  MANTEN_EL_MOVIMIENTO: (g) => ({ title: `Mantén el movimiento: ${label(g)}`, detail: 'Frota de forma continua y visible.' }),
  LAVADO_COMPLETO: () => ({ title: 'Lavado completo', detail: 'Los seis movimientos se validaron y quedaron registrados.' }),
  LAVADO_INCOMPLETO: () => ({ title: 'Lavado incompleto', detail: 'Faltaron movimientos. Quedó registrado como incompleto.' }),
  REINICIA_LAVADO: () => ({ title: 'Reinicia el lavado', detail: 'Empieza de nuevo con Palmas.' }),
  ESPERA_TECNICA: () => ({ title: 'Un momento', detail: 'Problema técnico del puesto; no es un error tuyo. Avisa al operador si continúa.' }),
};

export function kioskGuideText(guide: KioskGuide): KioskGuideText {
  return MESSAGES[guide.codigo](guide);
}

/** Codes whose instruction refers to the time credited for {@link KioskGuide.paso}. */
export function showsStepProgress(code: KioskGuideCode): boolean {
  return code === 'CONTINUA_PASO' || code === 'VUELVE_A_PASO' || code === 'MANTEN_EL_MOVIMIENTO';
}

/** Final per-step line; only presents Java's stored status and times. */
export function stepOutcome(step: FrictionStepEvaluation): { ok: boolean; text: string } {
  const observed = `${formatSeconds(step.tiempoAcreditadoMs)} / ${step.minimoRequeridoMs / 1000} s`;
  switch (step.estado) {
    case 'VALIDADO': return { ok: true, text: `Validado · ${observed}` };
    case 'REQUIERE_REPETICION': return { ok: false, text: `Tiempo insuficiente · ${observed}` };
    case 'EN_CURSO': return { ok: false, text: `Incompleto · ${observed}` };
    case 'PENDIENTE': return { ok: false, text: 'No realizado' };
  }
}
