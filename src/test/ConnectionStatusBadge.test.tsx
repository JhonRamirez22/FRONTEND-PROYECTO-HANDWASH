import { render, screen } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { ConnectionStatusBadge } from '../components/ConnectionStatusBadge'
import { useConnectionStore } from '../stores/connectionStore'

describe('ConnectionStatusBadge', () => {
  beforeEach(() => {
    useConnectionStore.setState({
      status: 'disconnected',
      reconnectAttempts: 0,
    })
  })

  it('renders disconnected status by default', () => {
    render(<ConnectionStatusBadge />)
    expect(screen.getByText('Desconectado')).toBeInTheDocument()
  })

  it('renders connected status', () => {
    useConnectionStore.setState({ status: 'connected' })
    render(<ConnectionStatusBadge />)
    expect(screen.getByText('Conectado')).toBeInTheDocument()
  })

  it('renders reconnecting status with attempt count', () => {
    useConnectionStore.setState({
      status: 'reconnecting',
      reconnectAttempts: 3,
    })
    render(<ConnectionStatusBadge />)
    expect(screen.getByText('Reconectando')).toBeInTheDocument()
    expect(screen.getByText('(3)')).toBeInTheDocument()
  })
})
