import { afterEach, describe, expect, it, vi } from 'vitest';
import { OperatorApi } from '@/lib/OperatorApi';

function claimFails(status: number, body: unknown) {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === '/api/station/csrf') return new Response(JSON.stringify({ token: 'a'.repeat(64) }), { status: 200 });
    return new Response(JSON.stringify(body), { status });
  }));
  return new OperatorApi().claim('access', 'id-token', 'c'.repeat(43)).then(() => 'ok', (error: Error) => error.message);
}

describe('operator claim errors say what really failed', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('only the server code CODIGO_OPERADOR_INVALIDO means a bad, used, revoked or expired code', async () => {
    const message = await claimFails(401, { code: 'CODIGO_OPERADOR_INVALIDO' });
    expect(message).toContain('ya fue canjeado');
    expect(message).toContain('[CODIGO_OPERADOR_INVALIDO]');
  });

  it('an invalid identity token is not reported as a used code', async () => {
    const message = await claimFails(401, { code: 'ID_TOKEN_NO_VALIDO' });
    expect(message).toContain('token de identidad');
    expect(message).not.toContain('ya fue canjeado');
    expect(message).toContain('[ID_TOKEN_NO_VALIDO]');
  });

  it('a bare 401 (Cognito token rejected before the controller) asks to sign in again', async () => {
    const message = await claimFails(401, { code: 'REQUEST_REJECTED' });
    expect(message).toContain('Cierra sesión');
    expect(message).not.toContain('código');
    expect(message).toContain('[REQUEST_REJECTED]');
  });

  it('explains the other claim outcomes and keeps the technical tag', async () => {
    expect(await claimFails(403, { code: 'CORREO_NO_COINCIDE' })).toContain('otro correo');
    expect(await claimFails(403, { code: 'CORREO_NO_VERIFICADO' })).toContain('correo verificado');
    expect(await claimFails(409, { code: 'OPERADOR_YA_ASIGNADO' })).toContain('Recarga la página');
    expect(await claimFails(409, { code: 'PUESTO_NO_DISPONIBLE' })).toContain('revocado');
    expect(await claimFails(503, { code: 'BACKEND_UNAVAILABLE' })).toContain('[BACKEND_UNAVAILABLE]');
    expect(await claimFails(418, {})).toContain('[HTTP 418]');
  });

  it('never puts arbitrary server text in the message tag', async () => {
    const message = await claimFails(400, { code: '<script>alert(1)</script>' });
    expect(message).not.toContain('<script>');
    expect(message).toContain('[HTTP 400]');
  });
});
