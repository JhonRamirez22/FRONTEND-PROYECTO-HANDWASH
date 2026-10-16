import { operatorStopSession } from '../../src/server/stationBff.js';

export function POST(request: Request): Promise<Response> {
  return operatorStopSession(request);
}
