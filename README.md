# HandWash cloud frontend

React 18, TypeScript, Vite and Zustand. This repository contains the web client only; Java/Spring and PostgreSQL remain separate services.

## Roles and service boundaries

- `OPERATOR`: live station, Continuity Camera preview on the Mac browser, and Java-confirmed session state.
- `ADMIN`: read-only audit records from the Java API.
- Spring Boot is authoritative for authorization, sequence, timing, infractions and summaries. Cognito group claims guide navigation only.
- The deployed backend currently reports `DEVELOPMENT` with `clinicalDecisionAllowed=false`.
- Continuity preview is local to the browser. WebRTC to the RTX PC and YOLO inference are not connected; the UI must not imply otherwise.
- No photo or video is persisted or uploaded.

## Local development

```sh
npm ci
npm run dev
npm test
npm run build
npm run lint
```

Copy `.env.example` to `.env.local` for local development. Never commit `.env.local` or Cognito secrets. `VITE_COGNITO_CLIENT_ID` is a public SPA client identifier; the producer client secret must never be placed in this repository or Vercel frontend variables.

## Vercel environment

Set these build-time variables for the Vercel project:

```text
VITE_HANDWASH_CLOUD_MODE=true
VITE_API_URL=https://d2pp4cum59aa17.cloudfront.net
VITE_COGNITO_DOMAIN=<deployed Cognito hosted-login domain>
VITE_COGNITO_CLIENT_ID=<public SPA client ID>
VITE_COGNITO_REDIRECT_URI=https://<stable-vercel-project-domain>/
```

The backend currently rejects browser preflight requests from the Vercel origin. Before enabling login, add the exact stable Vercel origin to the Cognito SPA callback/logout URLs and Java REST/WebSocket allowed origins, then redeploy the backend stack. Cognito callback URIs must be registered exactly; preview domains are not implicitly allowed.

The RTX producer uses a separate machine credential and the v2 contract. This browser app does not receive its client secret or a session token for the producer. A secure producer handoff and WebRTC relay remain separate work.
