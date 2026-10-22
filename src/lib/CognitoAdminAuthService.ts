export interface CognitoAdminAuthConfig {
  domain: string;
  clientId: string;
  redirectUri: string;
  landingHash?: '#/' | '#/admin' | '#/operator';
  /** Operator-pool tokens carry no groups; a valid access token from this pool is an OPERATOR. */
  operatorPool?: boolean;
}

export type HumanRole = 'OPERATOR' | 'ADMIN';

interface CognitoTokenResponse {
  access_token?: unknown;
  id_token?: unknown;
  token_type?: unknown;
  expires_in?: unknown;
}

interface AuthTransaction {
  verifier: string;
  state: string;
  createdAt: number;
  landingHash: '#/' | '#/admin' | '#/operator';
  stage: 'logout' | 'authorize';
}

const TRANSACTION_KEY = 'handwash.admin.oidc.transaction';

/** Hosted UI Authorization Code + PKCE; API authorization remains authoritative. */
export class CognitoAdminAuthService {
  private accessToken: string | null = null;
  private idToken: string | null = null;
  private expiresAt = 0;

  constructor(
    private readonly config: CognitoAdminAuthConfig,
    private readonly storage: Storage = window.sessionStorage,
    private readonly fetcher: typeof fetch = window.fetch.bind(window),
    private readonly redirect: (url: string) => void = (url) => window.location.assign(url),
    private readonly cleanCallbackUrl: (landingHash: string) => void = (landingHash) => {
      window.history.replaceState(null, '', `${window.location.pathname}${landingHash}`);
    },
  ) {}

  isConfigured(): boolean {
    if (!this.config.domain || !this.config.clientId || !this.config.redirectUri) return false;
    try {
      const domain = new URL(this.config.domain);
      const redirect = new URL(this.config.redirectUri);
      const localRedirect = ['localhost', '127.0.0.1'].includes(redirect.hostname);
      return domain.protocol === 'https:' && !domain.username && !domain.password
        && domain.pathname === '/' && !domain.search && !domain.hash
        && (redirect.protocol === 'https:' || localRedirect && redirect.protocol === 'http:')
        && !redirect.username && !redirect.password && redirect.origin === window.location.origin
        && !redirect.search && !redirect.hash;
    } catch {
      return false;
    }
  }

  async beginSignIn(landingHash: '#/' | '#/admin' | '#/operator' = this.config.landingHash ?? '#/admin'): Promise<void> {
    if (!this.isConfigured()) throw new Error('El inicio de sesión Cognito no está configurado.');
    if (!globalThis.crypto?.subtle || !globalThis.crypto?.getRandomValues) {
      throw new Error('PKCE requiere un navegador moderno en HTTPS o localhost.');
    }
    const verifier = randomBase64Url(32);
    const state = randomBase64Url(24);
    const transaction: AuthTransaction = {
      verifier, state, createdAt: Date.now(), landingHash, stage: 'logout',
    };
    try {
      this.storage.setItem(TRANSACTION_KEY, JSON.stringify(transaction));
    } catch {
      throw new Error('El navegador no permite almacenamiento temporal seguro para iniciar sesión.');
    }

    const logout = new URL('/logout', this.config.domain);
    logout.search = new URLSearchParams({
      client_id: this.config.clientId,
      logout_uri: this.config.redirectUri,
    }).toString();
    this.redirect(logout.toString());
  }

  async beginSignUp(landingHash: '#/operator' = '#/operator'): Promise<void> {
    if (!this.isConfigured()) throw new Error('El registro Cognito no está configurado.');
    if (!globalThis.crypto?.subtle || !globalThis.crypto?.getRandomValues) {
      throw new Error('PKCE requiere un navegador moderno en HTTPS o localhost.');
    }
    const transaction: AuthTransaction = {
      verifier: randomBase64Url(32), state: randomBase64Url(24),
      createdAt: Date.now(), landingHash, stage: 'authorize',
    };
    try {
      this.storage.setItem(TRANSACTION_KEY, JSON.stringify(transaction));
    } catch {
      throw new Error('El navegador no permite almacenamiento temporal seguro para registrarse.');
    }
    const challenge = await sha256Base64Url(transaction.verifier);
    const signup = new URL('/signup', this.config.domain);
    signup.search = new URLSearchParams({
      client_id: this.config.clientId,
      response_type: 'code',
      scope: 'openid email',
      redirect_uri: this.config.redirectUri,
      code_challenge_method: 'S256',
      code_challenge: challenge,
      state: transaction.state,
    }).toString();
    this.redirect(signup.toString());
  }

  async continueSignInAfterLogout(): Promise<void> {
    const transaction = this.readTransaction();
    const age = transaction ? Date.now() - transaction.createdAt : Number.POSITIVE_INFINITY;
    if (!this.isConfigured() || !transaction || transaction.stage !== 'logout'
      || age < 0 || age > 5 * 60_000) {
      this.storage.removeItem(TRANSACTION_KEY);
      throw new Error('La sesión ADMIN expiró; vuelve a iniciar sesión.');
    }
    if (!globalThis.crypto?.subtle || !globalThis.crypto?.getRandomValues) {
      this.storage.removeItem(TRANSACTION_KEY);
      throw new Error('PKCE requiere un navegador moderno en HTTPS o localhost.');
    }
    const challenge = await sha256Base64Url(transaction.verifier);
    transaction.stage = 'authorize';
    this.storage.setItem(TRANSACTION_KEY, JSON.stringify(transaction));

    const authorize = new URL('/oauth2/authorize', this.config.domain);
    authorize.search = new URLSearchParams({
      client_id: this.config.clientId,
      response_type: 'code',
      scope: 'openid email',
      redirect_uri: this.config.redirectUri,
      code_challenge_method: 'S256',
      code_challenge: challenge,
      state: transaction.state,
    }).toString();
    this.redirect(authorize.toString());
  }

  async completeRedirect(callbackUrl: string = window.location.href): Promise<boolean> {
    const callback = new URL(callbackUrl);
    const params = callback.searchParams;
    const code = params.get('code');
    const returnedState = params.get('state');
    if (!code && !params.has('error')) return false;

    const transaction = this.readTransaction();
    const transactionAge = transaction ? Date.now() - transaction.createdAt : Number.POSITIVE_INFINITY;
    if (!transaction || transaction.stage !== 'authorize' || !returnedState || returnedState !== transaction.state
      || transactionAge < 0 || transactionAge > 5 * 60_000) {
      this.storage.removeItem(TRANSACTION_KEY);
      this.cleanCallbackUrl(this.config.landingHash ?? '#/admin');
      throw new Error('La respuesta de inicio de sesión expiró o no coincide; vuelve a intentarlo.');
    }
    this.storage.removeItem(TRANSACTION_KEY);
    this.cleanCallbackUrl(transaction.landingHash);
    if (params.has('error')) throw new Error('Cognito rechazó el inicio de sesión.');

    const tokenEndpoint = new URL('/oauth2/token', this.config.domain);
    const response = await this.fetcher(tokenEndpoint, {
      method: 'POST',
      credentials: 'omit',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: this.config.clientId,
        code: code!,
        redirect_uri: this.config.redirectUri,
        code_verifier: transaction.verifier,
      }),
    });
    if (!response.ok) throw new Error('No fue posible canjear el código de Cognito.');

    const payload = await response.json() as CognitoTokenResponse;
    if (typeof payload.access_token !== 'string' || typeof payload.id_token !== 'string'
      || payload.token_type !== 'Bearer'
      || typeof payload.expires_in !== 'number' || !Number.isFinite(payload.expires_in)
      || payload.expires_in <= 0) {
      throw new Error('Cognito devolvió una respuesta de token inválida.');
    }
    this.accessToken = payload.access_token;
    this.idToken = payload.id_token;
    this.expiresAt = Date.now() + payload.expires_in * 1_000;
    return true;
  }

  getAccessToken(): string | null {
    if (!this.accessToken || Date.now() >= this.expiresAt - 30_000) {
      this.clear();
      return null;
    }
    return this.accessToken;
  }

  getIdToken(): string | null {
    return this.getAccessToken() ? this.idToken : null;
  }

  /** UI routing hint only; Spring Security remains the authorization authority. */
  getHumanRoles(): HumanRole[] {
    const token = this.getAccessToken();
    if (!token) return [];
    if (this.config.operatorPool) return cognitoOperatorPoolRoles(token, this.config.clientId);
    return cognitoHumanRoles(token);
  }

  clear(): void {
    this.accessToken = null;
    this.idToken = null;
    this.expiresAt = 0;
  }

  static pendingLandingHash(storage: Storage = window.sessionStorage): '#/' | '#/admin' | '#/operator' | null {
    try {
      const raw = storage.getItem(TRANSACTION_KEY);
      if (!raw) return null;
      const value = JSON.parse(raw) as Partial<AuthTransaction>;
      return value.landingHash === '#/' || value.landingHash === '#/admin'
        || value.landingHash === '#/operator'
        ? value.landingHash : null;
    } catch {
      return null;
    }
  }

  static hasPendingRedirect(storage: Storage = window.sessionStorage): boolean {
    try {
      const raw = storage.getItem(TRANSACTION_KEY);
      if (!raw) return false;
      const value = JSON.parse(raw) as Partial<AuthTransaction>;
      return typeof value.verifier === 'string' && typeof value.state === 'string'
        && typeof value.createdAt === 'number' && value.stage === 'authorize';
    } catch {
      return false;
    }
  }

  static hasPendingLogout(storage: Storage = window.sessionStorage): boolean {
    try {
      const raw = storage.getItem(TRANSACTION_KEY);
      if (!raw) return false;
      const value = JSON.parse(raw) as Partial<AuthTransaction>;
      return typeof value.verifier === 'string' && typeof value.state === 'string'
        && typeof value.createdAt === 'number' && value.stage === 'logout'
        && Date.now() - value.createdAt >= 0 && Date.now() - value.createdAt <= 5 * 60_000;
    } catch {
      return false;
    }
  }

  clearPendingSignIn(): void {
    this.storage.removeItem(TRANSACTION_KEY);
  }

  signOut(): void {
    this.clear();
    this.storage.removeItem(TRANSACTION_KEY);
    if (!this.isConfigured()) return;
    const logout = new URL('/logout', this.config.domain);
    logout.search = new URLSearchParams({
      client_id: this.config.clientId,
      logout_uri: this.config.redirectUri,
    }).toString();
    this.redirect(logout.toString());
  }

  private readTransaction(): AuthTransaction | null {
    try {
      const raw = this.storage.getItem(TRANSACTION_KEY);
      if (!raw) return null;
      const value = JSON.parse(raw) as Partial<AuthTransaction>;
      if (typeof value.verifier !== 'string' || typeof value.state !== 'string'
        || typeof value.createdAt !== 'number'
        || value.stage !== 'logout' && value.stage !== 'authorize'
        || value.landingHash !== '#/' && value.landingHash !== '#/admin'
          && value.landingHash !== '#/operator') return null;
      return value as AuthTransaction;
    } catch {
      return null;
    }
  }
}

export function cognitoOperatorPoolRoles(accessToken: string, clientId: string): HumanRole[] {
  const claims = decodeClaims(accessToken);
  return claims && claims.token_use === 'access' && claims.client_id === clientId ? ['OPERATOR'] : [];
}

function decodeClaims(accessToken: string): Record<string, unknown> | null {
  try {
    const segments = accessToken.split('.');
    if (segments.length !== 3 || segments.some((segment) => segment.length === 0)) return null;
    const payloadSegment = segments[1];
    if (!payloadSegment || !/^[A-Za-z0-9_-]+$/.test(payloadSegment)) return null;
    const base64 = payloadSegment.replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')),
      (character) => character.charCodeAt(0));
    const claims: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return claims && typeof claims === 'object' ? claims as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export function cognitoHumanRoles(accessToken: string): HumanRole[] {
  try {
    const segments = accessToken.split('.');
    if (segments.length !== 3 || segments.some((segment) => segment.length === 0)) return [];
    const payloadSegment = segments[1];
    if (!payloadSegment || !/^[A-Za-z0-9_-]+$/.test(payloadSegment)) return [];
    const base64 = payloadSegment.replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')),
      (character) => character.charCodeAt(0));
    const claims: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!claims || typeof claims !== 'object') return [];
    const tokenClaims = claims as Record<string, unknown>;
    if (tokenClaims.token_use !== 'access') return [];
    const groups = tokenClaims['cognito:groups'];
    if (!Array.isArray(groups)) return [];
    const roles = new Set(groups.filter((group): group is HumanRole =>
      group === 'OPERATOR' || group === 'ADMIN'));
    return (['ADMIN', 'OPERATOR'] as const).filter((role) => roles.has(role));
  } catch {
    return [];
  }
}

function randomBase64Url(byteCount: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteCount));
  return base64Url(bytes);
}

async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return base64Url(new Uint8Array(digest));
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
