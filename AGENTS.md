# AGENTS.md — Frontend React/TypeScript HandWash AI

## Alcance

Este directorio contiene el dashboard React/TypeScript para AWS y compatibilidad local.
`scripts/start_handwash_web.sh` conserva el modo local; CloudFront/S3 servirá el
modo web. El iPhone sigue siendo solo cámara: no implementar app iOS ni abrir
la cámara desde un navegador del teléfono. En modo cloud el navegador HTTPS de
la Mac puede solicitar Continuity Camera mediante `getUserMedia`.

El flujo principal es:

1. **Local `station`:** `scripts/run_yolo26_continuity_camera.py` captura Continuity,
   ejecuta YOLO en la Mac, publica MJPEG loopback y envía eventos a Java/Swing.
2. **Cloud:** el navegador Mac captura Continuity y el frontend fuente negocia
   WebRTC directo con la PC RTX. Java solo señaliza; Python/YOLO/OpenCV envía
   eventos v2 y React consume únicamente estados confirmados por Java. La
   versión publicada en Vercel todavía debe actualizarse y probarse.
3. PostgreSQL/RDS conserva metadatos auditables; el frontend no persiste tokens,
   frames ni video.

## Responsabilidades y límites

- Java es la única fuente de verdad para secuencia, tiempos, infracciones y
  resumen. El frontend no vuelve a calcular reglas.
- En local consume video MJPEG, API REST y WebSocket; nunca ejecuta YOLO.
- En cloud, «Enlazar iPhone» solicita Continuity principal (no FaceTime/Desk
  View). El source transmite al RTX solo con una sesión activa y WebRTC
  conectado. El sitio desplegado puede ir detrás del código fuente: no declarar
  inferencia sin telemetría real ni simular detecciones.
- La raíz web cloud es un puesto público sin login ni navegación ADMIN. El
  puesto debe inscribirse con un código de un solo uso emitido por ADMIN; el
  Vercel BFF guarda su credencial y la capacidad de sesión en cookies
  `Secure`/`HttpOnly` y Java valida ambas.
- `/#/admin` es una ruta no enlazada para Cognito PKCE/MFA. Ocultarla no es una
  barrera de seguridad: Java exige ADMIN para auditoría y administración.
  Cognito OPERATOR no inicia sesiones cloud. El frontend no simula autorización.
- El stream MJPEG se solicita con el `sessionId` del store; el capturador
  rechaza IDs ausentes o distintos con HTTP 409. Sin sesión activa no montar la
  imagen, para no mostrar un video de otra sesión junto al Stepper.
- Si falta una fuente de video o una conexión, mostrar el estado y cómo
  recuperarlo; no sustituir video real por imágenes simuladas.
- Usar `VITE_API_URL`, `VITE_WS_URL` y `VITE_CAMERA_STREAM_URL` en local. En
  cloud, `window.__HANDWASH_CONFIG__` aporta configuración pública de Cognito y
  modo cloud. `HANDWASH_BACKEND_ORIGIN` y `HANDWASH_PUBLIC_ORIGIN` son variables
  server-only de Vercel; nunca incluir secretos en `VITE_*` o el bundle.
- Mantener React 18, TypeScript estricto, Vite, Zustand y WebSocket nativo.
- El panel se optimiza para escritorio y debe seguir siendo utilizable en
  pantallas pequeñas.

## Verificación

```bash
npm run build
npm run test
npm run lint
```
