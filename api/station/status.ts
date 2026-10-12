import { status } from '../../src/server/stationBff.js';

export function GET(request: Request): Promise<Response> {
  return status(request);
}
