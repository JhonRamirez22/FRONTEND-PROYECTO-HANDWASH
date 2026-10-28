import type { HumanRole } from './CognitoAdminAuthService';

/** What the app needs from an ADMIN sign-in, whichever identity provider backs it (Cognito or the local PC backend). */
export interface AdminAuth {
  isConfigured(): boolean;
  getAccessToken(): string | null;
  getIdToken(): string | null;
  getHumanRoles(): HumanRole[];
  clear(): void;
  clearPendingSignIn(): void;
  beginSignIn(landingHash?: '#/' | '#/admin' | '#/operator'): Promise<void>;
  beginSignUp(landingHash?: '#/operator'): Promise<void>;
  continueSignInAfterLogout(): Promise<void>;
  completeRedirect(): Promise<boolean>;
  signOut(): void | Promise<void>;
}
