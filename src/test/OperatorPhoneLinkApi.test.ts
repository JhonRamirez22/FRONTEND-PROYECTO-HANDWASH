import { afterEach, describe, expect, it, vi } from 'vitest';
import { OperatorApi } from '@/lib/OperatorApi';
import { KEY_SESSION } from '@/lib/OperatorKeySession';

const CODE = 'P'.repeat(43);

describe('operator phone link client', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('asks for a one-time code with the console session cookie and the CSRF token', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => String(input) === '/api/station/csrf'
      ? new Response(JSON.stringify({ token: 'a'.repeat(64) }), { status: 200 })
      : new Response(JSON.stringify({ code: CODE, expiresInSeconds: 120 }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const link = await new OperatorApi().phoneLink(KEY_SESSION);

    expect(link).toEqual({ code: CODE, expiresInSeconds: 120 });
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe('/api/operator?action=phone-link');
    expect((init.headers as Record<string, string>)['X-CSRF-Token']).toBe('a'.repeat(64));
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('rejects a malformed answer', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => String(input) === '/api/station/csrf'
      ? new Response(JSON.stringify({ token: 'a'.repeat(64) }), { status: 200 })
      : new Response(JSON.stringify({ code: 'x' }), { status: 200 })));
    await expect(new OperatorApi().phoneLink(KEY_SESSION)).rejects.toThrow();
  });
});
