import type { AdminAuth } from './AdminAuthPort';
import { CognitoAdminAuthService } from './CognitoAdminAuthService';
import { LocalAdminAuthService } from './LocalAdminAuthService';
import { RuntimeEndpointConfig } from './RuntimeEndpointConfig';

const localAdminLogin = RuntimeEndpointConfig.isLocalAdminLogin();

/** ADMIN: the PC backend's own accounts when the deployment says so, Cognito otherwise. */
export const cognitoAdminAuth: AdminAuth = localAdminLogin
  ? new LocalAdminAuthService(RuntimeEndpointConfig.apiBaseUrl())
  : new CognitoAdminAuthService(RuntimeEndpointConfig.cognitoConfig());
export const localAdminAuth: LocalAdminAuthService | null =
  cognitoAdminAuth instanceof LocalAdminAuthService ? cognitoAdminAuth : null;

const operatorConfig = RuntimeEndpointConfig.operatorCognitoConfig();
const operatorPoolConfigured = Boolean(operatorConfig.domain && operatorConfig.clientId);

/** Operators use their own pool when it is configured; with local ADMIN login they use only API keys. */
export const operatorAuth: AdminAuth = operatorPoolConfigured && !localAdminLogin
  ? new CognitoAdminAuthService(operatorConfig)
  : cognitoAdminAuth;
export const operatorHasOwnPool = operatorPoolConfigured || localAdminLogin;
