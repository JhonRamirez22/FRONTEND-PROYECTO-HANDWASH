import { render, screen } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { InfractionsLog } from '../components/InfractionsLog'
import { useSessionStore } from '../stores/sessionStore'

describe('InfractionsLog', () => {
  beforeEach(() => {
    useSessionStore.setState({
      isActive: false,
      infractions: [],
      summary: null,
    })
  })

  it('renders empty state when no infractions', () => {
    render(<InfractionsLog />)
    expect(screen.getByText('Infracciones')).toBeInTheDocument()
    expect(screen.getByText('Inicie una sesión para ver infracciones')).toBeInTheDocument()
  })

  it('shows inactive message when session is not active', () => {
    render(<InfractionsLog />)
    expect(screen.getByText('Inicie una sesión para ver infracciones')).toBeInTheDocument()
  })

  it('does not ask to start again after a clean completed session', () => {
    useSessionStore.setState({
      summary: {
        type: 'SESSION_SUMMARY', tiempoTotalSegundos: 40,
        tiempoPorPaso: {}, confianzaPromedio: 0.9,
        infracciones: [], aprobado: false,
      },
    })
    render(<InfractionsLog />)
    expect(screen.getByText('Sin infracciones en la sesión finalizada')).toBeInTheDocument()
  })

  it('renders infractions list', () => {
    useSessionStore.setState({
      isActive: true,
      infractions: [
        {
          type: 'INFRACTION',
          step: 'PASO_1_PALMAS',
          motivo: 'Tiempo insuficiente',
          timestamp: '2024-01-01T12:00:00Z',
        },
        {
          type: 'INFRACTION',
          step: 'PASO_2_DORSOS',
          motivo: 'No detectado',
          timestamp: '2024-01-01T12:01:00Z',
        },
      ],
    })
    render(<InfractionsLog />)
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('Palmas')).toBeInTheDocument()
    expect(screen.getByText('Dorsos')).toBeInTheDocument()
    expect(screen.getByText('Tiempo insuficiente')).toBeInTheDocument()
    expect(screen.getByText('No detectado')).toBeInTheDocument()
  })
})
