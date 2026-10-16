# HandWash Cloud UI

## Dirección visual

**Lectura:** estación operativa de baja distracción. El puesto público usa un lienzo claro y legible, con la cámara sobre un escenario oscuro para conservar contraste; la consola autenticada de operador mantiene profundidad oscura. La pantalla pública es pasiva y Java mantiene la autoridad de acceso, secuencia y resultado.

La web conserva React 18, TypeScript, Vite, Tailwind CSS v4 y Lucide ya presentes. No se añade una biblioteca de componentes ni de animación. La UI muestra estados del navegador y respuestas reales de Java; Java mantiene la autoridad de acceso, secuencia y resultado.

## Paleta y contraste

| Token | Valor | Uso |
|---|---|---|
| Petróleo | `#173F52` | Navegación, jerarquía y marca |
| Turquesa | `#18B3AE` | Acento visual e indicador real; no usar con texto blanco pequeño |
| Acción | `#0D6669` | Acciones primarias, texto blanco |
| Fondo | `#F3F8F7` / `#101B21` | Puesto público claro / consola de operador oscura |
| Superficie | `#FFFFFF` / `#17252D` / `#1D3039` | Paneles del puesto / paneles oscuros del operador |
| Texto | `#1B2C33` / `#EDF5F4` | Puesto claro / superficies oscuras |
| Texto secundario | `#53666B` / `#B5C5C8` | Metadatos claros / oscuros |
| Acción oscura | `#0D756F` | Botones primarios con texto blanco |
| Contorno | `#344A54` | Delimitación sutil de controles y superficies |

Contraste verificado para el puesto claro: acción `#0D6669`/blanco **6,73:1**; texto principal/fondo **13,46:1**; secundario/fondo **5,63:1**. La interfaz oscura del operador conserva acción/blanco **5,54:1**, texto/fondo **15,80:1** y secundario/fondo **9,81:1**. Turquesa es acento, no color de texto pequeño. ADMIN conserva superficies de lectura neutras; estados y decisiones se nombran además de distinguirse por color.

## Tipografía, forma y ritmo

- Sistema: `-apple-system`, `BlinkMacSystemFont`, `Avenir Next`, `Segoe UI`, sans-serif. Se conserva la fuente del sistema para lectura operativa y carga inmediata.
- Titulares alineados a la tarea, tamaños moderados y cifras tabulares.
- Superficies delimitadas con borde y radio de 14 px; controles con radio de 9 px e indicadores compactos tipo cápsula. La jerarquía se apoya en contraste y espaciado, no en sombras repetidas.
- Espaciado basado en 4, 8, 12, 16 y 24 px. En escritorio, navegación lateral y panel de trabajo; bajo 820 px la navegación pasa arriba y las secciones se apilan. En 560 px y menos los filtros y listas colapsan a una columna.
- Tema claro en el puesto público para el entorno clínico y lectura a distancia; el video mantiene fondo oscuro. Operador conserva tema oscuro de baja luminancia; ADMIN mantiene tablas claras de alta legibilidad. Sin imágenes externas, grano, parallax ni animación ambiental.

## Componentes y comportamiento

- Puesto `#/`: solo cámara, progreso confirmado por Java y mensajes breves de estado; no presenta botones, formularios, navegación, roles ni acceso ADMIN.
- Operador `#/operator`: Cognito con correo verificado y MFA TOTP; canjea asignación de un solo uso, provisiona físicamente el Mac, autoriza Continuity localmente e inicia/detiene sesiones desde dispositivos asignados.
- ADMIN `#/admin`: emite/revoca códigos y asignaciones, administra estaciones y consulta auditoría. Java impone permisos; ocultar una ruta no se considera seguridad.
- La vista previa local, el enlace WebRTC/RTX, la telemetría real del modelo y el estado confirmado por Java se muestran como etapas distintas. No se simulan conexiones ni detecciones.
- Auditoría: filtros accesibles, tabla con desplazamiento horizontal, estados de carga/vacío/error y registros de solo lectura. No se agregan valores de ejemplo.
- Controles táctiles de al menos 44 px, foco visible, navegación por teclado, selección/caret temáticos, contraste reforzado y `prefers-reduced-motion`.
- Movimiento breve solo para feedback o cambios reales de estado. Se conserva el intercambio CSS del icono de cámara; sin dependencias adicionales ni animación continua de métricas.

## Marca y procedencia del logo

`public/handwash-logo.png` es el archivo PNG entregado por el usuario en `/Users/jhon/Downloads/logo_lavado_manos_yolo.png`. Se copió sin alterar sus píxeles: 2048 × 2048, RGBA con transparencia. SHA-256: `7f32c2b101b212ab619a51ad999f282c520d25e90ffb12665a81545b54cfd32e`. Se usa en acceso, navegación y favicon con `object-fit: contain`; no se recolorea ni se trata como sello de aprobación clínica.

## Límites que la UI debe conservar

- La vista previa Continuity es local. No implica relay WebRTC, transmisión a la RTX ni inferencia YOLO remota.
- El modo actual es no clínico; la interfaz no certifica el protocolo OMS ni convierte una secuencia observada en aprobación.
- No se guardan ni transmiten fotos o video desde la SPA.
- La actualización no se ha desplegado: el nuevo flujo de operador y sus endpoints existen solo en el código fuente local hasta un despliegue posterior aprobado.
- No se guardan ni transmiten fotos o video a AWS; el proyecto sigue siendo un piloto no clínico.

## Método

Impeccable guía dirección y revisión final; Apple Design aporta principios universales de legibilidad, respuesta y accesibilidad; Transitions.dev inspira únicamente la transición CSS del icono. Taste se usa como auditoría ant genérica y no como plantilla de landing, pues esta aplicación es un dashboard. No se copian marcas, componentes ni imágenes externas.

## Separación de superficies — 2026-10-16

El prompt de referencia Halide se usó solo para profundidad oscura y contornos discretos. Se descartaron las imágenes remotas, el parallax, el grano, los números ficticios, el CTA de landing y el scroll decorativo. La cámara del paciente es una superficie pasiva; operador y ADMIN son las únicas superficies de control.

## Referencia Open Design — 2026-10-16

Open Design MCP se usó como referencia visual aislada, no como fuente de datos ni como runtime. Su propuesta separa con claridad cámara, productor RTX, candidato del modelo y estado Java; esa jerarquía se trasladó a `ProcessingPath`, manteniendo los estados que llegan realmente por la sesión. La pantalla de inscripción reduce la marca duplicada y presenta un solo aviso accionable si el servicio no responde; la consola ADMIN usa una tabla con jerarquía compartida. No se copiaron controles, conexiones, cámaras ni resultados simulados del prototipo. El panel distingue vista local de inferencia pendiente y conserva el aviso de piloto no clínico.
