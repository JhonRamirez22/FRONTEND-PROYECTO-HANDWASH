import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { AdminStationRegistry } from '@/components/AdminStationRegistry';

const { auth, stations } = vi.hoisted(() => ({ auth: { getAccessToken: vi.fn() }, stations: vi.fn() }));
vi.mock('@/lib/adminAuth', () => ({ cognitoAdminAuth: auth }));
vi.mock('@/lib/AdminAuditApi', () => ({ AdminAuditApi: class { stations = stations; } }));

const station = (overrides: Record<string, unknown>) => ({
  stationId: 's1', stationName: 'Lavamanos', createdAtEpochMs: 1, createdBy: 'admin', revokedAtEpochMs: null,
  lastStartedAtEpochMs: null, activeSessionId: null, producerClientId: null, activatedAtEpochMs: 5, ...overrides,
});

describe('AdminStationRegistry status', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    auth.getAccessToken.mockReturnValue('admin-token');
  });

  it('tells apart active, waiting-for-activation and revoked stations', async () => {
    stations.mockResolvedValue([
      station({ stationId: 'a', stationName: 'Mesa 1' }),
      station({ stationId: 'p', stationName: 'Mesa 2', activatedAtEpochMs: null }),
      station({ stationId: 'r', stationName: 'Mesa 3', revokedAtEpochMs: 9 }),
    ]);
    render(<AdminStationRegistry onSignOut={vi.fn()} />);

    const rowOf = async (name: string) => (await screen.findByText(name)).closest('tr')!;
    expect(within(await rowOf('Mesa 1')).getByText('Activo')).toBeInTheDocument();
    expect(within(await rowOf('Mesa 2')).getByText('Pendiente de activar')).toBeInTheDocument();
    expect(within(await rowOf('Mesa 3')).getByText('Revocado')).toBeInTheDocument();
  });
});
