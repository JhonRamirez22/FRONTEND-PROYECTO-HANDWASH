import { act, render, renderHook, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useWebSocket } from '../hooks/useWebSocket'
import { useSessionStore } from '../stores/sessionStore'
import { StepStepper } from '../components/StepStepper'
import { DeploymentStatusService } from '../lib/DeploymentStatusService'

class TestWebSocket {
  static CLOSING = 2
  static instances: TestWebSocket[] = []
  readyState = 0
  onopen: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null

  constructor(readonly url: string) {
    TestWebSocket.instances.push(this)
  }

  close() { this.readyState = 3 }
  send() {}
}

describe('useWebSocket detection diagnostics', () => {
  beforeEach(() => {
    TestWebSocket.instances = []
    vi.stubGlobal('WebSocket', TestWebSocket as unknown as typeof WebSocket)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ ticket: 'diagnostics-ticket-12345678901234567890' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )))
    useSessionStore.getState().startSession('session-1', 'DOMESTICO', 'token')
  })

  it('routes Java intention rejection and YOLO candidate into the live session state', async () => {
    const { result, unmount } = renderHook(() => useWebSocket())
    act(() => result.current.connect('session-1', 'token'))
    await waitFor(() => expect(TestWebSocket.instances).toHaveLength(1))
    const socket = TestWebSocket.instances[0]
    let sessionStoreNotifications = 0
    const unsubscribe = useSessionStore.subscribe(() => { sessionStoreNotifications += 1 })

    act(() => socket.onmessage?.({ data: JSON.stringify({
      messageType: 'STATE_UPDATE',
      modoEvaluacion: 'FRICCION_PARCIAL',
      estadoActual: null,
      estadoSesion: 'ESPERANDO_INICIO',
      estadoIntencion: 'MANOS_PRESENTES',
      motivoIntencion: 'ENCUADRE_INCOMPLETO',
      manosVisibles: 1,
      tiempoConfirmacionIntencionMs: 400,
      umbralConfirmacionIntencionMs: 1200,
      claseCandidata: 'PASO_1_PALMAS',
      confianzaCandidata: 0.83,
      infraccion: {
        paso: 'PASO_1_PALMAS', detalle: 'Repetir', timestamp: '2026-09-25T12:00:00.000Z',
      },
    }) } as MessageEvent))

    act(() => socket.onmessage?.({ data: JSON.stringify({
      messageType: 'STATE_UPDATE',
      modoEvaluacion: 'FRICCION_PARCIAL',
      estadoActual: null,
      estadoSesion: 'ESPERANDO_INICIO',
      estadoIntencion: 'MANOS_PRESENTES',
      motivoIntencion: 'ENCUADRE_INCOMPLETO',
      manosVisibles: 1,
      tiempoConfirmacionIntencionMs: 400,
      umbralConfirmacionIntencionMs: 1200,
      claseCandidata: 'PASO_1_PALMAS',
      confianzaCandidata: 0.83,
      infraccion: {
        paso: 'PASO_1_PALMAS', detalle: 'Repetir', timestamp: '2026-09-25T12:00:00.000Z',
      },
    }) } as MessageEvent))

    const state = useSessionStore.getState()
    expect(state.currentStep).toBe('')
    expect(state.estadoIntencion).toBe('MANOS_PRESENTES')
    expect(state.motivoIntencion).toBe('ENCUADRE_INCOMPLETO')
    expect(state.manosVisiblesIntencion).toBe(1)
    expect(state.tiempoConfirmacionIntencionMs).toBe(400)
    expect(state.umbralConfirmacionIntencionMs).toBe(1200)
    expect(state.claseCandidata).toBe('PASO_1_PALMAS')
    expect(state.confianzaCandidata).toBe(0.83)
    expect(state.infractions).toHaveLength(1)
    expect(sessionStoreNotifications).toBe(2)

    unsubscribe()
    unmount()
  })

  it('routes a confirmed Java step and elapsed time into the visible Stepper', async () => {
    const { result, unmount } = renderHook(() => useWebSocket())
    act(() => result.current.connect('session-1', 'token'))
    await waitFor(() => expect(TestWebSocket.instances).toHaveLength(1))
    const socket = TestWebSocket.instances[0]

    act(() => socket.onmessage?.({ data: JSON.stringify({
      messageType: 'STATE_UPDATE',
      sessionId: 'session-1',
      modoEvaluacion: 'FRICCION_PARCIAL',
      estadoActual: 'PASO_2_DORSOS',
      tiempoAcumuladoMs: 4200,
      estadoIntencion: 'FRICCION_CONFIRMADA',
      motivoIntencion: 'Gesto y movimiento compatibles con fricción',
      manosVisibles: 2,
    }) } as MessageEvent))

    expect(useSessionStore.getState().currentStep).toBe('PASO_2_DORSOS')
    expect(useSessionStore.getState().elapsedSeconds).toBe(4)
    render(<StepStepper deploymentStatus={DeploymentStatusService.unverified()} />)
    expect(screen.getByRole('img', { name: 'Dorsos: en curso' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /Palmas: registrado como progreso informativo/ })).toBeInTheDocument()

    unmount()
  })
})
