import { describe, it, expect, beforeEach } from 'vitest'
import { useConnectionStore } from '../stores/connectionStore'

describe('Connection Store', () => {
  beforeEach(() => {
    useConnectionStore.setState({
      status: 'disconnected',
      reconnectAttempts: 0,
    })
  })

  it('sets status', () => {
    useConnectionStore.getState().setStatus('connected')
    expect(useConnectionStore.getState().status).toBe('connected')
  })

  it('increments reconnect attempts', () => {
    useConnectionStore.getState().incrementReconnectAttempts()
    useConnectionStore.getState().incrementReconnectAttempts()
    expect(useConnectionStore.getState().reconnectAttempts).toBe(2)
  })

  it('resets reconnect attempts', () => {
    useConnectionStore.getState().incrementReconnectAttempts()
    useConnectionStore.getState().incrementReconnectAttempts()
    useConnectionStore.getState().resetReconnectAttempts()
    expect(useConnectionStore.getState().reconnectAttempts).toBe(0)
  })
})
