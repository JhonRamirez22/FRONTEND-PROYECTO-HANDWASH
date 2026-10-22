import { CognitoAdminAuthService } from './CognitoAdminAuthService';
import { RuntimeEndpointConfig } from './RuntimeEndpointConfig';

export const cognitoAdminAuth = new CognitoAdminAuthService(RuntimeEndpointConfig.cognitoConfig());

const operatorConfig = RuntimeEndpointConfig.operatorCognitoConfig();
const operatorPoolConfigured = Boolean(operatorConfig.domain && operatorConfig.clientId);

/** Operators use their own pool when it is configured; otherwise the single-pool flow keeps working. */
export const operatorAuth = operatorPoolConfigured
  ? new CognitoAdminAuthService(operatorConfig)
  : cognitoAdminAuth;
export const operatorHasOwnPool = operatorPoolConfigured;
