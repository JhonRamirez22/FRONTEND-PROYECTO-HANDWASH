import { beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { BackendMessageMapper } from '@/lib/BackendMessageMapper';
import { useSessionStore } from '@/stores/sessionStore';
import { KioskProgress } from '@/components/KioskProgress';
import { StepStepper } from '@/components/StepStepper';
import { FRICTION_STEPS, type FrictionEvaluation } from '@/types';

function evaluation(revision = 1, attempt = 1): FrictionEvaluation {
  return {
    versionPolitica: 'FRICCION_BALANCEADA_V2', revisionEstado: revision, numeroIntento: attempt,
    estadoIntento: 'ACTIVO', pasoEsperado: 'PASO_6_PUNTA_DE_DEDOS', motivoRecuperacion: null,
    pasos: FRICTION_STEPS.map((paso, index) => ({ paso, estado: 'PENDIENTE', tiempoAcreditadoMs: 0, minimoRequeridoMs: index < 4 ? 6000 : 4000, motivo: null })),
    duracionMinimaFriccionMs: 32000, objetivoProcedimientoMs: 40000,
    secuenciaValidada: false, persistenciaPendiente: false, ultimoResultado: null,
    guia: { codigo: 'CONTINUA_PASO', paso: 'PASO_6_PUNTA_DE_DEDOS', faltanteMs: 4000, tono: 'INFO' },
  };
}
function apply(value: FrictionEvaluation, sessionId = 'one') {
  const message = new BackendMessageMapper().parse(JSON.stringify({
    sessionId, messageType: 'STATE_UPDATE', estadoActual: value.pasoEsperado,
    evaluacionFriccion: value, modoEvaluacion: 'FRICCION_PARCIAL', estadoSesion: 'EN_PROGRESO',
  }));
  if (message.kind === 'state') useSessionStore.getState().applyDetectionUpdate(message.update);
  return message;
}
describe('Balanced friction Java contract and passive progress', () => {
  beforeEach(() => { cleanup(); useSessionStore.getState().startSession('one', 'DOMESTICO'); });
  it('ignores old revisions, old attempts, foreign sessions and legacy updates after v2', () => {
    apply(evaluation(4, 2));
    apply(evaluation(3, 2));
    apply(evaluation(5, 1));
    apply(evaluation(6, 3), 'other');
    const legacy = new BackendMessageMapper().parse('{"estadoActual":"PASO_1_PALMAS"}');
    if (legacy.kind === 'state') useSessionStore.getState().applyDetectionUpdate(legacy.update);
    expect(useSessionStore.getState().frictionEvaluation?.revisionEstado).toBe(4);
    apply(evaluation(7, 3));
    expect(useSessionStore.getState().frictionEvaluation?.numeroIntento).toBe(3);
  });
  it('rejects malformed or contradictory nested evaluations instead of falling back', () => {
    const value = evaluation();
    value.secuenciaValidada = true;
    expect(apply(value).kind).toBe('ignored');
    value.secuenciaValidada = false;
    value.pasos[0].tiempoAcreditadoMs = -1;
    expect(apply(value).kind).toBe('ignored');
  });
  it('never derives validation from step index and presents correction without buttons', () => {
    const value = evaluation();
    value.estadoIntento = 'PAUSADO';
    value.motivoRecuperacion = 'STEP_TOO_SHORT';
    value.pasos[0].estado = 'REQUIERE_REPETICION';
    value.guia = { codigo: 'VUELVE_A_PASO', paso: 'PASO_1_PALMAS', faltanteMs: 2000, tono: 'CORRECCION' };
    apply(value);
    const { container } = render(<KioskProgress />);
    expect(screen.getByText('Corrección pendiente · Java')).toBeInTheDocument();
    expect(screen.getByText('Vuelve a Palmas')).toBeInTheDocument();
    expect(screen.getByText(/Faltan 2 s/)).toBeInTheDocument();
    expect(screen.queryByText('Validado · Java')).not.toBeInTheDocument();
    expect(container.querySelector('button, input, form, a')).toBeNull();
  });
  it('renders the sixth validated movement and does not claim clinical completion', () => {
    const value = evaluation();
    value.estadoIntento = 'COMPLETO_PARCIAL';
    value.secuenciaValidada = true;
    value.pasos.forEach((step) => { step.estado = 'VALIDADO'; step.tiempoAcreditadoMs = step.minimoRequeridoMs; });
    value.guia = { codigo: 'LAVADO_COMPLETO', paso: null, faltanteMs: null, tono: 'EXITO' };
    apply(value);
    render(<KioskProgress />);
    expect(screen.getByText('Seis movimientos validados')).toBeInTheDocument();
    const last = screen.getAllByRole('listitem')[5];
    expect(within(last).getByText('Validado · 4,0 / 4 s')).toBeInTheDocument();
    expect(screen.getByText(/no certifica cumplimiento clínico/)).toBeInTheDocument();
  });
  it('shows pending storage and clears revision history only with a new technical session', () => {
    const value = evaluation();
    value.estadoIntento = 'PENDIENTE_PERSISTENCIA';
    value.persistenciaPendiente = true;
    value.motivoRecuperacion = 'AUDIT_STORAGE_UNAVAILABLE';
    value.guia = { codigo: 'ESPERA_TECNICA', paso: null, faltanteMs: null, tono: 'TECNICO' };
    apply(value);
    render(<KioskProgress />);
    expect(screen.getByText('Guardado pendiente')).toBeInTheDocument();
    useSessionStore.getState().startSession('two', 'DOMESTICO');
    expect(useSessionStore.getState().frictionEvaluation).toBeNull();
  });
  it('also keeps the local web stepper driven by Java evaluations, never step position', () => {
    const value = evaluation();
    value.pasos[5].estado = 'REQUIERE_REPETICION';
    apply(value);
    render(<StepStepper deploymentStatus={{ mode: 'DEVELOPMENT', clinicalDecisionAllowed: false, notice: 'Piloto' }} />);
    expect(screen.getByRole('img', { name: 'Palmas: pendiente' })).toBeInTheDocument();
    expect(screen.getByText('Estado Java: corrección pendiente')).toBeInTheDocument();
  });
});
