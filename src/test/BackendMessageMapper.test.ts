import { describe, expect, it } from 'vitest';
import { BackendMessageMapper } from '@/lib/BackendMessageMapper';

describe('BackendMessageMapper', () => {
  const mapper = new BackendMessageMapper(() => '2026-09-25T12:00:00.000Z');

  it('normalizes one valid state update and rejects untrusted values', () => {
    const parsed = mapper.parse(JSON.stringify({
      messageType: 'STATE_UPDATE',
      modoEvaluacion: 'FRICCION_PARCIAL',
      estadoActual: 'PASO_2_DORSOS',
      tiempoAcumuladoMs: 4200,
      manosVisibles: 7,
      tiempoConfirmacionIntencionMs: -20,
      umbralConfirmacionIntencionMs: '1200',
      claseCandidata: 'PASO_7_CIRCULARES',
      confianzaCandidata: 1.7,
      intentosReiniciados: 2,
      infraccion: { paso: 'PASO_2_DORSOS', detalle: 'Tiempo insuficiente' },
    }));

    expect(parsed.kind).toBe('state');
    if (parsed.kind !== 'state') throw new Error('Expected state message');
    expect(parsed.update).toMatchObject({
      currentStep: 'PASO_2_DORSOS',
      elapsedSeconds: 4,
      evaluationMode: 'FRICCION_PARCIAL',
      visibleHands: 2,
      intentionElapsedMs: 0,
      intentionThresholdMs: 1200,
      candidateStep: 'PASO_7_CIRCULARES',
      candidateConfidence: 1,
      retryCount: 2,
      infraction: {
        type: 'INFRACTION',
        step: 'PASO_2_DORSOS',
        motivo: 'Tiempo insuficiente',
        timestamp: '2026-09-25T12:00:00.000Z',
      },
    });
  });

  it('does not allow unknown model classes to advance the dashboard step', () => {
    const parsed = mapper.parse(JSON.stringify({
      messageType: 'STATE_UPDATE', estadoActual: 'PASO_INVENTADO', claseCandidata: 'NO_EXISTE',
    }));
    expect(parsed.kind).toBe('state');
    if (parsed.kind === 'state') {
      expect(parsed.update.currentStep).toBeNull();
      expect(parsed.update.candidateStep).toBe('');
    }
  });

  it('preserves the non-clinical six-movement completion signal from Java', () => {
    const parsed = mapper.parse(JSON.stringify({
      messageType: 'STATE_UPDATE',
      modoEvaluacion: 'FRICCION_PARCIAL',
      estadoActual: 'PASO_6_PUNTA_DE_DEDOS',
      secuenciaFriccionObservadaCompleta: true,
      procedimientoCompletoValidado: false,
    }));

    expect(parsed.kind).toBe('state');
    if (parsed.kind === 'state') {
      expect(parsed.update.frictionSequenceObservedComplete).toBe(true);
    }
  });

  it('maps canonical OMS current and candidate actions into the dashboard steps', () => {
    const parsed = mapper.parse(JSON.stringify({
      messageType: 'STATE_UPDATE',
      modoEvaluacion: 'PROTOCOLO_OMS',
      estadoActual: 'OMS_01_MOJAR_MANOS',
      claseCandidata: 'OMS_02_APLICAR_JABON',
      confianzaCandidata: 0.84,
    }));

    expect(parsed.kind).toBe('state');
    if (parsed.kind === 'state') {
      expect(parsed.update.currentStep).toBe('OMS_01_MOJAR_MANOS');
      expect(parsed.update.candidateStep).toBe('OMS_02_APLICAR_JABON');
      expect(parsed.update.candidateConfidence).toBe(0.84);
    }
  });

  it('ignores unknown event types and maps session summaries', () => {
    expect(mapper.parse('{"messageType":"HEARTBEAT"}')).toEqual({ kind: 'ignored' });
    const parsed = mapper.parse(JSON.stringify({
      messageType: 'SESSION_SUMMARY',
      estadoSesion: 'COMPLETADA',
      tiempoTotalSegundos: 60,
      tiempoPorPaso: { PASO_1_PALMAS: 8, INVALIDO: 'bad' },
      infracciones: [{ paso: 'PASO_1_PALMAS', detalle: 'Fallo' }],
      infraccionesIntentoFinal: [{ paso: 'PASO_6_PUNTA_DE_DEDOS', detalle: 'Tiempo insuficiente' }],
      coberturaJabon: { PALMA_DERECHA: 'ESPUMA_VISIBLE', BAD: 'UNKNOWN' },
      aprobado: false,
    }));
    expect(parsed.kind).toBe('summary');
    if (parsed.kind === 'summary') {
      expect(parsed.summary.estadoSesion).toBe('COMPLETADA');
      expect(parsed.summary.tiempoPorPaso).toEqual({ PASO_1_PALMAS: 8 });
      expect(parsed.summary.infracciones).toHaveLength(1);
      expect(parsed.summary.infraccionesIntentoFinal?.[0].step).toBe('PASO_6_PUNTA_DE_DEDOS');
      expect(parsed.summary.coberturaJabon).toEqual({ PALMA_DERECHA: 'ESPUMA_VISIBLE' });
    }
  });

  it('fails closed on string and numeric values for safety booleans', () => {
    const parsed = mapper.parse(JSON.stringify({
      messageType: 'SESSION_SUMMARY',
      aprobado: 'false',
      procedimientoCompletoValidado: 'true',
      intentoFinalSinInfracciones: 1,
      coberturaJabonCompleta: 'true',
    }));

    expect(parsed.kind).toBe('summary');
    if (parsed.kind === 'summary') {
      expect(parsed.summary).toMatchObject({
        aprobado: false,
        procedimientoCompletoValidado: false,
        intentoFinalSinInfracciones: false,
        coberturaJabonCompleta: false,
      });
    }
  });

  it('does not mark live soap coverage complete for a non-boolean payload', () => {
    const parsed = mapper.parse(JSON.stringify({
      messageType: 'STATE_UPDATE',
      coberturaJabonCompleta: 'false',
    }));

    expect(parsed.kind).toBe('state');
    if (parsed.kind === 'state') expect(parsed.update.soapCoverageComplete).toBe(false);
  });
});
