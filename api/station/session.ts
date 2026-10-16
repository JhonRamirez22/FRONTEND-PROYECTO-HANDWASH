import { startSession } from '../../src/server/stationBff.js';

export function POST(request: Request): Promise<Response> {
  void request;
  return startSession();
}
