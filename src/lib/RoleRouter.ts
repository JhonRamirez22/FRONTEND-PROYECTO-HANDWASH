import type { HumanRole } from './CognitoAdminAuthService';

export type ProtectedSurface = 'station' | 'audit' | 'forbidden';

/** Cognito claims choose a UI route only; the Java API remains the access authority. */
export function resolveProtectedSurface(roles: HumanRole[], requested: 'station' | 'audit'): ProtectedSurface {
  const canOperate = roles.includes('OPERATOR');
  const canAudit = roles.includes('ADMIN');
  if (requested === 'audit') return canAudit ? 'audit' : 'forbidden';
  if (canOperate) return 'station';
  return canAudit ? 'audit' : 'forbidden';
}

export function postLoginSurface(roles: HumanRole[], requested: 'station' | 'audit'): ProtectedSurface {
  if (roles.length === 1 && roles[0] === 'ADMIN') return 'audit';
  if (roles.length === 1 && roles[0] === 'OPERATOR') return 'station';
  return resolveProtectedSurface(roles, requested);
}
