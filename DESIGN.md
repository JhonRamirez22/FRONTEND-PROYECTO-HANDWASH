# HandWash Cloud UI

## Dirección visual

**Lectura:** producto operativo para operadores y administradores, con lenguaje clínico sobrio y estados comprobables. La identidad usa petróleo y turquesa sobre superficies claras; familiar, legible y distinta de un dashboard azul genérico.

La web conserva React 18, TypeScript, Vite, Tailwind CSS v4 y Lucide ya presentes. No se añade una biblioteca de componentes ni de animación. La UI muestra estados del navegador y respuestas reales de Java; Java mantiene la autoridad de acceso, secuencia y resultado.

## Paleta y contraste

| Token | Valor | Uso |
|---|---|---|
| Petróleo | `#173F52` | Navegación, jerarquía y marca |
| Turquesa | `#18B3AE` | Acento visual e indicador real; no usar con texto blanco pequeño |
| Acción | `#0D6669` | Acciones primarias, texto blanco |
| Fondo | `#F3F8F7` | Lienzo de la aplicación |
| Texto | `#1B2C33` | Texto principal |
| Texto secundario | `#53666B` | Instrucciones y metadatos |
| Borde | `#D5E2DF` | Delimitación de controles y superficies |

Contraste verificado para los pares principales: acción/blanco **6,73:1**; texto/fondo **13,46:1**; secundario/fondo **5,63:1**. Turquesa es acento, no color de texto pequeño sobre blanco. Los estados de éxito, advertencia y error tienen tokens y superficies semánticas separados; el texto siempre acompaña al color.

## Tipografía, forma y ritmo

- Sistema: `-apple-system`, `BlinkMacSystemFont`, `Avenir Next`, `Segoe UI`, sans-serif. Se conserva la fuente del sistema para lectura operativa y carga inmediata.
- Titulares alineados a la tarea, tamaños moderados y cifras tabulares.
- Superficies: radio de 14 px. Controles: 9 px. Indicadores compactos: cápsula. Elevación tenue y teñida de petróleo; no se mezclan halos y sombras duras.
- Espaciado basado en 4, 8, 12, 16 y 24 px. En escritorio, navegación lateral y panel de trabajo; bajo 820 px la navegación pasa arriba y las secciones se apilan. En 560 px y menos los filtros y listas colapsan a una columna.
- Tema claro único para esta estación de trabajo, de acuerdo con la paleta aprobada. No imita materiales nativos de Apple.

## Componentes y comportamiento

- Navegación petróleo con área activa legible; el rol solo refleja los permisos recibidos.
- Acceso en dos superficies: autenticación y estado real del servicio. En móvil permanecen visibles los límites de la integración.
- Estación: cámara real y su estado, ruta local/RTX/Java, controles, progreso, eventos y resumen. Una propuesta de modelo se etiqueta como candidata; un paso en curso se distingue como estado recibido de Java.
- Auditoría ADMIN: filtros accesibles, tabla con desplazamiento horizontal, estados de carga/vacío/error y registros de solo lectura. No se agregan valores de ejemplo.
- Controles táctiles de al menos 44 px, foco visible, navegación por teclado, selección/caret temáticos, contraste reforzado y `prefers-reduced-motion`.
- Movimiento breve solo para feedback o cambios reales de estado. Se conserva el intercambio CSS del icono de cámara; sin dependencias adicionales ni animación continua de métricas.

## Marca y procedencia del logo

`public/handwash-logo.png` es el archivo PNG entregado por el usuario en `/Users/jhon/Downloads/logo_lavado_manos_yolo.png`. Se copió sin alterar sus píxeles: 2048 × 2048, RGBA con transparencia. SHA-256: `7f32c2b101b212ab619a51ad999f282c520d25e90ffb12665a81545b54cfd32e`. Se usa en acceso, navegación y favicon con `object-fit: contain`; no se recolorea ni se trata como sello de aprobación clínica.

## Límites que la UI debe conservar

- La vista previa Continuity es local. No implica relay WebRTC, transmisión a la RTX ni inferencia YOLO remota.
- El modo actual es no clínico; la interfaz no certifica el protocolo OMS ni convierte una secuencia observada en aprobación.
- No se guardan ni transmiten fotos o video desde la SPA.
- No cambiar rutas, login Cognito/PKCE, roles, APIs, WebSocket, autorización o reglas de sesión como parte del diseño.

## Método

Impeccable guía dirección y revisión final; Apple Design aporta principios universales de legibilidad, respuesta y accesibilidad; Transitions.dev inspira únicamente la transición CSS del icono. Taste se usa como auditoría ant genérica y no como plantilla de landing, pues esta aplicación es un dashboard. No se copian marcas, componentes ni imágenes externas.
