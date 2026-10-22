/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  readonly VITE_WS_URL?: string
  readonly VITE_CAMERA_STREAM_URL?: string
  readonly VITE_COGNITO_DOMAIN?: string
  readonly VITE_COGNITO_CLIENT_ID?: string
  readonly VITE_COGNITO_REDIRECT_URI?: string
  readonly VITE_HANDWASH_CLOUD_MODE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

interface Window {
  __HANDWASH_CONFIG__?: {
    apiBaseUrl?: string
    websocketBaseUrl?: string
    cameraStreamUrl?: string
    cognitoDomain?: string
    cognitoClientId?: string
    cognitoRedirectUri?: string
    cloudMode?: boolean
    /** Opt-in short chime when Java announces a step change or completion. */
    kioskSound?: boolean
  }
}
