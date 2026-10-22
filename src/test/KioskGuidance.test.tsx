import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { BackendMessageMapper } from '@/lib/BackendMessageMapper';
import { kioskGuideText } from '@/lib/KioskGuideCatalog';
import { KioskGuidance } from '@/components/KioskGuidance';
import { KioskWashSummary } from '@/components/KioskWashSummary';
import { FRICTION_STEPS, KIOSK_GUIDE_CODES, type FrictionEvaluation, type KioskGuide } from '@/types';

function evaluation(guia: KioskGuide, overrides: Partial<FrictionEvaluation> = {}): FrictionEvaluation {
  return {
    versionPolitica: 'FRICCION_BALANCEADA_V2', revisionEstado: 1, numeroIntento: 1,
    estadoIntento: 'ACTIVO', pasoEsperado: 'PASO_1_PALMAS', motivoRecuperacion: null,
    pasos: FRICTION_STEPS.map((paso) => ({ paso, estado: 'PENDIENTE', tiempoAcreditadoMs: 0, minimoRequeridoMs: 7000, motivo: null })),
    duracionMinimaFriccionMs: 42000, objetivoProcedimientoMs: 42000,
    secuenciaValidada: false, persistenciaPendiente: false, ultimoResultado: null, guia, ...overrides,
  };
}

describe('Java-chosen kiosk guidance', () => {
  beforeEach(() => cleanup());
  afterEach(() => { vi.unstubAllGlobals(); window.__HANDWASH_CONFIG__ = undefined; });

  it('translates every closed Java code into a non-empty instruction', () => {
    for (const codigo of KIOSK_GUIDE_CODES) {
      const text = kioskGuideText({ codigo, paso: 'PASO_2_DORSOS', faltanteMs: 3000, tono: 'INFO' });
      expect(text.title.length, codigo).toBeGreaterThan(0);
      expect(text.detail.length, codigo).toBeGreaterThan(0);
    }
  });

  it('draws the seven-second ring from Java credited time and the remaining seconds', () => {
    const value = evaluation({ codigo: 'CONTINUA_PASO', paso: 'PASO_1_PALMAS', faltanteMs: 2500, tono: 'INFO' });
    value.pasos[0] = { ...value.pasos[0], estado: 'EN_CURSO', tiempoAcreditadoMs: 4500 };
    render(<KioskGuidance evaluation={value} />);

    expect(screen.getByRole('img', { name: '4,5 de 7 segundos observados' })).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Sigue frotando 3 s más.')).toBeInTheDocument();
  });

  it('announces the next movement without a ring and chimes only when opted in', () => {
    const play = vi.fn();
    vi.stubGlobal('AudioContext', class {
      currentTime = 0;
      destination = {};
      createOscillator() { return { frequency: {}, connect: () => ({ connect: () => {} }), start: play, stop: () => {} }; }
      createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} } }; }
    });
    const first = evaluation({ codigo: 'CONTINUA_PASO', paso: 'PASO_1_PALMAS', faltanteMs: 100, tono: 'INFO' });
    const next = evaluation({ codigo: 'CAMBIA_A_PASO', paso: 'PASO_2_DORSOS', faltanteMs: null, tono: 'INFO' });

    const { rerender } = render(<KioskGuidance evaluation={first} />);
    rerender(<KioskGuidance evaluation={next} />);
    expect(screen.getByText('Cambia a: Dorsos')).toBeInTheDocument();
    expect(screen.queryByRole('img')).toBeNull();
    expect(play).not.toHaveBeenCalled();

    window.__HANDWASH_CONFIG__ = { kioskSound: true };
    rerender(<KioskGuidance evaluation={first} />);
    rerender(<KioskGuidance evaluation={next} />);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it('order corrections focus on the order message without a ring', () => {
    render(<KioskGuidance evaluation={evaluation({ codigo: 'SIGUE_EL_ORDEN', paso: 'PASO_2_DORSOS', faltanteMs: 7000, tono: 'CORRECCION' })} />);
    expect(screen.getByText('Orden: primero Dorsos')).toBeInTheDocument();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('technical waits never blame the person', () => {
    render(<KioskGuidance evaluation={evaluation({ codigo: 'ESPERA_TECNICA', paso: null, faltanteMs: null, tono: 'TECNICO' })} />);
    expect(screen.getByText(/no es un error tuyo/)).toBeInTheDocument();
  });

  it('final summary marks each movement exactly as Java stored it', () => {
    const value = evaluation({ codigo: 'LAVADO_INCOMPLETO', paso: 'PASO_3_INTERDIGITALES', faltanteMs: null, tono: 'ALERTA' },
      { estadoIntento: 'INTERRUMPIDO' });
    value.pasos[0] = { ...value.pasos[0], estado: 'VALIDADO', tiempoAcreditadoMs: 7000 };
    value.pasos[1] = { ...value.pasos[1], estado: 'VALIDADO', tiempoAcreditadoMs: 7400 };
    value.pasos[2] = { ...value.pasos[2], estado: 'EN_CURSO', tiempoAcreditadoMs: 3100 };
    render(<KioskWashSummary evaluation={value} />);

    const items = screen.getAllByRole('listitem');
    expect(within(items[0]).getByText('Validado · 7,0 / 7 s')).toBeInTheDocument();
    expect(within(items[2]).getByText('Incompleto · 3,1 / 7 s')).toBeInTheDocument();
    expect(within(items[5]).getByText('No realizado')).toBeInTheDocument();
  });

  it('rejects evaluations whose guidance is missing or outside the closed catalog', () => {
    const parse = (guia: unknown) => new BackendMessageMapper().parse(JSON.stringify({
      sessionId: 's', messageType: 'STATE_UPDATE', estadoActual: 'PASO_1_PALMAS',
      evaluacionFriccion: { ...evaluation({ codigo: 'CONTINUA_PASO', paso: 'PASO_1_PALMAS', faltanteMs: 0, tono: 'INFO' }), guia },
    })).kind;

    expect(parse({ codigo: 'CONTINUA_PASO', paso: 'PASO_1_PALMAS', faltanteMs: 0, tono: 'INFO' })).toBe('state');
    expect(parse(undefined)).toBe('ignored');
    expect(parse({ codigo: 'APROBADO_CLINICO', paso: null, faltanteMs: null, tono: 'EXITO' })).toBe('ignored');
    expect(parse({ codigo: 'CONTINUA_PASO', paso: 'PASO_7_CIRCULARES', faltanteMs: 0, tono: 'INFO' })).toBe('ignored');
    expect(parse({ codigo: 'CONTINUA_PASO', paso: 'PASO_1_PALMAS', faltanteMs: -1, tono: 'INFO' })).toBe('ignored');
  });
});
