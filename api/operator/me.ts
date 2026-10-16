import { operatorStatus } from '../../src/server/stationBff.js';

export function GET(request: Request): Promise<Response> {
  return operatorStatus(request);
}
