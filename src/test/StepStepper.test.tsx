import { render, screen } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { StepStepper } from '../components/StepStepper'
import { useSessionStore } from '../stores/sessionStore'
import type { DeploymentStatus } from '../lib/DeploymentStatusService'

const nonClinicalStatus: DeploymentStatus = {
  mode: 'DEVELOPMENT',
  clinicalDecisionAllowed: false,
  notice: 'Entorno de desarrollo: no usar para decisiones clínicas.',
}

const renderStepper = () => render(<StepStepper deploymentStatus={nonClinicalStatus} />)

describe('StepStepper', () => {
  beforeEach(() => {
    useSessionStore.setState({
      isActive: false,
      currentStep: '',
      previousStep: '',
      elapsedSeconds: 0,
      infractions: [],
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
      summary: null,
    })
  })

  it('renders the six supported friction movements without presenting them as the full WHO protocol', () => {
    renderStepper()
    expect(screen.getByText('Movimientos de fricción')).toBeInTheDocument()
    expect(screen.getByText('Palmas')).toBeInTheDocument()
    expect(screen.getByText('Dorsos')).toBeInTheDocument()
    expect(screen.getByText('Interdigitales')).toBeInTheDocument()
    expect(screen.getByText('Nudillos')).toBeInTheDocument()
    expect(screen.getByText('Pulgar')).toBeInTheDocument()
    expect(screen.getByText('Punta de dedos')).toBeInTheDocument()
    expect(screen.queryByText('Circulares')).not.toBeInTheDocument()
    expect(screen.getByText(/no verifica el procedimiento completo de la OMS/i)).toBeInTheDocument()
  })

  it('shows inactive message when session is not active', () => {
    renderStepper()
    expect(screen.getByText('Inicie una sesion para ver el progreso')).toBeInTheDocument()
  })

  it('shows an informational sequence without marking its steps clinically completed', () => {
    useSessionStore.setState({
      isActive: false,
      summary: {
        type: 'SESSION_SUMMARY',
        tiempoTotalSegundos: 40,
        tiempoPorPaso: {},
        confianzaPromedio: 0.9,
        infracciones: [],
        aprobado: false,
        procedimientoCompletoValidado: false,
        resultado: 'SECUENCIA_COMPLETADA_SIN_VALIDAR_PROCEDIMIENTO_COMPLETO',
      },
    })
    renderStepper()
    expect(screen.queryByText('Inicie una sesion para ver el progreso')).not.toBeInTheDocument()
    expect(screen.getAllByRole('img', { name: /progreso informativo, sin aprobación clínica/ })).toHaveLength(6)
    expect(screen.queryByRole('img', { name: /clínicamente validado/ })).not.toBeInTheDocument()
  })

  it('shows final-attempt violations instead of marking every movement complete', () => {
    useSessionStore.setState({
      isActive: false,
      summary: {
        type: 'SESSION_SUMMARY',
        tiempoTotalSegundos: 60,
        tiempoPorPaso: {},
        confianzaPromedio: 0.8,
        infracciones: [
          { type: 'INFRACTION', step: 'PASO_1_PALMAS', motivo: 'Intento anterior', timestamp: 't1' },
          { type: 'INFRACTION', step: 'PASO_6_PUNTA_DE_DEDOS', motivo: 'Tiempo insuficiente', timestamp: 't2' },
        ],
        infraccionesIntentoFinal: [
          { type: 'INFRACTION', step: 'PASO_6_PUNTA_DE_DEDOS', motivo: 'Tiempo insuficiente', timestamp: 't2' },
        ],
        aprobado: false,
        resultado: 'SECUENCIA_COMPLETADA_CON_INFRACCIONES',
      },
    })

    renderStepper()

    expect(screen.getByRole('img', { name: /Palmas: registrado como progreso informativo/ })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Punta de dedos: con infracción' })).toBeInTheDocument()
    expect(screen.getAllByRole('img', { name: /progreso informativo, sin aprobación clínica/ })).toHaveLength(5)
  })

  it('downgrades a backend approval to informational progress in a non-clinical deployment', () => {
    useSessionStore.setState({
      isActive: false,
      summary: {
        type: 'SESSION_SUMMARY',
        tiempoTotalSegundos: 60,
        tiempoPorPaso: {},
        confianzaPromedio: 0.95,
        infracciones: [],
        aprobado: true,
        procedimientoCompletoValidado: true,
        resultado: 'APROBADO',
      },
    })

    renderStepper()

    expect(screen.getAllByRole('img', { name: /progreso informativo, sin aprobación clínica/ })).toHaveLength(6)
    expect(screen.queryByRole('img', { name: /clínicamente validado/ })).not.toBeInTheDocument()
  })

  it('shows elapsed time when session is active', () => {
    useSessionStore.setState({
      isActive: true,
      elapsedSeconds: 125,
    })
    renderStepper()
    expect(screen.getByText('02:05')).toBeInTheDocument()
  })

  it('shows an OMS phase candidate without presenting it as an accepted step', () => {
    useSessionStore.setState({
      isActive: true,
      currentStep: 'OMS_01_MOJAR_MANOS',
      modoEvaluacion: 'PROTOCOLO_OMS',
      claseCandidata: 'OMS_02_APLICAR_JABON',
      confianzaCandidata: 0.84,
    })

    renderStepper()

    expect(screen.getByText('Movimiento candidato, sin confirmar: Aplicar jabón.')).toBeInTheDocument()
    expect(screen.getByText(
      'El paso avanza cuando otra observación reciente coincide; este candidato aún no cuenta como completado.',
    )).toBeInTheDocument()
    expect(screen.getByText('Confianza: 84 %.')).toBeInTheDocument()
    expect(useSessionStore.getState().currentStep).toBe('OMS_01_MOJAR_MANOS')
  })

  it('shows why an intention candidate was rejected and which movement YOLO saw', () => {
    useSessionStore.setState({
      isActive: true,
      modoEvaluacion: 'FRICCION_PARCIAL',
      estadoIntencion: 'MANOS_PRESENTES',
      motivoIntencion: 'ENCUADRE_INCOMPLETO',
      manosVisiblesIntencion: 1,
      tiempoConfirmacionIntencionMs: 0,
      umbralConfirmacionIntencionMs: 1200,
      claseCandidata: 'PASO_1_PALMAS',
      confianzaCandidata: 0.82,
    })
    renderStepper()
    expect(screen.getByText('Intención: Manos visibles; confirma la fricción inicial de palmas.')).toBeInTheDocument()
    expect(screen.getByText('Motivo: Se necesita evidencia reciente de ambas manos en el encuadre.')).toBeInTheDocument()
    expect(screen.getByText('YOLO local (último sondeo): sin dato')).toBeInTheDocument()
    expect(screen.getByText('Evidencia recibida por Java: 1/2')).toBeInTheDocument()
    expect(screen.getByText('Confirmación: 0/1200 ms')).toBeInTheDocument()
    expect(screen.getByText('Candidato: Palmas (82 %)')).toBeInTheDocument()
  })

  it('marks a six-movement friction sequence as informational, never as a completed OMS wash', () => {
    useSessionStore.setState({
      isActive: true,
      modoEvaluacion: 'FRICCION_PARCIAL',
      currentStep: 'PASO_6_PUNTA_DE_DEDOS',
      secuenciaFriccionObservadaCompleta: true,
    })

    renderStepper()

    expect(screen.getByText(/se observaron los seis movimientos de fricción/i)).toBeInTheDocument()
    expect(screen.getByRole('img', {
      name: /Punta de dedos: registrado como progreso informativo, sin aprobación clínica/i,
    })).toBeInTheDocument()
    expect(screen.queryByText('Circulares')).not.toBeInTheDocument()
  })

  it('distinguishes two hands seen locally by YOLO from missing Java evidence', () => {
    useSessionStore.setState({
      isActive: true,
      modoEvaluacion: 'FRICCION_PARCIAL',
      cameraHandsVisible: 2,
      estadoIntencion: 'MANOS_PRESENTES',
      manosVisiblesIntencion: 0,
    })

    renderStepper()

    expect(screen.getByText('YOLO local (último sondeo): 2/2')).toBeInTheDocument()
    expect(screen.getByText('Evidencia recibida por Java: 0/2')).toBeInTheDocument()
  })

  it('translates the current spatial-evidence rejection without asking for stronger rubbing', () => {
    useSessionStore.setState({
      isActive: true,
      modoEvaluacion: 'FRICCION_PARCIAL',
      estadoIntencion: 'INTENCION_CANDIDATA',
      motivoIntencion: 'EVIDENCIA_ESPACIAL_NO_VERIFICABLE',
      manosVisiblesIntencion: 2,
      tiempoConfirmacionIntencionMs: 0,
      umbralConfirmacionIntencionMs: 650,
    })

    renderStepper()

    expect(screen.getByText('Intención: Confirmando la detección sostenida de palmas.')).toBeInTheDocument()
    expect(screen.getByText(
      'Motivo: No se pudo verificar la posición relativa de ambas manos; mantenlas visibles y espera otra observación.',
    )).toBeInTheDocument()
    expect(screen.queryByText(/aumenta la fricción/i)).not.toBeInTheDocument()
  })

  it('asks for palm friction when hands are visible but the initial movement is zero', () => {
    useSessionStore.setState({
      isActive: true,
      modoEvaluacion: 'FRICCION_PARCIAL',
      estadoIntencion: 'MANOS_PRESENTES',
      motivoIntencion: 'MOVIMIENTO_INICIAL_NO_DETECTADO',
      manosVisiblesIntencion: 2,
      tiempoConfirmacionIntencionMs: 0,
      umbralConfirmacionIntencionMs: 650,
    })

    renderStepper()

    expect(screen.getByText(
      'Motivo: Las manos están visibles, pero no se detecta fricción inicial; frota palma con palma frente a la cámara.',
    )).toBeInTheDocument()
  })

  it('explains when an active step has no measurable movement', () => {
    useSessionStore.setState({
      isActive: true,
      modoEvaluacion: 'FRICCION_PARCIAL',
      estadoIntencion: 'PAUSA',
      motivoIntencion: 'MOVIMIENTO_ACTIVO_NO_DETECTADO',
      manosVisiblesIntencion: 2,
      tiempoConfirmacionIntencionMs: 0,
      umbralConfirmacionIntencionMs: 650,
    })

    renderStepper()

    expect(screen.getByText(
      'Motivo: No se detectó movimiento en este paso; vuelve a frotar las manos y mantén ambas dentro del encuadre.',
    )).toBeInTheDocument()
  })

  it('does not present sustained palms classification as verified physical rubbing', () => {
    useSessionStore.setState({
      isActive: true,
      modoEvaluacion: 'FRICCION_PARCIAL',
      estadoIntencion: 'LAVADO_PROBABLE',
      motivoIntencion: 'Palmas reconocidas de forma sostenida; inicia la evaluación',
      manosVisiblesIntencion: 2,
      tiempoConfirmacionIntencionMs: 650,
      umbralConfirmacionIntencionMs: 650,
    })

    renderStepper()

    expect(screen.getByText(
      'Intención: La clase visual sugiere fricción; el movimiento real no está verificado.',
    )).toBeInTheDocument()
    expect(screen.getByText(
      'Motivo: La detección sostenida de palmas inicia la evaluación; no verifica la fricción real.',
    )).toBeInTheDocument()
    expect(screen.queryByText('Fricción inicial confirmada.')).not.toBeInTheDocument()
  })

  it('renders the complete OMS sequence and all 12 soap regions when the detector selects OMS mode', () => {
    useSessionStore.setState({
      isActive: true,
      modoEvaluacion: 'PROTOCOLO_OMS',
      coberturaJabon: { PALMA_IZQUIERDA: 'ESPUMA_VISIBLE' },
    })
    renderStepper()
    expect(screen.getByText('Lavado OMS: agua y jabón')).toBeInTheDocument()
    expect(screen.getByText('Mojar ambas manos')).toBeInTheDocument()
    expect(screen.getByText('Cerrar grifo con la toalla')).toBeInTheDocument()
    expect(screen.getByText('Predicción visual de espuma por región')).toBeInTheDocument()
    expect(screen.getByText('Predicción en 1/12 regiones')).toBeInTheDocument()
    expect(screen.queryByText(/confirmadas/i)).not.toBeInTheDocument()
    expect(screen.getByText('Predice espuma')).toBeInTheDocument()
    expect(screen.getByText('Palma izquierda')).toBeInTheDocument()
    expect(screen.getByText(/no certifica esterilidad/i)).toBeInTheDocument()
  })

  it('keeps the cached retry reason visible while the user begins again', () => {
    useSessionStore.setState({
      isActive: true,
      modoEvaluacion: 'PROTOCOLO_OMS',
      currentStep: 'OMS_01_MOJAR_MANOS',
      intentosReiniciados: 1,
      ultimoErrorReinicio: 'No se confirmó espuma en ambas palmas.',
    })
    renderStepper()
    expect(screen.getByText('No se confirmó espuma en ambas palmas.')).toBeInTheDocument()
    expect(screen.getByText('Empieza otra vez por Mojar las manos.')).toBeInTheDocument()
  })
})
