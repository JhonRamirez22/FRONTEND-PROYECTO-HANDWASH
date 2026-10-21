import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { BackendMessageMapper } from '@/lib/BackendMessageMapper';
import { KioskProgress } from '@/components/KioskProgress';
import { useSessionStore } from '@/stores/sessionStore';
import { FRICTION_STEPS, type FrictionEvaluation, type KioskGuide } from '@/types';

const COMPLETE_GUIDE: KioskGuide = { codigo: 'LAVADO_COMPLETO', paso: null, faltanteMs: null, tono: 'EXITO' };
const IN_PROGRESS_GUIDE: KioskGuide = { codigo: 'CONTINUA_PASO', paso: 'PASO_2_DORSOS', faltanteMs: 3000, tono: 'INFO' };

function evaluation(overrides: Partial<FrictionEvaluation> = {}): FrictionEvaluation {
  return {
    versionPolitica: 'FRICCION_BALANCEADA_V2', revisionEstado: 1, numeroIntento: 1,
    estadoIntento: 'ACTIVO', pasoEsperado: 'PASO_2_DORSOS', motivoRecuperacion: null,
    pasos: FRICTION_STEPS.map((paso) => ({ paso, estado: 'PENDIENTE', tiempoAcreditadoMs: 0, minimoRequeridoMs: 7000, motivo: null })),
    duracionMinimaFriccionMs: 42000, objetivoProcedimientoMs: 42000,
    secuenciaValidada: false, persistenciaPendiente: false, ultimoResultado: null, guia: IN_PROGRESS_GUIDE, ...overrides,
  };
}
const validated = () => FRICTION_STEPS.map((paso) => ({ paso, estado: 'VALIDADO' as const, tiempoAcreditadoMs: 7000, minimoRequeridoMs: 7000, motivo: null }));
const parse = (value: FrictionEvaluation) => new BackendMessageMapper().parse(JSON.stringify({
  sessionId: 's', messageType: 'STATE_UPDATE', estadoActual: 'PASO_1_PALMAS', evaluacionFriccion: value,
})).kind;

describe('kiosk fail-safe (R-01): never claims a wash Java did not confirm and store', () => {
  it('accepts a consistent stored completion', () => {
    expect(parse(evaluation({ estadoIntento: 'COMPLETO_PARCIAL', pasos: validated(), secuenciaValidada: true, guia: COMPLETE_GUIDE }))).toBe('state');
  });

  it('rejects "wash complete" guidance unless Java validated the six movements', () => {
    expect(parse(evaluation({ guia: COMPLETE_GUIDE }))).toBe('ignored');
    expect(parse(evaluation({ estadoIntento: 'PENDIENTE_PERSISTENCIA', persistenciaPendiente: true, guia: COMPLETE_GUIDE }))).toBe('ignored');
    expect(parse(evaluation({ estadoIntento: 'COMPLETO_PARCIAL', secuenciaValidada: false, guia: COMPLETE_GUIDE }))).toBe('ignored');
  });

  it('rejects a completed state that is still waiting for storage', () => {
    expect(parse(evaluation({ estadoIntento: 'COMPLETO_PARCIAL', pasos: validated(), persistenciaPendiente: true }))).toBe('ignored');
    expect(parse(evaluation({ estadoIntento: 'COMPLETO_PARCIAL', pasos: validated(), secuenciaValidada: true, persistenciaPendiente: true, guia: COMPLETE_GUIDE }))).toBe('ignored');
  });
});

describe('kiosk while the evaluation cannot be trusted', () => {
  beforeEach(() => {
    cleanup();
    useSessionStore.setState({ isActive: true, frictionEvaluation: evaluation(), currentStep: 'PASO_2_DORSOS' });
  });
  afterEach(() => cleanup());

  it('shows live guidance while the link to Java is healthy', () => {
    render(<KioskProgress />);
    expect(screen.getByText(/Sigue frotando|Continúa/i)).toBeInTheDocument();
  });

  it('drops stale guidance and says the wash is not being evaluated when the link is down', () => {
    render(<KioskProgress evaluating={false} />);
    expect(screen.queryByText(/Sigue frotando/i)).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Sin evaluación');
  });

  it('keeps an already stored completion visible even if the link drops afterwards', () => {
    act(() => useSessionStore.setState({
      frictionEvaluation: evaluation({ estadoIntento: 'COMPLETO_PARCIAL', pasos: validated(), secuenciaValidada: true, guia: COMPLETE_GUIDE }),
    }));
    render(<KioskProgress evaluating={false} />);
    expect(screen.getByRole('status')).toHaveTextContent('Seis movimientos validados');
  });
});
