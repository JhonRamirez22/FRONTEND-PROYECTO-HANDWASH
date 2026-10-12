# HandWash cloud frontend

React 18, TypeScript, Vite and Zustand. This repository contains the web client only; Java/Spring and PostgreSQL remain separate services.

## Roles and service boundaries

- The public root is a fixed kiosk: no human login, role badge or ADMIN link. A one-time ADMIN-issued enrollment code registers the station.
- `/#/admin` is an unlisted route for Cognito ADMIN access with required MFA. Each fresh sign-in clears the prior Cognito Hosted UI session first. HandWash keeps access tokens in memory only; `sessionStorage` holds only the short-lived PKCE transaction. Microsoft Authenticator can provide the TOTP factor, but it is not a standalone Cognito login method. Hiding the route is not an authorization control; Spring Boot protects every admin API.
- Cognito may retain its own browser cookie until logout/expiration. The app clears it before every new ADMIN sign-in and on explicit sign-out; it does not persist an application login token across reloads.
- Vercel `/api/station/*` acts as a same-origin BFF. Station and session capabilities stay in `Secure`, `HttpOnly`, `SameSite=Strict` cookies and are never returned to browser JavaScript.
- Only an enrolled station can create a cloud session. Java remains authoritative for authorization, sequence, timing, infractions and summaries.
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

Set these variables in the Vercel project. The first group is public/build-time configuration; the BFF origin values are server-only:

```text
VITE_HANDWASH_CLOUD_MODE=true
VITE_API_URL=https://d2pp4cum59aa17.cloudfront.net
VITE_COGNITO_DOMAIN=<deployed Cognito hosted-login domain>
VITE_COGNITO_CLIENT_ID=<public SPA client ID>
VITE_COGNITO_REDIRECT_URI=https://frontend-proyecto-handwash.vercel.app/
HANDWASH_BACKEND_ORIGIN=https://d2pp4cum59aa17.cloudfront.net
HANDWASH_PUBLIC_ORIGIN=https://frontend-proyecto-handwash.vercel.app
```

Configure the exact callback/logout URL in Cognito and the exact Vercel origin for Java REST/WebSocket CORS. Preview domains are intentionally not allowed. The BFF rejects mutations from any other origin.

ADMIN issues an enrollment code under **Puestos registrados**. It expires after 10 minutes and is single-use. The station redeems it once; daily use is just **Iniciar detección**. If revoked, the station must be enrolled again.

The RTX producer uses a separate machine credential and the v2 contract. This browser app does not receive its client secret or a session token for the producer. The current source negotiates direct WebRTC to RTX and reports aggregate producer telemetry; the deployed Vercel build still needs this update, and no live RTX connection has been verified. No photo is saved; Java receives JSON only, never video.
