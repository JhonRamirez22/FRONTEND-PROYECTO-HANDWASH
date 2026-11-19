import { afterEach, describe, expect, it, vi } from 'vitest';
import { OperatorKeySession, phoneCodeFromHash } from '../lib/OperatorKeySession';

const CODE = 'P'.repeat(43);

describe('phoneCodeFromHash', () => {
  it('reads the one-time code from the operator link and ignores everything else', () => {
    expect(phoneCodeFromHash(`#/operator?phone=${CODE}`)).toBe(CODE);
    expect(phoneCodeFromHash(`#/panel?phone=${CODE}`)).toBe(CODE);
    expect(phoneCodeFromHash('#/operator')).toBeNull();
    expect(phoneCodeFromHash('#/admin?phone=' + CODE)).toBeNull();
    expect(phoneCodeFromHash('#/operator?phone=short')).toBeNull();
    expect(phoneCodeFromHash('#/operator?other=' + CODE)).toBeNull();
  });
});

describe('OperatorKeySession.loginWithPhoneCode', () => {
  afterEach(() => { vi.unstubAllGlobals(); window.sessionStorage.clear(); });

  it('trades the code for a console session through the BFF', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(url);
      if (url === '/api/station/csrf') return new Response(JSON.stringify({ token: 'a'.repeat(64) }), { status: 200 });
      expect(JSON.parse(String(init?.body))).toEqual({ code: CODE });
      return new Response(JSON.stringify({ stationId: 's', stationName: 'Lavamanos A', label: 'María', expiresAtEpochMs: 1, stationLinked: false, macAlreadyLinked: false }), { status: 200 });
    }));

    const session = new OperatorKeySession();
    const profile = await session.loginWithPhoneCode(CODE);

    expect(calls).toContain('/api/operator?action=phone-login');
    expect(profile).toMatchObject({ stationName: 'Lavamanos A', stationLinked: false });
    expect(session.isActive()).toBe(true);
  });

  it('says the QR expired when the code is no longer valid', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url === '/api/station/csrf'
      ? new Response(JSON.stringify({ token: 'a'.repeat(64) }), { status: 200 })
      : new Response(JSON.stringify({ code: 'ENLACE_NO_VALIDO' }), { status: 401 })));
    await expect(new OperatorKeySession().loginWithPhoneCode(CODE)).rejects.toThrow(/venció|expiró/);
  });
});
