import { render, screen } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { SessionSummary } from '../components/SessionSummary'
import { useSessionStore } from '../stores/sessionStore'
import type { DeploymentStatus } from '../lib/DeploymentStatusService'

const nonClinicalStatus: DeploymentStatus = {
  mode: 'DEVELOPMENT',
  clinicalDecisionAllowed: false,
  notice: 'Entorno de desarrollo: no usar para decisiones clínicas.',
}

const authorizedStatus: DeploymentStatus = {
  mode: 'HOSPITAL_PILOT',
  clinicalDecisionAllowed: true,
  notice: 'Release autorizado.',
}

const renderSummary = (deploymentStatus = nonClinicalStatus) =>
  render(<SessionSummary deploymentStatus={deploymentStatus} />)

describe('SessionSummary', () => {
  beforeEach(() => {
    useSessionStore.setState({
      summary: null,
    })
  })

  it('renders nothing when no summary', () => {
    const { container } = renderSummary()
    expect(container.firstChild).toBeNull()
  })

  it('renders approved session summary', () => {
    useSessionStore.setState({
      summary: {
        type: 'SESSION_SUMMARY',
        tiempoTotalSegundos: 120,
        tiempoPorPaso: {
          PASO_1_PALMAS: 20,
          PASO_2_DORSOS: 15,
          PASO_3_INTERDIGITALES: 18,
          PASO_4_NUDILLOS: 15,
          PASO_5_PULGAR: 18,
          PASO_6_PUNTA_DE_DEDOS: 17,
          PASO_7_CIRCULARES: 17,
        },
        confianzaPromedio: 0.85,
        infracciones: [],
        aprobado: true,
        procedimientoCompletoValidado: true,
      },
    })
    renderSummary(authorizedStatus)
    expect(screen.getByText('Sesión aprobada')).toBeInTheDocument()
    expect(screen.getByText('2m 0s')).toBeInTheDocument()
    expect(screen.getByText('85%')).toBeInTheDocument()
    expect(screen.getByText('Score promedio de confianza recibida')).toBeInTheDocument()
    expect(screen.getByText(/no equivale a precisión del paso ni a calidad clínica/i)).toBeInTheDocument()
  })

  it('renders rejected session summary', () => {
    useSessionStore.setState({
      summary: {
        type: 'SESSION_SUMMARY',
        tiempoTotalSegundos: 60,
        tiempoPorPaso: {
          PASO_1_PALMAS: 10,
          PASO_2_DORSOS: 10,
          PASO_3_INTERDIGITALES: 10,
          PASO_4_NUDILLOS: 10,
          PASO_5_PULGAR: 10,
          PASO_6_PUNTA_DE_DEDOS: 5,
          PASO_7_CIRCULARES: 5,
        },
        confianzaPromedio: 0.45,
        infracciones: [
          {
            type: 'INFRACTION',
            step: 'PASO_6_PUNTA_DE_DEDOS',
            motivo: 'Tiempo insuficiente',
            timestamp: '2024-01-01T12:00:00Z',
          },
        ],
        aprobado: false,
      },
    })
    renderSummary()
    expect(screen.getByText('Sesión incompleta')).toBeInTheDocument()
    expect(screen.getByText('45%')).toBeInTheDocument()
    expect(screen.getByText('Infracciones (1)')).toBeInTheDocument()
  })

  it('never displays approval when the complete procedure is not verified', () => {
    useSessionStore.setState({
      summary: {
        type: 'SESSION_SUMMARY',
        tiempoTotalSegundos: 40,
        tiempoPorPaso: {},
        confianzaPromedio: 0.9,
        infracciones: [],
        aprobado: true,
        procedimientoCompletoValidado: false,
        resultado: 'SECUENCIA_COMPLETADA_SIN_VALIDAR_PROCEDIMIENTO_COMPLETO',
        accionesNoDetectadas: ['APLICAR_JABON'],
      },
    })
    renderSummary()
    expect(screen.getByText('Secuencia completada')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Secuencia parcial completada' })).toBeInTheDocument()
    expect(screen.queryByText('Sesión aprobada')).not.toBeInTheDocument()
  })

  it('shows soap-region evidence in the OMS result without implying chemical efficacy', () => {
    useSessionStore.setState({
      summary: {
        type: 'SESSION_SUMMARY',
        tiempoTotalSegundos: 41,
        tiempoPorPaso: { OMS_01_MOJAR_MANOS: 3, OMS_03_FROTAR_PALMAS: 8 },
        confianzaPromedio: 0.8,
        infracciones: [],
        aprobado: false,
        procedimientoCompletoValidado: false,
        modoEvaluacion: 'PROTOCOLO_OMS',
        coberturaJabon: { PALMA_IZQUIERDA: 'ESPUMA_VISIBLE' },
        coberturaJabonCompleta: false,
        duracionMinimaObjetivoMs: 60_000,
        resultado: 'SECUENCIA_OMS_COMPLETADA_SIN_VALIDAR_MODELO_Y_EVIDENCIA',
        accionesNoDetectadas: ['MODELO_OMS_NO_VALIDADO'],
      },
    })
    renderSummary()
    expect(screen.getByText('Secuencia completada')).toBeInTheDocument()
    expect(screen.getByText('Mojar ambas manos')).toBeInTheDocument()
    expect(screen.getByText('Frotar palma con palma')).toBeInTheDocument()
    expect(screen.getByText('Predicción visual de espuma')).toBeInTheDocument()
    expect(screen.getByText('Predicción parcial')).toBeInTheDocument()
    expect(screen.getByText('Palma izquierda')).toBeInTheDocument()
    expect(screen.getByText('Objetivo mínimo observado: 60 s.')).toBeInTheDocument()
    expect(screen.getByText(/validar independientemente el modelo y la evidencia/i)).toBeInTheDocument()
    expect(screen.getByText(/autorización clínica firmada/i)).toBeInTheDocument()
    expect(screen.getByText(/esta secuencia no certifica .* eliminación de microorganismos/i)).toBeInTheDocument()
    expect(screen.getByText(/salida visual del modelo aún no validado/i)).toBeInTheDocument()
    expect(screen.getByText(/no demuestra presencia química de jabón/i)).toBeInTheDocument()
    expect(screen.queryByText('Sesión aprobada')).not.toBeInTheDocument()
  })

  it('downgrades a backend approval when the deployment is not clinically authorized', () => {
    useSessionStore.setState({
      summary: {
        type: 'SESSION_SUMMARY',
        estadoSesion: 'COMPLETADA',
        tiempoTotalSegundos: 60,
        tiempoPorPaso: {},
        confianzaPromedio: 0.95,
        infracciones: [],
        aprobado: true,
        procedimientoCompletoValidado: true,
        resultado: 'APROBADO',
      },
    })

    renderSummary(nonClinicalStatus)

    expect(screen.getByText('Secuencia completada')).toBeInTheDocument()
    expect(screen.getByText('Resultado informativo; no es una aprobación clínica')).toBeInTheDocument()
    expect(screen.queryByText('Sesión aprobada')).not.toBeInTheDocument()
  })
})
