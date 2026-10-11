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
2. **Cloud objetivo:** el navegador Mac captura Continuity; un relay WebRTC
   pendiente debe enviarlo a la PC RTX. Python/YOLO/OpenCV enviará eventos v2 a
   Java/Spring y React consumirá únicamente los estados confirmados por Java.
3. PostgreSQL/RDS conserva metadatos auditables; el frontend no persiste tokens,
   frames ni video.

## Responsabilidades y límites

- Java es la única fuente de verdad para secuencia, tiempos, infracciones y
  resumen. El frontend no vuelve a calcular reglas.
- En local consume video MJPEG, API REST y WebSocket; nunca ejecuta YOLO.
- En cloud, «Enlazar iPhone» solicita solo una vista previa local de la cámara
  Continuity principal (no FaceTime/Desk View); hasta implementar y validar
  WebRTC debe declarar que no hay transmisión ni inferencia RTX. No simular
  detecciones ni marcar la cámara como conectada al productor.
- Las cuentas humanas usan Cognito PKCE; las operaciones del productor usan la
  credencial de sesión en `X-Session-Token`. El backend aplica los roles; el
  cliente no decide ni simula autorización.
- El stream MJPEG se solicita con el `sessionId` del store; el capturador
  rechaza IDs ausentes o distintos con HTTP 409. Sin sesión activa no montar la
  imagen, para no mostrar un video de otra sesión junto al Stepper.
- Si falta una fuente de video o una conexión, mostrar el estado y cómo
  recuperarlo; no sustituir video real por imágenes simuladas.
- Usar `VITE_API_URL`, `VITE_WS_URL` y `VITE_CAMERA_STREAM_URL` en local. En
  cloud, `window.__HANDWASH_CONFIG__` aporta configuración pública de Cognito y
  modo cloud; nunca incluir secretos en ese archivo.
- Mantener React 18, TypeScript estricto, Vite, Zustand y WebSocket nativo.
- El panel se optimiza para escritorio y debe seguir siendo utilizable en
  pantallas pequeñas.

## Verificación

```bash
npm run build
npm run test
npm run lint
```
