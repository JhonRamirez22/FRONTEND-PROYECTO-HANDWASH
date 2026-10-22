import { evidenceUpload } from '../../src/server/stationBff.js';

export function POST(request: Request): Promise<Response> {
  return evidenceUpload(request);
}
