import { CognitoAdminAuthService } from './CognitoAdminAuthService';
import { RuntimeEndpointConfig } from './RuntimeEndpointConfig';

export const cognitoAdminAuth = new CognitoAdminAuthService(RuntimeEndpointConfig.cognitoConfig());
