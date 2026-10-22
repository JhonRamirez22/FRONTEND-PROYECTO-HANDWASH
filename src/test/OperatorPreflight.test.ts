import { describe, expect, it } from 'vitest';
import { operatorPreflight } from '@/lib/OperatorPreflight';
import { cognitoOperatorPoolRoles } from '@/lib/CognitoAdminAuthService';

const base = { assigned: true, macLinked: true, cameraLive: true, shiftActive: false };

function token(claims: Record<string, unknown>): string {
  const encode = (value: unknown) => btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${encode({ alg: 'none' })}.${encode(claims)}.signature`;
}

describe('operatorPreflight', () => {
  it('names the first missing piece in a fixed order', () => {
    expect(operatorPreflight({ ...base, assigned: false, macLinked: false }).message).toContain('asignada');
    expect(operatorPreflight({ ...base, macLinked: false, cameraLive: false }).message).toContain('enlazar este Mac');
    expect(operatorPreflight({ ...base, cameraLive: false }).message).toContain('cámara del iPhone');
    expect(operatorPreflight({ ...base, cameraLive: false }).ready).toBe(false);
  });

  it('is ready once account, Mac and camera are in place', () => {
    expect(operatorPreflight(base)).toMatchObject({ ready: true });
    expect(operatorPreflight({ ...base, shiftActive: true }).message).toContain('Turno activo');
  });
});

describe('operator pool roles', () => {
  it('treats only an access token of the operator client as OPERATOR', () => {
    expect(cognitoOperatorPoolRoles(token({ token_use: 'access', client_id: 'op' }), 'op')).toEqual(['OPERATOR']);
    expect(cognitoOperatorPoolRoles(token({ token_use: 'access', client_id: 'other' }), 'op')).toEqual([]);
    expect(cognitoOperatorPoolRoles(token({ token_use: 'id', client_id: 'op' }), 'op')).toEqual([]);
    expect(cognitoOperatorPoolRoles('not-a-token', 'op')).toEqual([]);
  });

  it('never derives ADMIN from groups in an operator-pool token', () => {
    const roles = cognitoOperatorPoolRoles(token({ token_use: 'access', client_id: 'op', 'cognito:groups': ['ADMIN'] }), 'op');
    expect(roles).toEqual(['OPERATOR']);
  });
});
