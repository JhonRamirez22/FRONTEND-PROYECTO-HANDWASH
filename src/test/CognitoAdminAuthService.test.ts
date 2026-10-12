import { describe, expect, it, vi } from 'vitest';
import { CognitoAdminAuthService, cognitoHumanRoles } from '../lib/CognitoAdminAuthService';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

const config = {
  domain: 'https://handwash-test.auth.sa-east-1.amazoncognito.com',
  clientId: 'public-client-id',
  redirectUri: `${window.location.origin}/`,
};

describe('CognitoAdminAuthService', () => {
  it('reads only the known Cognito groups as a UI routing hint', () => {
    const encode = (value: unknown) => btoa(JSON.stringify(value))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    const token = `header.${encode({ token_use: 'access', 'cognito:groups': ['OPERATOR', 'ADMIN', 'OTHER'] })}.signature`;

    expect(cognitoHumanRoles(token)).toEqual(['ADMIN', 'OPERATOR']);
  });

  it.each([
    '',
    'not-a-jwt',
    'header.e30.signature',
    'header.eyJjb2duaXRvOmdyb3VwcyI6Inh4In0.signature',
    'header.eyJ0b2tlbl91c2UiOiJpZCIsImNvZ25pdG86Z3JvdXBzIjpbIkFETUlOIl19.signature',
  ]) (
    'fails closed for malformed or absent role claims (%s)', (token) => {
      expect(cognitoHumanRoles(token)).toEqual([]);
    },
  );

  it('clears the prior Cognito session before starting PKCE and keeps tokens out of storage', async () => {
    const storage = new MemoryStorage();
    const redirect = vi.fn();
    const service = new CognitoAdminAuthService(config, storage, vi.fn(), redirect);

    await service.beginSignIn();

    const logout = new URL(redirect.mock.calls[0][0]);
    expect(logout.pathname).toBe('/logout');
    expect(logout.searchParams.get('logout_uri')).toBe(config.redirectUri);
    expect(CognitoAdminAuthService.hasPendingLogout(storage)).toBe(true);
    expect(CognitoAdminAuthService.hasPendingRedirect(storage)).toBe(false);

    await service.continueSignInAfterLogout();
    const authorization = new URL(redirect.mock.calls[1][0]);
    expect(authorization.pathname).toBe('/oauth2/authorize');
    expect(authorization.searchParams.get('response_type')).toBe('code');
    expect(authorization.searchParams.has('prompt')).toBe(false);
    expect(authorization.searchParams.get('code_challenge_method')).toBe('S256');
    expect(authorization.searchParams.get('code_challenge')).toMatch(/^[\w-]{43}$/);
    expect(CognitoAdminAuthService.hasPendingLogout(storage)).toBe(false);
    expect(CognitoAdminAuthService.hasPendingRedirect(storage)).toBe(true);
    expect(storage.length).toBe(1);
    expect(storage.getItem('handwash.admin.oidc.transaction')).not.toContain('access_token');
    expect(CognitoAdminAuthService.pendingLandingHash(storage)).toBe('#/admin');
  });

  it('routes an operator Cognito callback back to the operating dashboard', async () => {
    const storage = new MemoryStorage();
    const redirect = vi.fn();
    const cleanCallback = vi.fn();
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'access-secret', token_type: 'Bearer', expires_in: 3600 }),
    } as Response);
    const service = new CognitoAdminAuthService(config, storage, fetcher, redirect, cleanCallback);
    await service.beginSignIn('#/');
    await service.continueSignInAfterLogout();
    const transaction = JSON.parse(storage.getItem('handwash.admin.oidc.transaction')!) as { state: string };

    expect(CognitoAdminAuthService.pendingLandingHash(storage)).toBe('#/');
    await service.completeRedirect(`${window.location.origin}/?code=auth-code&state=${transaction.state}`);
    expect(cleanCallback).toHaveBeenCalledWith('#/');
  });

  it('rejects a callback with mismatched state without exchanging a code', async () => {
    const storage = new MemoryStorage();
    const fetcher = vi.fn();
    const service = new CognitoAdminAuthService(config, storage, fetcher, vi.fn(), vi.fn());
    await service.beginSignIn();
    await service.continueSignInAfterLogout();

    await expect(service.completeRedirect(
      `${window.location.origin}/?code=authorization-code&state=wrong`,
    )).rejects.toThrow('no coincide');

    expect(fetcher).not.toHaveBeenCalled();
    expect(storage.length).toBe(0);
    expect(service.getAccessToken()).toBeNull();
  });

  it('validates state before handling OAuth errors', async () => {
    const storage = new MemoryStorage();
    const fetcher = vi.fn();
    const service = new CognitoAdminAuthService(config, storage, fetcher, vi.fn(), vi.fn());
    await service.beginSignIn();
    await service.continueSignInAfterLogout();

    await expect(service.completeRedirect(
      `${window.location.origin}/?error=access_denied&state=wrong`,
    )).rejects.toThrow('no coincide');

    expect(fetcher).not.toHaveBeenCalled();
    expect(storage.length).toBe(0);
  });

  it('rejects a Cognito base URL that contains path or query state', () => {
    const service = new CognitoAdminAuthService({
      ...config, domain: `${config.domain}/unexpected?next=evil`,
    }, new MemoryStorage(), vi.fn(), vi.fn());

    expect(service.isConfigured()).toBe(false);
  });

  it('clears transient auth state and redirects through Cognito managed logout', async () => {
    const storage = new MemoryStorage();
    const redirect = vi.fn();
    const service = new CognitoAdminAuthService(config, storage, vi.fn(), redirect);
    await service.beginSignIn();
    service.signOut();

    const logout = new URL(redirect.mock.calls[redirect.mock.calls.length - 1][0]);
    expect(logout.pathname).toBe('/logout');
    expect(logout.searchParams.get('client_id')).toBe(config.clientId);
    expect(logout.searchParams.get('logout_uri')).toBe(config.redirectUri);
    expect(service.getAccessToken()).toBeNull();
    expect(storage.length).toBe(0);
  });

  it('keeps the access token in memory only and clears it on expiry/logout', async () => {
    const storage = new MemoryStorage();
    const service = new CognitoAdminAuthService(config, storage, vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'access-secret', token_type: 'Bearer', expires_in: 3600 }),
    } as Response), vi.fn(), vi.fn());
    await service.beginSignIn();
    await service.continueSignInAfterLogout();
    const transaction = JSON.parse(storage.getItem('handwash.admin.oidc.transaction')!) as { state: string };

    await service.completeRedirect(
      `${window.location.origin}/?code=authorization-code&state=${transaction.state}`,
    );

    expect(service.getAccessToken()).toBe('access-secret');
    expect(storage.length).toBe(0);
    service.clear();
    expect(service.getAccessToken()).toBeNull();
  });

  it('does not accept an authorization callback before the logout stage is completed', async () => {
    const storage = new MemoryStorage();
    const fetcher = vi.fn();
    const service = new CognitoAdminAuthService(config, storage, fetcher, vi.fn(), vi.fn());
    await service.beginSignIn();
    const transaction = JSON.parse(storage.getItem('handwash.admin.oidc.transaction')!) as { state: string };

    await expect(service.completeRedirect(
      `${window.location.origin}/?code=authorization-code&state=${transaction.state}`,
    )).rejects.toThrow('no coincide');

    expect(fetcher).not.toHaveBeenCalled();
    expect(storage.length).toBe(0);
  });

  it('discards an expired logout transaction instead of reusing it', async () => {
    const storage = new MemoryStorage();
    const service = new CognitoAdminAuthService(config, storage, vi.fn(), vi.fn());
    storage.setItem('handwash.admin.oidc.transaction', JSON.stringify({
      verifier: 'verifier', state: 'state', createdAt: Date.now() - 5 * 60_000 - 1,
      landingHash: '#/admin', stage: 'logout',
    }));

    await expect(service.continueSignInAfterLogout()).rejects.toThrow('expiró');
    expect(storage.length).toBe(0);
  });

  it('rejects a callback transaction dated in the future', async () => {
    const storage = new MemoryStorage();
    const fetcher = vi.fn();
    const service = new CognitoAdminAuthService(config, storage, fetcher, vi.fn(), vi.fn());
    storage.setItem('handwash.admin.oidc.transaction', JSON.stringify({
      verifier: 'verifier', state: 'state', createdAt: Date.now() + 60_000,
      landingHash: '#/admin', stage: 'authorize',
    }));

    await expect(service.completeRedirect(
      `${window.location.origin}/?code=authorization-code&state=state`,
    )).rejects.toThrow('no coincide');
    expect(fetcher).not.toHaveBeenCalled();
    expect(storage.length).toBe(0);
  });
});
