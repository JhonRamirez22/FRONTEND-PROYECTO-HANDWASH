/** Resolves local-development and packaged-station endpoints in one place. */
export class RuntimeEndpointConfig {
  static isCloudMode(): boolean {
    return import.meta.env.VITE_HANDWASH_CLOUD_MODE?.trim().toLowerCase() === 'true'
      || window.__HANDWASH_CONFIG__?.cloudMode === true;
  }

  static cognitoConfig(): { domain: string; clientId: string; redirectUri: string } {
    const runtime = window.__HANDWASH_CONFIG__;
    return {
      domain: import.meta.env.VITE_COGNITO_DOMAIN?.trim() || runtime?.cognitoDomain?.trim() || '',
      clientId: import.meta.env.VITE_COGNITO_CLIENT_ID?.trim() || runtime?.cognitoClientId?.trim() || '',
      redirectUri: import.meta.env.VITE_COGNITO_REDIRECT_URI?.trim()
        || runtime?.cognitoRedirectUri?.trim() || '',
    };
  }

  /** Operators sign in through their own Cognito pool (no MFA); empty until that pool is configured. */
  static operatorCognitoConfig(): { domain: string; clientId: string; redirectUri: string; operatorPool: true } {
    const runtime = window.__HANDWASH_CONFIG__;
    return {
      domain: import.meta.env.VITE_OPERATOR_COGNITO_DOMAIN?.trim() || runtime?.operatorCognitoDomain?.trim() || '',
      clientId: import.meta.env.VITE_OPERATOR_COGNITO_CLIENT_ID?.trim()
        || runtime?.operatorCognitoClientId?.trim() || '',
      redirectUri: this.cognitoConfig().redirectUri,
      operatorPool: true,
    };
  }

  static apiBaseUrl(): string {
    const configured = import.meta.env.VITE_API_URL?.trim();
    if (configured) return this.withoutTrailingSlash(configured);
    const runtimeEndpoint = window.__HANDWASH_CONFIG__?.apiBaseUrl?.trim();
    if (runtimeEndpoint) return this.withoutTrailingSlash(runtimeEndpoint);
    return import.meta.env.DEV ? 'http://127.0.0.1:8080' : window.location.origin;
  }

  static websocketBaseUrl(): string {
    const configured = import.meta.env.VITE_WS_URL?.trim();
    if (configured) return this.withoutTrailingSlash(configured);
    const runtimeEndpoint = window.__HANDWASH_CONFIG__?.websocketBaseUrl?.trim();
    if (runtimeEndpoint) return this.withoutTrailingSlash(runtimeEndpoint);
    if (import.meta.env.DEV) return 'ws://127.0.0.1:8080';

    const endpoint = new URL(this.apiBaseUrl(), window.location.origin);
    endpoint.protocol = endpoint.protocol === 'https:' ? 'wss:' : 'ws:';
    return endpoint.origin;
  }

  static cameraStreamUrl(): string {
    const configured = import.meta.env.VITE_CAMERA_STREAM_URL?.trim();
    const runtimeEndpoint = window.__HANDWASH_CONFIG__?.cameraStreamUrl?.trim();
    return this.withoutTrailingSlash(configured || runtimeEndpoint || 'http://127.0.0.1:8091/video.mjpg');
  }

  private static withoutTrailingSlash(value: string): string {
    return value.replace(/\/+$/, '');
  }
}
