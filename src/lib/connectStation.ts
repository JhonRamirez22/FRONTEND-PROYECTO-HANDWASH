import type { AdminAuditApi } from './AdminAuditApi';

export interface ConnectedStation { stationId: string; stationName: string }

type Api = Pick<AdminAuditApi, 'provisionStation'>;

/** One step for the admin: create the station. Its Mac and phones open a link; the PC with YOLO pairs itself. */
export async function connectStation(api: Api, token: string, rawName: string): Promise<ConnectedStation> {
  const name = rawName.trim();
  if (!name) throw new Error('Escribe un nombre para el puesto.');
  const station = await api.provisionStation(token, { stationName: name, producerClientId: '', operatorEmails: [] });
  return { stationId: station.stationId, stationName: station.stationName };
}
