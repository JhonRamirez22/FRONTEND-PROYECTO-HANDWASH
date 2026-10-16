import { operatorTicket } from '../../src/server/stationBff.js';

export function POST(request: Request): Promise<Response> {
  return operatorTicket(request);
}
