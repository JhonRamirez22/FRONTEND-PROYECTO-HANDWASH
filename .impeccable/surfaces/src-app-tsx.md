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

Cloud operations web UI for OPERATOR live sessions and ADMIN read-only audit, using the existing React 18/Vite app and Java/Spring REST/WSS.

## Audience and job

The operator checks environment/API state, previews Continuity locally, manages an authorized session and reads Java-confirmed progress. ADMIN reviews encounters, failed attempts, access events and per-session audit without editing records.

## Truth constraints

- Render only real Cognito, backend, WebSocket and browser-camera state.
- Continuity preview is local to the Mac. No WebRTC relay or RTX YOLO transmission is implied.
- Keep camera candidate and Java session state visually distinct.
- Preserve no-photo/no-video persistence and the non-clinical warning.
- Keep the route structure, role behavior, Cognito PKCE, API/WS contracts and camera controls unchanged.

## Direction

Light clinical-operational identity: petroleum `#173F52`, turquoise `#18B3AE` as accent only, action `#0D6669`, canvas `#F3F8F7`, ink `#1B2C33`, secondary `#53666B`. Navigation is dark petroleum; work surfaces remain pale and readable. Surface radius 14px, control radius 9px, pill status. System UI stack. No new visual or animation dependencies.

## Screen composition

- Access: sign-in and actual service status beside a petroleum panel that states the integration limits. Keep the limits visible on mobile.
- Operator: camera and processing path are the primary work area; show a model proposal separately from Java progress; controls, events and summary remain available.
- ADMIN: title, read-only context, accessible filters, real loading/empty/error states, horizontally navigable audit data and selected event history.
- At 820px or less, stack work areas and move navigation to the top. At 560px or less, filters and connection path use one column.

## Accessibility and motion

Touch targets at least 44px; visible keyboard focus; WCAG AA contrast for body text and controls; `prefers-reduced-motion` and `prefers-contrast: more`. CSS icon swap remains tied to real camera state. No continuous animation of live values.

## Design method

Use Impeccable for finish review, Apple Design foundations for web accessibility, Taste Skill only for anti-generic auditing because dashboards are explicitly out of scope for its layout recipes, and Transitions.dev for the existing CSS icon swap. Logo provenance is in `DESIGN.md`.
