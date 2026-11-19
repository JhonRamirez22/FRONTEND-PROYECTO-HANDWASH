import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KioskProgress } from '@/components/KioskProgress';

const base = { hands: 2, confidence: 0.9, current: 1, expected: 2, error: false };

describe('KioskProgress live line', () => {
  it('shows the step being detected and the one that follows', () => {
    render(<KioskProgress detected={{ ...base, step: 'Paso1_Palmas' }} />);
    expect(screen.getByText(/Detectando: Paso 1 · Palmas \(90 %\)/)).toBeTruthy();
    expect(screen.getByText('Sigue: Paso 2 · Dorsos')).toBeTruthy();
  });
  it('warns when a step is out of order and says the wash is complete after the sixth', () => {
    const { rerender } = render(<KioskProgress detected={{ ...base, step: 'Paso5_Pulgar', error: true, current: 0, expected: 1 }} />);
    expect(screen.getByText(/Paso incorrecto: hiciste el Paso 5/)).toBeTruthy();
    rerender(<KioskProgress detected={{ ...base, step: null, current: 6, expected: 0 }} />);
    expect(screen.getByText('Sigue: Lavado completo')).toBeTruthy();
  });
  it('shows nothing extra when the panel is not evaluating', () => {
    render(<KioskProgress evaluating={false} detected={{ ...base, step: 'Paso1_Palmas' }} />);
    expect(screen.queryByText(/Detectando/)).toBeNull();
  });
});

import { LiveStepLine, creditOf } from '@/components/KioskProgress';

describe('step meter', () => {
  it('turns what Java credits into a percentage of the minimum time', () => {
    expect(creditOf({ paso: 'PASO_1_PALMAS', tiempoAcreditadoMs: 2500, minimoRequeridoMs: 5000 }))
      .toEqual({ step: 1, percent: 50, seconds: 2.5, required: 5 });
    expect(creditOf({ paso: 'PASO_2_DORSOS', tiempoAcreditadoMs: 9000, minimoRequeridoMs: 5000 })?.percent).toBe(100);
    expect(creditOf(undefined)).toBeNull();
    expect(creditOf({ paso: 'FONDO', tiempoAcreditadoMs: 1, minimoRequeridoMs: 5000 })).toBeNull();
  });
  it('shows the percentage and the seconds next to the detected step', () => {
    render(<LiveStepLine detected={{ ...base, step: 'Paso1_Palmas' }} credit={{ step: 1, percent: 50, seconds: 2.5, required: 5 }} />);
    expect(screen.getByText('50 %')).toBeTruthy();
    expect(screen.getByText(/2\.5 \/ 5 s/)).toBeTruthy();
  });
});

import { KioskWashSummary } from '@/components/KioskWashSummary';
import type { FrictionEvaluation } from '@/types';

describe('step finished cue and verdict', () => {
  it('tells the person when a step is done and what comes next', () => {
    render(<LiveStepLine detected={{ ...base, step: 'Paso1_Palmas' }} credit={{ step: 1, percent: 100, seconds: 7, required: 7 }} />);
    expect(screen.getByText(/Paso 1 listo: ya puedes pasar al Paso 2 · Dorsos/)).toBeTruthy();
  });
  const finished = (verdict: 'CORRECTO' | 'RECHAZADO', score: number) => ({
    numeroIntento: 1, estadoIntento: 'COMPLETO_PARCIAL', secuenciaValidada: true, veredicto: verdict, puntajePct: score,
    ultimoResultado: { numeroIntento: 1, resultado: 'FRICTION_SEQUENCE_COMPLETE', motivo: null, pasos: [], puntajePct: score, veredicto: verdict },
    pasos: [{ paso: 'PASO_1_PALMAS', estado: 'VALIDADO', tiempoAcreditadoMs: 7000, minimoRequeridoMs: 7000, motivo: null, calidadPct: 93 }],
  }) as unknown as FrictionEvaluation;
  it('shows a correct wash with its average, and the quality of each step', () => {
    render(<KioskWashSummary evaluation={finished('CORRECTO', 91)} />);
    expect(screen.getByText('Lavado correcto')).toBeTruthy();
    expect(screen.getByText(/91 % de calidad promedio · mínimo 80 %/)).toBeTruthy();
    expect(screen.getByText(/93 % ·/)).toBeTruthy();
  });
  it('shows a rejected wash when the average is under the pass mark', () => {
    render(<KioskWashSummary evaluation={finished('RECHAZADO', 72)} />);
    expect(screen.getByText('Lavado rechazado')).toBeTruthy();
    expect(screen.getByText(/72 % de calidad promedio/)).toBeTruthy();
  });
});
