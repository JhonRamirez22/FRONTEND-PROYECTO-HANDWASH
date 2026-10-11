import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LiveCameraFeed } from '../components/LiveCameraFeed'
import { useSessionStore } from '../stores/sessionStore'

const connect = vi.fn();
vi.mock('../hooks/useWebSocket', () => ({
  useWebSocket: () => ({ connect, disconnect: vi.fn() }),
}));

describe('LiveCameraFeed session binding', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  beforeEach(() => {
    connect.mockClear();
    useSessionStore.getState().endSession()
  })

  it('does not display an unpaired camera stream when no dashboard session is active', () => {
    render(<LiveCameraFeed />)

    expect(screen.getByText('Enlaza el iPhone para comenzar')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enlazar iPhone' })).toBeEnabled()
    expect(screen.queryByRole('img', {
      name: 'Video en vivo de las manos con las detecciones del modelo YOLO superpuestas',
    })).not.toBeInTheDocument()
  })

  it('links the current camera through authenticated Java without sending token in URL', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url) => ({
      ok: true, status: 200,
      json: async () => String(url).includes('/camera/link')
        ? { status: 'connected', message: 'iPhone enlazado' }
        : { camera: 'connected', sessionId: 'camera-session-1' },
    }));
    vi.stubGlobal('fetch', fetchMock);
    useSessionStore.getState().startSession('camera-session-1', 'DOMESTICO', 'viewer-token', false);
    render(<LiveCameraFeed />);
    fireEvent.click(screen.getByRole('button', { name: 'Enlazar iPhone' }));
    expect(await screen.findByText('iPhone enlazado')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8080/api/v1/session/camera-session-1/camera/link',
      expect.objectContaining({ method: 'POST', headers: { Authorization: 'Bearer viewer-token' } }),
    );
  })

  it('pairs without a code and ignores repeated clicks while linking', async () => {
    let release!: (value: object) => void;
    const pending = new Promise((resolve) => { release = resolve; });
    const fetchMock = vi.fn().mockImplementation(async (url) => String(url).includes('/camera/link')
      ? pending : { ok: true, json: async () => ({ camera: 'connected', sessionId: 'local-camera' }) });
    vi.stubGlobal('fetch', fetchMock);
    render(<LiveCameraFeed />);
    const button = screen.getByRole('button', { name: 'Enlazar iPhone' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(screen.getByRole('button', { name: 'Enlazando…' })).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => release({ ok: true, status: 200, json: async () => ({
      status: 'connected', message: 'iPhone listo sin código',
      session: { sessionId: 'local-camera', protocolo: 'DOMESTICO', role: 'VIEWER', accessToken: 'viewer' },
    }) }));
    expect(await screen.findByText('iPhone listo sin código')).toBeInTheDocument();
    expect(connect).toHaveBeenCalledWith('local-camera', 'viewer');
    expect(useSessionStore.getState().isOwner).toBe(false);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enlazar iPhone' })).toBeEnabled();
  })

  it('does not replace a healthy stream when linking again', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url) => ({ ok: true, status: 200,
      json: async () => String(url).includes('/camera/link') ? { status: 'connected', message: 'Ya conectado' }
        : { camera: 'connected', sessionId: 'stable-camera' },
    })));
    useSessionStore.getState().startSession('stable-camera', 'DOMESTICO', 'viewer', false);
    render(<LiveCameraFeed />);
    const image = screen.getByRole('img', { name: /Video en vivo de las manos/ });
    fireEvent.load(image);
    const originalSrc = (image as HTMLImageElement).src;
    fireEvent.click(screen.getByRole('button', { name: 'Enlazar iPhone' }));
    expect(await screen.findByText('Ya conectado')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Video en vivo de las manos/ })).toBe(image);
    expect((image as HTMLImageElement).src).toBe(originalSrc);
  })

  it('re-enables linking after a startup failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503,
      json: async () => ({ message: 'YOLO aún iniciando' }),
    }));
    render(<LiveCameraFeed />);
    fireEvent.click(screen.getByRole('button', { name: 'Enlazar iPhone' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('YOLO aún iniciando');
    expect(screen.getByRole('button', { name: 'Enlazar iPhone' })).toBeEnabled();
  })

  it('requests video for the exact session owned by the Stepper', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ camera: 'connected', sessionId: 'camera-session-1' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    useSessionStore.getState().startSession('camera-session-1', 'DOMESTICO', 'dashboard-token')
    render(<LiveCameraFeed />)

    const image = screen.getByRole('img', {
      name: 'Video en vivo de las manos con las detecciones del modelo YOLO superpuestas',
    })
    const streamUrl = new URL((image as HTMLImageElement).src)
    expect(streamUrl.searchParams.get('sessionId')).toBe('camera-session-1')
    expect(streamUrl.searchParams.get('retry')).toBe('0')
    expect(streamUrl.searchParams.has('access_token')).toBe(false)

    fireEvent.load(image)
    expect(await screen.findByText('En vivo')).toBeInTheDocument()

    fireEvent.error(image)
    expect(screen.getByText('No llega el video de esta sesión')).toBeInTheDocument()
    expect(screen.getByText(/launcher siga activo/i)).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/health' }),
      expect.objectContaining({ cache: 'no-store' }),
    )
  })

  it('distinguishes an open MJPEG stream from a camera that is reconnecting', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ camera: 'reconnecting', sessionId: 'camera-session-1' }),
    }))
    useSessionStore.getState().startSession('camera-session-1', 'DOMESTICO', 'dashboard-token')
    render(<LiveCameraFeed />)

    const image = screen.getByRole('img', {
      name: 'Video en vivo de las manos con las detecciones del modelo YOLO superpuestas',
    })
    fireEvent.load(image)

    expect(await screen.findByText('Cámara reconectando')).toBeInTheDocument()
    expect(screen.queryByText('En vivo')).not.toBeInTheDocument()
    expect(fetch).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/health' }),
      expect.objectContaining({ cache: 'no-store' }),
    )
  })

  it('shows the camera warmup state before Java receives the first step', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        camera: 'connected',
        sessionId: 'camera-session-1',
        handPresence: {
          handsVisible: 2,
          warmupElapsedMs: 1500,
          warmupRequiredMs: 3000,
          warmupComplete: false,
          stepsEnabled: false,
        },
      }),
    }))
    useSessionStore.getState().startSession('camera-session-1', 'DOMESTICO', 'dashboard-token')
    render(<LiveCameraFeed />)

    fireEvent.load(screen.getByRole('img', {
      name: 'Video en vivo de las manos con las detecciones del modelo YOLO superpuestas',
    }))

    expect(await screen.findByText('Estabilizando manos: 1.5/3.0 s')).toBeInTheDocument()
    expect(useSessionStore.getState().cameraHandsVisible).toBe(2)
  })

  it('clears local hand count when health belongs to another session', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        camera: 'connected',
        sessionId: 'different-session',
        handPresence: {
          handsVisible: 2,
          warmupElapsedMs: 3000,
          warmupRequiredMs: 3000,
          warmupComplete: true,
          stepsEnabled: true,
        },
      }),
    }))
    useSessionStore.getState().startSession('camera-session-1', 'DOMESTICO', 'dashboard-token')
    render(<LiveCameraFeed />)

    await act(async () => { await Promise.resolve(); await Promise.resolve() })

    expect(useSessionStore.getState().cameraHandsVisible).toBeNull()
  })

  it('does not present the local camera gate as Java-confirmed readiness', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        camera: 'connected',
        sessionId: 'camera-session-1',
        handPresence: {
          handsVisible: 2,
          warmupElapsedMs: 3000,
          warmupRequiredMs: 3000,
          warmupComplete: true,
          stepsEnabled: true,
        },
      }),
    }))
    useSessionStore.getState().startSession('camera-session-1', 'DOMESTICO', 'dashboard-token')
    useSessionStore.getState().setDetectionDiagnostics({
      estadoIntencion: 'MANOS_PRESENTES',
      motivoIntencion: 'PRESENCIA_NO_ESTABILIZADA',
      manosVisiblesIntencion: 2,
      tiempoConfirmacionIntencionMs: 0,
      umbralConfirmacionIntencionMs: 650,
      claseCandidata: '',
      confianzaCandidata: null,
    })
    render(<LiveCameraFeed />)

    fireEvent.load(screen.getByRole('img', {
      name: 'Video en vivo de las manos con las detecciones del modelo YOLO superpuestas',
    }))

    expect(await screen.findByText('Dos manos detectadas · verificando preparación')).toBeInTheDocument()
    expect(screen.queryByText('Ambas manos estables · inicia con palmas')).not.toBeInTheDocument()
  })

  it('shows Java readiness only after the backend confirms washing intent', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        camera: 'connected',
        sessionId: 'camera-session-1',
        handPresence: {
          handsVisible: 2,
          warmupElapsedMs: 3000,
          warmupRequiredMs: 3000,
          warmupComplete: true,
          stepsEnabled: true,
        },
      }),
    }))
    useSessionStore.getState().startSession('camera-session-1', 'DOMESTICO', 'dashboard-token')
    useSessionStore.getState().setDetectionDiagnostics({
      estadoIntencion: 'LAVADO_PROBABLE',
      motivoIntencion: 'Palmas reconocidas de forma sostenida; inicia la evaluación',
      manosVisiblesIntencion: 2,
      tiempoConfirmacionIntencionMs: 650,
      umbralConfirmacionIntencionMs: 650,
      claseCandidata: 'PASO_1_PALMAS',
      confianzaCandidata: 0.9,
    })
    render(<LiveCameraFeed />)

    fireEvent.load(screen.getByRole('img', {
      name: 'Video en vivo de las manos con las detecciones del modelo YOLO superpuestas',
    }))

    expect(await screen.findByText('Dos manos visibles · seguimiento de pasos activo')).toBeInTheDocument()
  })

  it('expires camera health instead of keeping a stale connected state when polling hangs', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ camera: 'connected', sessionId: 'camera-session-1' }),
      })
      .mockImplementationOnce((_url: URL, options: RequestInit) => new Promise((_resolve, reject) => {
        options.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
      }))
    vi.stubGlobal('fetch', fetchMock)
    useSessionStore.getState().startSession('camera-session-1', 'DOMESTICO', 'dashboard-token')
    render(<LiveCameraFeed />)

    const image = screen.getByRole('img', {
      name: 'Video en vivo de las manos con las detecciones del modelo YOLO superpuestas',
    })
    fireEvent.load(image)
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    expect(screen.getByText('En vivo')).toBeInTheDocument()

    await act(async () => { await vi.advanceTimersByTimeAsync(1_500) })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000) })

    expect(screen.getByText('Stream conectado · cámara sin verificar')).toBeInTheDocument()
  })
})
