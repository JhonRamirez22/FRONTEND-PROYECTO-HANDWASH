import type { AdminAuditApi } from './AdminAuditApi';

export interface ConnectedStation { stationName: string; key: string }

type Api = Pick<AdminAuditApi, 'provisionStation' | 'createApiKey'>;

/** One step for the admin: a station plus a single key that serves both the Mac console and the YOLO PC. */
export async function connectStation(api: Api, token: string, rawName: string): Promise<ConnectedStation> {
  const name = rawName.trim();
  if (!name) throw new Error('Escribe un nombre para el puesto.');
  const station = await api.provisionStation(token, { stationName: name, producerClientId: '', operatorEmails: [] });
  try {
    const created = await api.createApiKey(token, {
      stationId: station.stationId, label: name, scopes: ['CONSOLE', 'PRODUCER'],
    });
    return { stationName: station.stationName, key: created.key };
  } catch (cause) {
    const detail = cause instanceof Error ? ` (${cause.message})` : '';
    throw new Error(`El puesto se creó, pero falta su key${detail}. Ábrela en Avanzado → API keys y crea una con permisos de Consola y PC YOLO.`);
  }
}
