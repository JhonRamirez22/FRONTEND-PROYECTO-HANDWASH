import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminApiKeysPanel } from '@/components/AdminApiKeysPanel';

const { auth, stations, apiKeys, createApiKey, revokeApiKey } = vi.hoisted(() => ({
  auth: { getAccessToken: vi.fn() }, stations: vi.fn(), apiKeys: vi.fn(), createApiKey: vi.fn(), revokeApiKey: vi.fn(),
}));
vi.mock('@/lib/adminAuth', () => ({ cognitoAdminAuth: auth }));
vi.mock('@/lib/AdminAuditApi', () => ({
  AdminAuditApi: class { stations = stations; apiKeys = apiKeys; createApiKey = createApiKey; revokeApiKey = revokeApiKey; },
}));

const station = { stationId: 's1', stationName: 'Lavamanos A', revokedAtEpochMs: null };
const key = (overrides: Record<string, unknown> = {}) => ({
  keyId: '0123456789abcdef', stationId: 's1', stationName: 'Lavamanos A', label: 'María – mañana',
  scopes: ['CONSOLE', 'PRODUCER'], createdBy: 'admin', createdAtEpochMs: Date.UTC(2026, 9, 25),
  lastUsedAtEpochMs: null, lastUsedIp: null, revokedAtEpochMs: null, ...overrides,
});

describe('AdminApiKeysPanel', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    auth.getAccessToken.mockReturnValue('admin-token');
    stations.mockResolvedValue([station]);
    apiKeys.mockResolvedValue([key()]);
  });

  it('lists keys by label, station and permissions without ever showing a secret', async () => {
    render(<AdminApiKeysPanel onSignOut={vi.fn()} />);

    const row = (await screen.findByText('María – mañana')).closest('tr')!;
    expect(within(row).getByText('Lavamanos A')).toBeInTheDocument();
    expect(within(row).getByText(/Consola/)).toBeInTheDocument();
    expect(within(row).getByText(/PC YOLO/)).toBeInTheDocument();
    expect(within(row).getByText('Sin uso todavía')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/hwk_[0-9a-f]{16}_/);
  });

  it('creates a key, shows it once with a copy button and forgets it when dismissed', async () => {
    const secret = 'hwk_fedcba9876543210_' + 'Z'.repeat(43);
    createApiKey.mockResolvedValue({ keyId: 'fedcba9876543210', key: secret, stationId: 's1', label: 'Turno tarde', scopes: ['CONSOLE'] });
    const user = userEvent.setup();
    render(<AdminApiKeysPanel onSignOut={vi.fn()} />);
    await screen.findByText('María – mañana');

    await user.selectOptions(screen.getByLabelText('Puesto'), 's1');
    await user.type(screen.getByLabelText('Etiqueta (quién la usa)'), 'Turno tarde');
    await user.click(screen.getByLabelText('PC YOLO'));
    await user.click(screen.getByRole('button', { name: 'Crear API key' }));

    expect(await screen.findByText(secret)).toBeInTheDocument();
    expect(createApiKey).toHaveBeenCalledWith('admin-token', { stationId: 's1', label: 'Turno tarde', scopes: ['CONSOLE'] });
    expect(screen.getByText(/se muestra una sola vez/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Ya la guardé' }));
    expect(screen.queryByText(secret)).not.toBeInTheDocument();
  });

  it('requires at least one permission before creating', async () => {
    const user = userEvent.setup();
    render(<AdminApiKeysPanel onSignOut={vi.fn()} />);
    await screen.findByText('María – mañana');
    await user.type(screen.getByLabelText('Etiqueta (quién la usa)'), 'Sin permisos');
    await user.click(screen.getByLabelText('Consola del operador'));
    await user.click(screen.getByLabelText('PC YOLO'));
    expect(screen.getByRole('button', { name: 'Crear API key' })).toBeDisabled();
  });

  it('revokes after confirmation and marks the key as revoked', async () => {
    revokeApiKey.mockResolvedValue(undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    render(<AdminApiKeysPanel onSignOut={vi.fn()} />);
    const row = (await screen.findByText('María – mañana')).closest('tr')!;
    apiKeys.mockResolvedValue([key({ revokedAtEpochMs: Date.UTC(2026, 9, 25, 1) })]);

    await user.click(within(row).getByRole('button', { name: /Revocar/ }));

    expect(revokeApiKey).toHaveBeenCalledWith('admin-token', '0123456789abcdef');
    expect(await screen.findByText('Revocada')).toBeInTheDocument();
  });

  it('does not revoke when the admin cancels', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();
    render(<AdminApiKeysPanel onSignOut={vi.fn()} />);
    const row = (await screen.findByText('María – mañana')).closest('tr')!;

    await user.click(within(row).getByRole('button', { name: /Revocar/ }));

    expect(revokeApiKey).not.toHaveBeenCalled();
  });
});
