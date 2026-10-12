import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminAuditApi } from '../lib/AdminAuditApi';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('Admin station API', () => {
  it('uses the ADMIN-authenticated Java endpoints for listing, enrollment and revocation', async () => {
    vi.stubEnv('VITE_API_URL', 'https://java.example.com');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('[]', { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 'one-time-code', expiresAtEpochMs: 123 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    const api = new AdminAuditApi();

    await expect(api.stations('jwt')).resolves.toEqual([]);
    await expect(api.issueStationCode('jwt', 'Lavamanos 1')).resolves.toEqual({
      code: 'one-time-code', expiresAtEpochMs: 123,
    });
    await expect(api.revokeStation('jwt', 'station-id')).resolves.toBeUndefined();

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('https://java.example.com/api/v1/admin/stations');
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'GET', credentials: 'omit' });
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: 'POST', body: JSON.stringify({ stationName: 'Lavamanos 1' }),
      headers: expect.objectContaining({ Authorization: 'Bearer jwt' }),
    });
    expect(fetchMock.mock.calls[2]?.[1]).toMatchObject({ method: 'DELETE' });
  });
});
