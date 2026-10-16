# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

React 18, TypeScript, Vite and Zustand (reused from the existing frontend). Deployment target: Vercel, explicitly requested.

## Users

- Paciente: uses the passive `#/` kiosk; it shows only the real video, Java-confirmed progress and short status messages.
- Operador: signs in through Cognito with verified email and required TOTP MFA at `#/operator`; uses a one-time ADMIN-issued, email- and station-bound grant to operate one station.
- ADMIN: signs in at the unlisted `/#/admin` route, manages station provisioning and operator grants, and reviews audit; cannot alter past decisions.
- RTX producer: a separate machine identity, not a human UI role; producer source and browser WebRTC signaling are implemented, but the PC is not enrolled or connected.

## Product Purpose

Provide the cloud interface for sessions adjudicated by the Java/Spring backend and show operators the true camera, backend, producer and protocol states.

## Positioning

The UI distinguishes a locally visible camera preview, a producer connection, a model candidate and a Java-confirmed event. It does not decide or claim that a clinical procedure was completed.

## Operating Context

The patient kiosk on the station Mac reads a browser-authorized Continuity stream but has no controls. An operator provisions the Mac using an ADMIN-issued technical code, then ADMIN issues a separate one-time operator code tied to that station and the operator's verified email. The operator permission remains until ADMIN revokes it. Cognito Authorization Code + PKCE serves `/#/operator` and `/#/admin`; TOTP MFA is required by the Cognito pool configuration. Same-origin Vercel BFF cookies keep station/session capabilities out of JavaScript. The deployed Java API is `https://d2pp4cum59aa17.cloudfront.net`.

## Capabilities and Constraints

- Java alone authorizes roles and decides sequence, timing, infractions and summaries.
- The backend currently reports `DEVELOPMENT` and `clinicalDecisionAllowed=false`.
- Continuity Camera has a local browser preview; deployed WebRTC code can connect it to an enrolled RTX producer, but no peer is currently connected and YOLO inference is unavailable.
- Admin audit API is read-only. No photos or video are stored or sent to AWS.
- No iPhone app, patient-identification features, clinical approval or complete OMS verification.
- Production BFF variables and exact-origin Java CORS are configured and smoke-tested. A real Cognito ADMIN/MFA login, station enrollment and RTX connection remain unverified.
- Station provisioning is separate from public navigation; a route hash is not considered secret or an authorization boundary.
- Public-session creation is denied; only a human Cognito identity with an active Java grant for the assigned station can start or stop.
- This implementation phase is local-only. Java migration/endpoints, Cognito self-sign-up configuration and frontend routes are not deployed to AWS/Vercel by this change.

## Evidence on Hand

- Existing React implementation: `/Users/jhon/Documents/YOLO/PROYECTO-HAND-WASH-YOLO/frontend` (source path to reuse; not the publishing repository).
- Live API smoke checks: `/actuator/health` is `UP`; deployment status is non-clinical development.
- Production Vercel deploy `dpl_GkeVB4vGA1icJKd5zvzYzrxzGeVW` is READY and includes direct browser-to-RTX WebRTC signaling and aggregate producer status. The Windows RTX producer has not been installed; no end-to-end camera/inference test has run.

## Product Principles

1. Render backend truth; do not recreate business decisions in React.
2. Distinguish preview, candidate, accepted event and verified connection.
3. Fail closed on unknown role, stale session or unavailable API.
4. Collect no image/video or unnecessary personal data.

## Visual Commitments

- The user selected the conventional clinical-dashboard direction deliberately: prioritize familiar navigation, clear status hierarchy, readable sequence and audit tables over a branded metaphor or novelty.
- Craft references: Linear's compact hierarchy and precise status, Notion's calm readable surfaces, and Stripe's clear operational detail. Use these as quality cues only; do not copy their brands, color systems, copy or components.
- The operator view separates local Continuity preview, RTX/YOLO relay, model candidate, and Java sequence state. It never implies that a camera preview is YOLO inference or that a model candidate is Java-confirmed.
- Use the native system-font stack, a light patient-kiosk canvas with a dark camera stage, and a dark low-glare operator surface; retain 44 px minimum controls, visible keyboard focus, higher-contrast support and reduced-motion support. Keep the existing React/Vite stack and avoid a motion dependency.
- Keep patient `#/` passive: no buttons, forms, links or role labels; remote operation belongs in the authenticated operator console.

## Accessibility & Inclusion

Keyboard operation, semantic labels, visible focus, status text not conveyed by color alone, and responsive layout are required.
