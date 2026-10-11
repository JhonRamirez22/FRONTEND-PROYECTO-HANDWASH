import { describe, expect, it } from 'vitest';
import { postLoginSurface, resolveProtectedSurface } from '../lib/RoleRouter';

describe('role-based surface routing', () => {
  it('routes operator to live station and denies audit access', () => {
    expect(resolveProtectedSurface(['OPERATOR'], 'station')).toBe('station');
    expect(resolveProtectedSurface(['OPERATOR'], 'audit')).toBe('forbidden');
  });

  it('routes an admin-only account to audit, never the live station', () => {
    expect(postLoginSurface(['ADMIN'], 'station')).toBe('audit');
    expect(resolveProtectedSurface(['ADMIN'], 'station')).toBe('audit');
    expect(resolveProtectedSurface(['ADMIN'], 'audit')).toBe('audit');
  });

  it('preserves the requested destination only when both roles are explicitly present', () => {
    expect(postLoginSurface(['OPERATOR', 'ADMIN'], 'station')).toBe('station');
    expect(postLoginSurface(['OPERATOR', 'ADMIN'], 'audit')).toBe('audit');
  });

  it('fails closed when the token contains no known role', () => {
    expect(resolveProtectedSurface([], 'station')).toBe('forbidden');
    expect(resolveProtectedSurface([], 'audit')).toBe('forbidden');
  });
});
