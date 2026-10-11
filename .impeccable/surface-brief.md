## Surface scope

Rediseño visual de la web operativa HandWash para cloud, construido sobre React 18, TypeScript, Vite y Tailwind CSS v4. Las pantallas cubiertas son acceso, estación del operador y auditoría ADMIN.

## Audience and job

El operador valida configuración, enlaza la vista previa local de Continuity, inicia o finaliza una sesión autorizada y lee el progreso recibido de Java. ADMIN filtra encuentros y consulta eventos en modo de solo lectura.

## Proof and constraints

- Renderizar solo estados que procedan del navegador, REST, WebSocket o Cognito.
- El navegador muestra una vista previa local. WebRTC con la RTX/YOLO no está conectado hasta demostrar lo contrario.
- Java mantiene autoridad sobre autorización, secuencia y resultado. La interfaz no recalcula reglas.
- No guardar ni transmitir imágenes/video, inventar detecciones, afirmar cumplimiento OMS completo o presentar aprobación clínica.
- Mantener rutas, contratos API/WS, login PKCE, roles, controles de cámara y estados funcionales.
- No cambiar backend, AWS, datos ni modelos como parte del rediseño.

## Direction contract

### THESIS

Una estación operativa sobria y propia, diseñada alrededor de la cámara y los estados comprobables, no de tarjetas decorativas. El candidato del modelo y el estado recibido de Java deben distinguirse a primera vista.

### OWN-WORLD

Petróleo `#173F52`, acción accesible `#0D6669`, turquesa `#18B3AE` como acento, lienzo `#F3F8F7`, tinta `#1B2C33` y secundario `#53666B`. Tema claro fijo. Superficies con radio 14px, controles 9px e indicadores cápsula. No usar texto blanco pequeño sobre turquesa.

### STORY

Acceso muestra estado de configuración y rol. Operador ve primero cámara y progreso, luego controles y eventos. ADMIN filtra y revisa auditoría; seleccionar un encuentro revela su detalle sin modificar datos.

### FIRST VIEWPORT

En escritorio, navegación petróleo compacta; estación con cámara dominante, ruta local/RTX/Java y progreso visible. ADMIN comienza con título, contexto, filtros y tabla. A menos de 820px la navegación pasa arriba y el contenido se apila; a menos de 560px entradas y controles ocupan una columna y se conserva el estado no clínico.

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

FINISH: inspección visual real en escritorio, tablet y móvil, revisión de estados y flujos, pruebas de proyecto, documentación, commit, push y despliegue Vercel autorizado.
