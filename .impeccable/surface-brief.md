## Surface scope

Cloud web app for Operador live sessions and ADMIN audit, built on the existing React 18/Vite frontend and connected to Java/Spring REST/WSS. Mode: Operate.

## Audience and job

The Mac operator signs in with Cognito, checks the Java deployment and local Continuity preview, starts/stops an authorized session, and reads Java-confirmed events. ADMIN signs in and reviews encounters, failed attempts, access events and per-session audit history without editing records.

## Proof and constraints

Render only live API, WebSocket and browser-camera state. Current API status is DEVELOPMENT with clinicalDecisionAllowed=false. The browser preview is local; WebRTC and RTX YOLO are not connected. No video/photo persistence, fabricated detections, full-OMS claim or clinical approval. Spring remains the authorization and decision authority. Vercel's origin currently fails the Java CORS preflight and Cognito callback settings require an exact Vercel origin before login works there.

## Direction contract

### THESIS
Use the clinical-dashboard category convention deliberately: the visitor recognizes where to work immediately. Refuse decorative novelty, dashboard-as-poster, hidden status, and confusing proposed detections with Java decisions.

### OWN-WORLD
The category standard is the commitment: light neutral workspace, dark readable ink, a restrained blue action color, explicit semantic status colors, and standard web typography/components. Use familiar navigation, tables, filters, camera controls and state labels; no governing metaphor or coded vocabulary. Craft references: Linear for compact hierarchy and precise status, Notion for calm readable surfaces, and Stripe for clear operational detail. Borrow only those quality traits; no logos, brand colors, copy, or copied components.

### STORY
Operator sees environment and connection truth, opens the local camera preview, then reads the session sequence as Java confirms it. ADMIN filters and inspects read-only audit records; selection reveals the timeline and coded reasons without changing history.

### FIRST VIEWPORT
At desktop widths, a compact left navigation identifies the role and its available work areas. A page header names the task and shows deployment mode. Operator view: a wide camera/continuity work area beside the six-step friction sequence; “Enlazar iPhone” sits beside the camera state, not in a generic settings menu. A full-width event/result region sits below. Candidate and confirmed states have separate labels. ADMIN view: audit title, filter row, encounter table with real empty/loading/error states; selected encounter events appear in a nearby detail region. On small screens, navigation becomes a labeled top menu and work areas stack without hiding connection or non-clinical status.

### FORM
The user explicitly selected the category-standard “Dashboard clínico estándar” (canon) in the Impeccable direction round; build-path is code-first. Direction seed key: 71b45939. The prior visual thread's assignment is not the chosen form.

### INTERACTION & ACCESSIBILITY
Use Apple platform guidance as web-foundation guidance, not as a native macOS imitation: system font stack, responsive layout, visible focus, semantic labels, high-contrast option, and touch targets of at least 44 px. The operator camera area includes a compact numbered path for local Continuity preview → RTX/YOLO relay (pending) → Java API authority. The `Enlazar iPhone` icon swaps only on its real preview state; follow the Transitions.dev icon-swap pattern with reduced-motion support. Keep the tasteful, low-motion status language suitable for an operational interface.

### DESIGN-SKILL INPUTS
Taste redesign skill: fix clarity and truthful state before decorative polish; preserve the current React stack. Apple Design skill: apply HIG foundations to the responsive web app without copying native navigation or materials. Transitions.dev: use one purposeful CSS-only icon swap; no motion dependency. Impeccable remains the direction and finish-review authority.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
