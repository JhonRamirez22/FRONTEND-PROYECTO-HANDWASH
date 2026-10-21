import {
  operatorClaim,
  operatorShiftStart,
  operatorShiftStatus,
  operatorShiftStop,
  operatorStartSession,
  operatorStatus,
  operatorStopSession,
  operatorTicket,
} from '../src/server/stationBff.js';

type Method = 'GET' | 'POST';
type Handler = (request: Request) => Promise<Response>;

const routes: Record<string, Partial<Record<Method, Handler>>> = {
  claim: { POST: operatorClaim },
  me: { GET: operatorStatus },
  session: { POST: operatorStartSession },
  shift: { GET: operatorShiftStatus, POST: operatorShiftStart },
  'shift-stop': { POST: operatorShiftStop },
  stop: { POST: operatorStopSession },
  ticket: { POST: operatorTicket },
};

function dispatch(request: Request, method: Method): Promise<Response> {
  const actions = new URL(request.url).searchParams.getAll('action');
  const action = actions[0];
  if (actions.length !== 1 || action === undefined
    || !Object.prototype.hasOwnProperty.call(routes, action)) {
    return Promise.resolve(Response.json({ code: 'NOT_FOUND' }, { status: 404 }));
  }

  const route = routes[action];
  if (!route) return Promise.resolve(Response.json({ code: 'NOT_FOUND' }, { status: 404 }));
  const handler = route[method];
  if (!handler) {
    const allowed = Object.keys(route).join(', ');
    return Promise.resolve(Response.json({ code: 'METHOD_NOT_ALLOWED' }, {
      status: 405,
      headers: { Allow: allowed },
    }));
  }
  return handler(request);
}

export function GET(request: Request): Promise<Response> {
  return dispatch(request, 'GET');
}

export function POST(request: Request): Promise<Response> {
  return dispatch(request, 'POST');
}
