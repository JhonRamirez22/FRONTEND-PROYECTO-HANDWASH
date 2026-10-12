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

  it('shows enrollment publicly without Cognito or an admin navigation link', async () => {
    vi.spyOn(stationApi, 'status').mockResolvedValue({
      registered: false, stationId: null, stationName: null, activeSession: null, resumeError: false,
    });
    const token = vi.spyOn(cognitoAdminAuth, 'getAccessToken');

    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Registrar este puesto' })).toBeInTheDocument();
    expect(screen.queryByText(/Iniciar sesión como ADMIN/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Auditoría/ })).not.toBeInTheDocument();
    expect(token).not.toHaveBeenCalled();
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
