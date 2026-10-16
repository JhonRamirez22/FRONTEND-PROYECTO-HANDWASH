## Surface scope

Implementación local del puesto público pasivo `#/`, la consola autenticada `#/operator` y la consola ADMIN `/#/admin`, sobre React 18, TypeScript, Vite y Tailwind CSS v4. Sin despliegue durante esta fase.

## Audience and job

El paciente solo ve video, progreso confirmado por Java y estados breves. El operador canjea su asignación, provisiona la cámara en el Mac y controla sesiones. ADMIN provisiona estaciones, emite/revoca asignaciones y revisa eventos.

## Proof and constraints

- Renderizar solo estados que procedan del navegador, REST, WebSocket o Cognito.
- El navegador muestra una vista previa local. WebRTC con la RTX/YOLO no está conectado hasta demostrar lo contrario.
- Java mantiene autoridad sobre autorización, secuencia y resultado. La interfaz no recalcula reglas.
- No guardar ni transmitir imágenes/video, inventar detecciones, afirmar cumplimiento OMS completo o presentar aprobación clínica.
- Java mantiene autorización, secuencia y resultado; el hash de ruta no es una frontera de seguridad.
- Los nuevos flujos de operador requieren endpoints Java/BFF y persistencia; no tocar reglas de lavado, modelos ni datos.
- No desplegar cambios en AWS ni Vercel.

## Direction contract

### THESIS

Una estación operativa sobria y propia, diseñada alrededor de la cámara y los estados comprobables, no de tarjetas decorativas. El puesto público usa fondo claro para el entorno clínico; la vista de cámara conserva su escenario oscuro para el contraste. El candidato del modelo y el estado recibido de Java deben distinguirse a primera vista.

### OWN-WORLD

Puesto público: fondo `#F3F8F7`, paneles blancos, texto `#1B2C33`, secundario `#53666B`, acción `#0D6669`; escenario de cámara `#11232B`. Operador conserva fondo `#101B21`, paneles `#17252D`/`#1D3039`, texto `#EDF5F4` y acento `#45D0C5`. Sin parallax, grano, imágenes externas ni métricas ficticias. ADMIN conserva tabla neutra y legible.

### STORY

El puesto público es pasivo. El operador ve configuración, cámara local, RTX/YOLO, Java y control de sesión. ADMIN gestiona códigos/estaciones y revisa auditoría sin alterar decisiones.

### FIRST VIEWPORT

El puesto muestra cámara dominante y progreso en escritorio; en móvil apila cámara y pasos. Consolas mantienen estados y controles operables por teclado; en móvil formularios y auditoría se adaptan sin ocultar estados críticos.

### DIALS

`DESIGN_VARIANCE: 3`, `MOTION_INTENSITY: 2`, `VISUAL_DENSITY: 5`. La variación baja favorece previsibilidad; movimiento limitado a feedback de controles e icono; densidad media permite leer estados sin convertir todo en tarjetas.

### SKILL INPUTS

- Impeccable establece dirección y revisión final.
- Taste Skill `design-taste-frontend` se instaló desde el repositorio oficial. Se usa solo como auditoría ant genérica: su guía declara que dashboards y tablas están fuera de alcance.
- Apple Design aporta fundamentos web de jerarquía, feedback, accesibilidad y adaptación; no se imitan materiales nativos.
- Transitions.dev guía la transición CSS existente del icono de cámara. Sin dependencia de animación nueva.

### BRAND ASSET

Usar el PNG proporcionado por el usuario sin alterar en acceso, navegación y favicon. Procedencia y SHA-256 documentados en `DESIGN.md`.

### INTERACTION & ACCESSIBILITY

Mantener los controles en 44px o más, foco visible, operación por teclado, contraste WCAG AA en texto y controles, `prefers-reduced-motion` y adaptación a alto contraste. No cambiar el significado de estados ni añadir acciones decorativas.

FINISH: inspección visual local en escritorio, tablet y móvil, revisión de estados y flujos, pruebas del proyecto y documentación. No commit, push ni despliegue en esta fase.
