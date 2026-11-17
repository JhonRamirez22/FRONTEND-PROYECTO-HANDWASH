import { describe, expect, it } from 'vitest';
import { describeAgent, type AgentView } from '@/lib/CameraAgent';

const online = (over: Partial<AgentView> = {}): AgentView => ({
  online: true, wanted: true, state: 'ready', device: 'Cámara de iPhone De Jhon', message: '', ...over,
});

describe('describeAgent', () => {
  it('says nothing while the iPhone helper is not requested', () => {
    expect(describeAgent({ agent: online({ wanted: false }), requested: false, waitedMs: 0 })).toBeNull();
  });

  it('tells the operator the helper is connected and what comes next', () => {
    const ready = describeAgent({ agent: online(), requested: true, waitedMs: 3_000 });
    expect(ready?.tone).toBe('ok');
    expect(ready?.text).toMatch(/Inicia el turno/);
    expect(describeAgent({ agent: online({ state: 'streaming' }), requested: true, waitedMs: 5_000 })?.text).toMatch(/Enviando el video del iPhone/);
  });

  it('explains when the Mac helper cannot see the iPhone', () => {
    const view = describeAgent({ agent: online({ state: 'no-iphone' }), requested: true, waitedMs: 5_000 });
    expect(view?.tone).toBe('warn');
    expect(view?.text).toMatch(/desbloquéalo/);
  });

  it('waits a little for the helper, then says how to open it and offers the browser as a fallback', () => {
    const offline = { agent: { ...online(), online: false, state: 'offline' }, requested: true };
    expect(describeAgent({ ...offline, waitedMs: 4_000 })).toMatchObject({ tone: 'wait', browserFallback: false });
    const late = describeAgent({ ...offline, waitedMs: 15_000 });
    expect(late?.tone).toBe('warn');
    expect(late?.text).toMatch(/INICIAR-CAMARA-IPHONE/);
    expect(late?.browserFallback).toBe(true);
  });

  it('shows the helper own error message', () => {
    expect(describeAgent({ agent: online({ state: 'error', message: 'Permiso de cámara denegado' }), requested: true, waitedMs: 5_000 })?.text)
      .toMatch(/Permiso de cámara denegado/);
  });

  it('treats a missing answer as the helper not being there yet', () => {
    expect(describeAgent({ agent: null, requested: true, waitedMs: 20_000 })?.browserFallback).toBe(true);
  });
});
