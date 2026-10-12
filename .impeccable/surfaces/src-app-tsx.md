---
version: 2
slug: "src-app-tsx"
primary_target: "src/App.tsx"
related_targets:
  - "src/components/AppShell.tsx"
  - "src/components/CloudAccessPage.tsx"
  - "src/components/AdminAuditPage.tsx"
  - "src/components/LiveCameraFeed.tsx"
  - "src/components/StepStepper.tsx"
  - "src/index.css"
---

## Surface scope

Cloud operations web UI with a public fixed kiosk and an unlisted Cognito ADMIN console, using the existing React 18/Vite app, Vercel BFF and Java/Spring REST/WSS.

## Audience and job

The kiosk shows real registration, camera, backend and Java-confirmed session state; it requests camera permission only after an explicit start. ADMIN enrolls/revokes stations and reviews encounters, failed attempts, access events and per-session audit without editing decisions.

## Truth constraints

- Render only real Cognito, backend, WebSocket and browser-camera state.
- Continuity preview is local to the Mac. No WebRTC relay or RTX YOLO transmission is implied.
- Keep camera candidate and Java session state visually distinct.
- Never show human roles or an admin link on the public kiosk. The unlisted hash route is not a secret; Java API authorization remains authoritative.
- Station credentials and owner capabilities stay in secure HttpOnly cookies behind same-origin Vercel functions, never in the browser bundle or local storage.
- Preserve no-photo/no-video persistence and the non-clinical warning.
- Keep the six-step/sequence behavior, Cognito PKCE for ADMIN, Java API/WS contract and real camera controls unchanged.

## Direction

Light clinical-operational identity: petroleum `#173F52`, turquoise `#18B3AE` as accent only, action `#0D6669`, canvas `#F3F8F7`, ink `#1B2C33`, secondary `#53666B`. Navigation is dark petroleum; work surfaces remain pale and readable. Surface radius 14px, control radius 9px, pill status. System UI stack. No new visual or animation dependencies.

## Screen composition

- Public kiosk: one-time enrollment when unregistered; otherwise camera and actual processing path remain primary. State clearly that RTX/YOLO inference is not connected.
- ADMIN: sign-in only at `/#/admin`; station management, accessible filters, real loading/empty/error states, audit data and selected event history.
- At 820px or less, stack work areas and move navigation to the top. At 560px or less, filters and connection path use one column.

## Accessibility and motion

Touch targets at least 44px; visible keyboard focus; WCAG AA contrast for body text and controls; `prefers-reduced-motion` and `prefers-contrast: more`. CSS icon swap remains tied to real camera state. No continuous animation of live values.

## Design method

Use Impeccable for finish review, Apple Design foundations for web accessibility, Taste Skill only for anti-generic auditing because dashboards are explicitly out of scope for its layout recipes, and Transitions.dev for the existing CSS icon swap. Logo provenance is in `DESIGN.md`.
