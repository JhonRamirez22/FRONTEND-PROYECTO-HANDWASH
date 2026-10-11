import { RuntimeEndpointConfig } from './RuntimeEndpointConfig';

const DEPLOYMENT_STATUS_TIMEOUT_MS = 5_000;

export type DeploymentMode = 'DEVELOPMENT' | 'NON_CLINICAL_DEMO' | 'HOSPITAL_PILOT' | 'UNVERIFIED';

export interface DeploymentStatus {
  mode: DeploymentMode;
  /** Only a verified, explicitly authorized release may set this to true. */
  clinicalDecisionAllowed: boolean;
  notice: string;
}

const fallbackStatus: DeploymentStatus = {
  mode: 'UNVERIFIED',
  clinicalDecisionAllowed: false,
  notice: 'No se pudo verificar el modo del servidor. No usar para decisiones ni registros clínicos.',
};

const checkingStatus: DeploymentStatus = {
  mode: 'UNVERIFIED',
  clinicalDecisionAllowed: false,
  notice: 'Verificando el modo operativo. No tomar decisiones clínicas hasta confirmarlo.',
};

/** Reads the backend's live mode; never infers release status from the static frontend build. */
export class DeploymentStatusService {
  async load(signal?: AbortSignal): Promise<DeploymentStatus> {
    const requestController = new AbortController();
    const timeout = setTimeout(
      () => requestController.abort(new Error('deployment status request timed out')),
      DEPLOYMENT_STATUS_TIMEOUT_MS
    );
    const abortFromCaller = () => requestController.abort(signal?.reason);
    if (signal?.aborted) abortFromCaller();
    else signal?.addEventListener('abort', abortFromCaller, { once: true });

    try {
      const response = await fetch(
        `${RuntimeEndpointConfig.apiBaseUrl()}/api/v1/deployment/status`,
        {
          cache: 'no-store',
          headers: { Accept: 'application/json' },
          signal: requestController.signal,
        }
      );
      this.throwIfAborted(requestController.signal);
      if (!response.ok) throw new Error(`deployment status request failed: ${response.status}`);

      const payload: unknown = await response.json();
      this.throwIfAborted(requestController.signal);
      if (!this.isStatus(payload)) throw new Error('deployment status response is invalid');
      return payload;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abortFromCaller);
    }
  }

  static unverified(): DeploymentStatus {
    return fallbackStatus;
  }

  static checking(): DeploymentStatus {
    return checkingStatus;
  }

  private isStatus(value: unknown): value is DeploymentStatus {
    if (!value || typeof value !== 'object') return false;
    const status = value as Record<string, unknown>;
    return (status.mode === 'DEVELOPMENT'
        || status.mode === 'NON_CLINICAL_DEMO'
        || status.mode === 'HOSPITAL_PILOT')
      && status.clinicalDecisionAllowed === false
      && typeof status.notice === 'string'
      && status.notice.trim().length > 0;
  }

  private throwIfAborted(signal: AbortSignal): void {
    if (signal.aborted) {
      throw signal.reason instanceof Error
        ? signal.reason
        : new Error('deployment status request was cancelled');
    }
  }
}
