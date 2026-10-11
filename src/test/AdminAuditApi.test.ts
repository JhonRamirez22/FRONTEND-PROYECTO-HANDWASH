import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminAuditApi } from '../lib/AdminAuditApi';

describe('AdminAuditApi', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('requests bounded failed-attempt metadata with a bearer token and no cookies', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    } as Response);
    vi.stubGlobal('fetch', fetcher);

    await new AdminAuditApi().failedAttempts('admin-access-token', 20);

    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/admin/failed-attempts?limit=20'),
      expect.objectContaining({
        method: 'GET',
        credentials: 'omit',
        cache: 'no-store',
        headers: expect.objectContaining({ Authorization: 'Bearer admin-access-token' }),
      }),
    );
  });

  it('passes cancellation through when an admin changes the selected encounter', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    } as Response);
    const controller = new AbortController();
    vi.stubGlobal('fetch', fetcher);

    await new AdminAuditApi().events('admin-access-token', 'session-123', 100, controller.signal);

    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/admin/encounters/session-123/events?limit=100'),
      expect.objectContaining({ signal: controller.signal }),
    );
  });
});
