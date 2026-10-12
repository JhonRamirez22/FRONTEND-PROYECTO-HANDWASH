# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

React 18, TypeScript, Vite and Zustand (reused from the existing frontend). Deployment target: Vercel, explicitly requested.

## Users

- Puesto público: a fixed, enrolled station opens and monitors a session without a human account.
- ADMIN: signs in through Cognito/MFA at the unlisted `/#/admin` route, manages station credentials and reviews audit; cannot alter past decisions.
- RTX producer: a separate machine identity, not a human UI role; integration is a later phase.

## Product Purpose

Provide the cloud interface for sessions adjudicated by the Java/Spring backend and show operators the true camera, backend, producer and protocol states.

## Positioning

The UI distinguishes a locally visible camera preview, a producer connection, a model candidate and a Java-confirmed event. It does not decide or claim that a clinical procedure was completed.

## Operating Context

The public kiosk uses the Mac browser over HTTPS and may open Continuity Camera after a click. A station is enrolled once using a one-time code from ADMIN; the credential is held in an HttpOnly cookie by the same-origin Vercel BFF. Cognito Authorization Code + PKCE is restricted to `/#/admin`. The deployed Java API is `https://d2pp4cum59aa17.cloudfront.net`.

## Capabilities and Constraints

- Java alone authorizes roles and decides sequence, timing, infractions and summaries.
- The backend currently reports `DEVELOPMENT` and `clinicalDecisionAllowed=false`.
- Continuity Camera currently has local browser preview only. WebRTC to the RTX PC and YOLO inference are not connected; the UI must say so and never simulate them.
- Admin audit API is read-only. No photos or video are stored or sent to AWS.
- No iPhone app, patient-identification features, clinical approval or complete OMS verification.
- Cognito ADMIN MFA, callback/logout URLs, Vercel BFF environment variables and Java CORS must be verified against the production project before deployment.
- Station provisioning is separate from public navigation; a route hash is not considered secret or an authorization boundary.

## Evidence on Hand

- Existing React implementation: `/Users/jhon/Documents/YOLO/PROYECTO-HAND-WASH-YOLO/frontend` (source path to reuse; not the publishing repository).
- Live API smoke checks: `/actuator/health` is `UP`; deployment status is non-clinical development.
- The source now includes direct browser-to-RTX WebRTC signaling and aggregate producer status. The deployed Vercel build and Windows RTX producer are not yet updated/connected or tested end to end.

## Product Principles

1. Render backend truth; do not recreate business decisions in React.
2. Distinguish preview, candidate, accepted event and verified connection.
3. Fail closed on unknown role, stale session or unavailable API.
4. Collect no image/video or unnecessary personal data.

## Visual Commitments

- The user selected the conventional clinical-dashboard direction deliberately: prioritize familiar navigation, clear status hierarchy, readable sequence and audit tables over a branded metaphor or novelty.
- Craft references: Linear's compact hierarchy and precise status, Notion's calm readable surfaces, and Stripe's clear operational detail. Use these as quality cues only; do not copy their brands, color systems, copy or components.
- The operator view shows the actual flow as three numbered states: local Continuity preview, RTX/YOLO relay pending, and Java REST reachability. It never implies that a camera preview is YOLO inference.
- Use the native system-font stack, 44 px minimum controls, visible keyboard focus, higher-contrast support and reduced-motion support; keep the existing React/Vite stack and avoid a motion dependency.

## Accessibility & Inclusion

Keyboard operation, semantic labels, visible focus, status text not conveyed by color alone, and responsive layout are required.
