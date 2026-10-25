import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import App from '../App';
import { cognitoAdminAuth } from '../lib/adminAuth';
import { stationApi } from '../lib/StationApi';

describe('public kiosk routing', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_HANDWASH_CLOUD_MODE', 'true');
    window.location.hash = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    window.location.hash = '';
  });

  it('shows a passive kiosk without controls, enrollment, role links or Cognito', async () => {
    vi.spyOn(stationApi, 'status').mockResolvedValue({
      registered: false, stationId: null, stationName: null, activeSession: null, resumeError: false,
    });
    const token = vi.spyOn(cognitoAdminAuth, 'getAccessToken');

    render(<App />);

    expect(await screen.findByText(/Puesto pendiente de configuración/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Progreso' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Video en vivo del lavado' })).toBeInTheDocument();
    expect(screen.getByText('Secuencia del lavado')).toBeInTheDocument();
    expect(screen.getByRole('list').querySelectorAll(':scope > li')).toHaveLength(6);
    await waitFor(() => expect(stationApi.status).toHaveBeenCalled());
    expect(document.querySelectorAll('.patient-kiosk button, .patient-kiosk form, .patient-kiosk a')).toHaveLength(0);
    expect(document.querySelector('.kiosk-connection--setup')).toBeInTheDocument();
    expect(screen.queryByText(/Iniciar sesión como ADMIN/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Auditoría|ADMIN|Operador/ })).not.toBeInTheDocument();
    expect(token).not.toHaveBeenCalled();
  });

  it('keeps a backend outage visible instead of presenting it as an idle session', async () => {
    vi.spyOn(stationApi, 'status').mockRejectedValue(new Error('offline'));

    render(<App />);

    expect(await screen.findByText(/Sin conexión con el servidor\. El lavado no se está evaluando\./)).toBeInTheDocument();
    expect(document.querySelector('.kiosk-connection--error')).toBeInTheDocument();
  });

  it('exposes API key entry and account sign-in only on the protected operator route', async () => {
    window.location.hash = '#/operator';
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Control del puesto' })).toBeInTheDocument();
    expect(screen.getByLabelText('API key')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Iniciar sesión con cuenta' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Crear cuenta de operador' })).toBeInTheDocument();
  });

  it('keeps the hidden admin route behind Cognito', async () => {
    window.location.hash = '#/admin';
    const status = vi.spyOn(stationApi, 'status');
    vi.spyOn(cognitoAdminAuth, 'getAccessToken').mockReturnValue(null);

    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Consola ADMIN' })).toBeInTheDocument();
    expect(status).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Iniciar sesión como ADMIN' })).toBeDisabled();
  });

  it('does not expose the admin audit to an OPERATOR account', async () => {
    window.location.hash = '#/admin';
    vi.spyOn(cognitoAdminAuth, 'getAccessToken').mockReturnValue('test-access-token');
    vi.spyOn(cognitoAdminAuth, 'getHumanRoles').mockReturnValue(['OPERATOR']);
    vi.spyOn(stationApi, 'status');

    render(<App />);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Consola ADMIN no habilitada para esta cuenta' })).toBeInTheDocument());
    expect(screen.queryByText('Encuentros recientes')).not.toBeInTheDocument();
  });
});
