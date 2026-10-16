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

Cloud UI source with passive public kiosk `#/`, authenticated operator `#/operator` and hidden Cognito ADMIN `#/admin`, using the existing React 18/Vite app, Vercel BFF and Java/Spring REST/WSS. This revision is local-only.

## Audience and job

The kiosk shows the real video, Java-confirmed progress and brief status only. Operators enroll the physical Mac, authorize its camera and control sessions. ADMIN issues/revokes operator grants and manages station registration/audit.

## Truth constraints

- Render only real Cognito, backend, WebSocket and browser-camera state.
- Continuity preview is local to the Mac. WebRTC/RTX is shown only when actual telemetry confirms it.
- Show camera preview, RTX/YOLO relay, model candidate and Java session state as separate stages; do not imply that a candidate is Java-confirmed.
- Never show human roles or an admin link on the public kiosk. The unlisted hash route is not a secret; Java API authorization remains authoritative.
- Station credentials and owner capabilities stay in secure HttpOnly cookies behind same-origin Vercel functions, never in the browser bundle or local storage.
- Preserve no-photo/no-video persistence and the non-clinical warning.
- Keep session/decision rules and Java authority unchanged. New operator API/BFF contracts are local additions; do not deploy them here.

## Direction

The public patient kiosk uses a light clinical canvas (`#F3F8F7`), white surfaces, ink (`#1B2C33`) and accessible action teal (`#0D6669`); keep the live camera stage dark (`#11232B`) for image contrast. The operator workflow remains dark/low-glare (`#101B21`, `#17252D`/`#1D3039`, `#EDF5F4`, `#45D0C5`). No parallax, grain, external media, fake metrics or decorative controls. Keep audit tables high-contrast and readable.

## Screen composition

- Public kiosk: no buttons/forms/navigation/roles; only video, Java progress and operational status.
- Operator: `#/operator` Cognito PKCE/MFA, email-bound one-use access code, physical station commissioning, camera authorization, remote start/stop.
- ADMIN: `/#/admin` protected by Java ADMIN role; station/operator code management and audit.
- At 820px or less, stack work areas and move navigation to the top. At 560px or less, filters and connection path use one column.

## Accessibility and motion

Touch targets at least 44px; visible keyboard focus; WCAG AA contrast for body text and controls; `prefers-reduced-motion` and `prefers-contrast: more`. CSS icon swap remains tied to real camera state. No continuous animation of live values.

## Design method

Use Impeccable for finish review, Apple Design foundations for web accessibility, Taste Skill only for anti-generic auditing because dashboards are explicitly out of scope for its layout recipes, and Transitions.dev for the existing CSS icon swap. Logo provenance is in `DESIGN.md`.
