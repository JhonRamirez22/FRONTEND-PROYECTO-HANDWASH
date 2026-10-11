import { describe, it, expect, beforeEach } from 'vitest'
import { useSessionStore } from '../stores/sessionStore'

describe('Session Store', () => {
  beforeEach(() => {
    useSessionStore.setState({
      sessionId: null,
      protocolo: null,
      isActive: false,
      currentStep: '',
      previousStep: '',
      elapsedSeconds: 0,
      infractions: [],
      summary: null,
    })
  })

  it('starts a session', () => {
    useSessionStore.getState().startSession('test-123', 'CLINICO_QUIRURGICO')
    const state = useSessionStore.getState()
    expect(state.sessionId).toBe('test-123')
    expect(state.protocolo).toBe('CLINICO_QUIRURGICO')
    expect(state.isActive).toBe(true)
  })

  it('ends a session', () => {
    useSessionStore.getState().startSession('test-123', 'CLINICO_QUIRURGICO')
    useSessionStore.getState().addInfraction({
      type: 'INFRACTION',
      step: 'PASO_1_PALMAS',
      motivo: 'Tiempo insuficiente',
      timestamp: '2024-01-01T12:00:00Z',
    })
    useSessionStore.getState().setLastRetryError('Tiempo insuficiente')
    useSessionStore.getState().endSession()
    const state = useSessionStore.getState()
    expect(state.isActive).toBe(false)
    expect(state.sessionId).toBeNull()
    expect(state.infractions).toEqual([])
    expect(state.ultimoErrorReinicio).toBeNull()
  })

  it('keeps the final summary but releases the session token on completion', () => {
    useSessionStore.getState().startSession('test-123', 'DOMESTICO', 'secret-token')
    const summary = {
      type: 'SESSION_SUMMARY' as const,
      tiempoTotalSegundos: 40,
      tiempoPorPaso: {},
      confianzaPromedio: 0.8,
      infracciones: [],
      aprobado: false,
      resultado: 'SECUENCIA_COMPLETADA_SIN_VALIDAR_PROCEDIMIENTO_COMPLETO',
    }

    useSessionStore.getState().finishSession(summary)

    const state = useSessionStore.getState()
    expect(state.isActive).toBe(false)
    expect(state.sessionId).toBeNull()
    expect(state.accessToken).toBeNull()
    expect(state.summary).toEqual(summary)
  })

  it('sets current step', () => {
    useSessionStore.getState().startSession('test-123', 'CLINICO_QUIRURGICO')
    useSessionStore.getState().setCurrentStep('PASO_1_PALMAS')
    expect(useSessionStore.getState().currentStep).toBe('PASO_1_PALMAS')
  })

  it('adds infraction to cumulative list', () => {
    useSessionStore.getState().addInfraction({
      type: 'INFRACTION',
      step: 'PASO_1_PALMAS',
      motivo: 'Tiempo insuficiente',
      timestamp: '2024-01-01T12:00:00Z',
    })
    useSessionStore.getState().addInfraction({
      type: 'INFRACTION',
      step: 'PASO_2_DORSOS',
      motivo: 'No detectado',
      timestamp: '2024-01-01T12:01:00Z',
    })
    expect(useSessionStore.getState().infractions).toHaveLength(2)
  })
})
