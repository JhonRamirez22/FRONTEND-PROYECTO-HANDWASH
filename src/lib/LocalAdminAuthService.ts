import type { AdminAuth } from './AdminAuthPort';
import type { HumanRole } from './CognitoAdminAuthService';

export type LocalLoginResult =
  | { kind: 'signedIn' }
  | { kind: 'enrollment'; secret: string; otpauthUri: string };

interface LoginBody {
  token?: unknown;
  expiresAtEpochMs?: unknown;
  enrollmentRequired?: unknown;
  totpSecret?: unknown;
  otpauthUri?: unknown;
  retryAfterSeconds?: unknown;
}

const ADMIN_TOKEN = /^hwa_[A-Za-z0-9_-]{20,}$/;

/**
 * ADMIN sign-in against the Java backend's own accounts (password + TOTP), used when the backend runs on the
 * Windows PC instead of AWS. The token lives only in memory; Spring Security stays the authority on every call.
 */
export class LocalAdminAuthService implements AdminAuth {
  private token: string | null = null;
  private expiresAt = 0;

  constructor(
    private readonly apiBase: string,
    private readonly fetcher: typeof fetch = window.fetch.bind(window),
    private readonly now: () => number = () => Date.now(),
    private readonly leave: () => void = () => { window.location.hash = '#/'; },
  ) {}

  isConfigured(): boolean {
    try {
      const url = new URL(this.apiBase);
      const loopback = ['localhost', '127.0.0.1'].includes(url.hostname);
      return !url.username && !url.password && (url.protocol === 'https:' || loopback && url.protocol === 'http:');
    } catch {
      return false;
    }
  }

  /** First call for a new account returns the TOTP secret to enroll; a later call with the code signs in. */
  async login(username: string, password: string, totp?: string): Promise<LocalLoginResult> {
    const response = await this.fetcher(`${this.apiBase}/api/v1/auth/admin/login`, {
      method: 'POST',
      credentials: 'omit',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(totp ? { username, password, totp } : { username, password }),
    });
    const body = await response.json().catch(() => ({})) as LoginBody;
    if (response.status === 423) {
      const minutes = typeof body.retryAfterSeconds === 'number' && body.retryAfterSeconds > 0
        ? Math.ceil(body.retryAfterSeconds / 60) : 15;
      throw new Error(`Cuenta bloqueada por intentos fallidos. Reintenta en ${minutes} min.`);
    }
    if (response.status === 401) throw new Error('Usuario, contraseña o código incorrectos.');
    if (!response.ok) throw new Error('El backend no pudo iniciar la sesión; reintenta en unos segundos.');

    if (body.enrollmentRequired === true) {
      if (typeof body.totpSecret !== 'string' || typeof body.otpauthUri !== 'string') {
        throw new Error('El backend devolvió una respuesta de registro inválida.');
      }
      return { kind: 'enrollment', secret: body.totpSecret, otpauthUri: body.otpauthUri };
    }
    if (typeof body.token !== 'string' || !ADMIN_TOKEN.test(body.token)
      || typeof body.expiresAtEpochMs !== 'number' || !Number.isFinite(body.expiresAtEpochMs)) {
      throw new Error('El backend devolvió una respuesta de sesión inválida.');
    }
    this.token = body.token;
    this.expiresAt = body.expiresAtEpochMs;
    return { kind: 'signedIn' };
  }

  getAccessToken(): string | null {
    if (!this.token || this.now() >= this.expiresAt - 30_000) {
      this.clear();
      return null;
    }
    return this.token;
  }

  getIdToken(): string | null {
    return null;
  }

  /** UI routing hint only; the backend decides. */
  getHumanRoles(): HumanRole[] {
    return this.getAccessToken() ? ['ADMIN'] : [];
  }

  clear(): void {
    this.token = null;
    this.expiresAt = 0;
  }

  clearPendingSignIn(): void {
    // No redirect transaction exists in this flow.
  }

  async beginSignIn(): Promise<void> {
    throw new Error('Este despliegue usa usuario, contraseña y código TOTP; no hay inicio de sesión por redirección.');
  }

  async beginSignUp(): Promise<void> {
    throw new Error('Las cuentas de operador no existen en este despliegue; usa la API key del puesto.');
  }

  async continueSignInAfterLogout(): Promise<void> {
    throw new Error('Este despliegue no usa redirecciones de inicio de sesión.');
  }

  async completeRedirect(): Promise<boolean> {
    return false;
  }

  async signOut(): Promise<void> {
    const token = this.token;
    this.clear();
    if (token) {
      try {
        await this.fetcher(`${this.apiBase}/api/v1/auth/admin/logout`, {
          method: 'POST',
          credentials: 'omit',
          cache: 'no-store',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        // The token is already gone locally and expires on the server.
      }
    }
    this.leave();
  }
}
