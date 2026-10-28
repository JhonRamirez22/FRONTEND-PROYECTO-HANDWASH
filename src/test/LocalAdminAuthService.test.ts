import { describe, expect, it, vi } from 'vitest';
import { LocalAdminAuthService } from '../lib/LocalAdminAuthService';

const TOKEN = `hwa_${'A'.repeat(43)}`;
const BASE = 'https://pc.tail1234.ts.net';

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function service(fetcher: typeof fetch, now = () => 1_000) {
  return new LocalAdminAuthService(BASE, fetcher, now);
}

describe('LocalAdminAuthService', () => {
  it('signs in with password and code, and keeps the token only in memory', async () => {
    const fetcher = vi.fn(async () => json(200, { username: 'admin', token: TOKEN, expiresAtEpochMs: 60_000 }));
    const auth = service(fetcher as unknown as typeof fetch);

    const result = await auth.login('admin', 'a-long-password', '123456');

    expect(result).toEqual({ kind: 'signedIn' });
    expect(fetcher).toHaveBeenCalledWith(`${BASE}/api/v1/auth/admin/login`, expect.objectContaining({
      method: 'POST', credentials: 'omit', cache: 'no-store',
      body: JSON.stringify({ username: 'admin', password: 'a-long-password', totp: '123456' }),
    }));
    expect(auth.getAccessToken()).toBe(TOKEN);
    expect(auth.getHumanRoles()).toEqual(['ADMIN']);
    expect(auth.getIdToken()).toBeNull();
  });

  it('returns the enrollment secret on the first login and holds no token', async () => {
    const auth = service((async () => json(200, {
      enrollmentRequired: true, username: 'admin', totpSecret: 'ABCDEF', otpauthUri: 'otpauth://totp/HandWash:admin?secret=ABCDEF',
    })) as unknown as typeof fetch);

    const result = await auth.login('admin', 'a-long-password');

    expect(result).toEqual({ kind: 'enrollment', secret: 'ABCDEF', otpauthUri: 'otpauth://totp/HandWash:admin?secret=ABCDEF' });
    expect(auth.getAccessToken()).toBeNull();
    expect(auth.getHumanRoles()).toEqual([]);
  });

  it('reports bad credentials without revealing which part failed', async () => {
    const auth = service((async () => json(401, { error: 'CREDENCIALES_INVALIDAS' })) as unknown as typeof fetch);
    await expect(auth.login('admin', 'x', '000000')).rejects.toThrow('Usuario, contraseña o código incorrectos.');
  });

  it('tells how long a locked account has to wait', async () => {
    const auth = service((async () => json(423, { error: 'CUENTA_BLOQUEADA', retryAfterSeconds: 900 })) as unknown as typeof fetch);
    await expect(auth.login('admin', 'x', '000000')).rejects.toThrow('15 min');
  });

  it('drops the token when it expires', async () => {
    let clock = 1_000;
    const auth = service((async () => json(200, { username: 'admin', token: TOKEN, expiresAtEpochMs: 100_000 })) as unknown as typeof fetch, () => clock);
    await auth.login('admin', 'a-long-password', '123456');
    clock = 99_000;
    expect(auth.getAccessToken()).toBeNull();
  });

  it('signs out on the server and clears the token even if the call fails', async () => {
    const calls: string[] = [];
    const fetcher = vi.fn(async (url: string) => {
      calls.push(url);
      if (url.endsWith('/login')) return json(200, { username: 'admin', token: TOKEN, expiresAtEpochMs: 60_000 });
      throw new Error('offline');
    });
    const auth = service(fetcher as unknown as typeof fetch);
    await auth.login('admin', 'a-long-password', '123456');

    await auth.signOut();

    expect(calls[1]).toBe(`${BASE}/api/v1/auth/admin/logout`);
    expect(fetcher.mock.calls[1]?.[1]).toEqual(expect.objectContaining({ headers: expect.objectContaining({ Authorization: `Bearer ${TOKEN}` }) }));
    expect(auth.getAccessToken()).toBeNull();
  });

  it('rejects a malformed success body instead of trusting it', async () => {
    const auth = service((async () => json(200, { token: 'not-an-admin-token', expiresAtEpochMs: 60_000 })) as unknown as typeof fetch);
    await expect(auth.login('admin', 'a-long-password', '123456')).rejects.toThrow('respuesta');
    expect(auth.getAccessToken()).toBeNull();
  });
});
