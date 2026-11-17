export interface PreflightInput {
  assigned: boolean;
  cameraLive: boolean;
  shiftActive: boolean;
}

export interface PreflightResult {
  ready: boolean;
  /** The first thing that stops the shift from working; never blames the person washing. */
  message: string;
}

/** Names the single next step so the operator is never left guessing why a shift cannot start. */
export function operatorPreflight(input: PreflightInput): PreflightResult {
  if (!input.assigned) return { ready: false, message: 'Tu cuenta aún no está asignada a un puesto. Pide a ADMIN que la agregue.' };
  if (!input.cameraLive) return { ready: false, message: 'Falta vincular una cámara (el iPhone u otra) en este equipo.' };
  if (input.shiftActive) return { ready: true, message: 'Turno activo: el puesto está evaluando lavados.' };
  return { ready: true, message: 'Todo listo: puedes iniciar el turno. El PC RTX se confirma al abrir la primera sesión.' };
}
