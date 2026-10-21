import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminWashTrends } from '@/components/AdminWashTrends';
import type { TrendBucket, WashTrends } from '@/lib/AdminAuditApi';

const { auth, washTrends, washCsv } = vi.hoisted(() => ({ auth: { getAccessToken: vi.fn() }, washTrends: vi.fn(), washCsv: vi.fn() }));
vi.mock('@/lib/adminAuth', () => ({ cognitoAdminAuth: auth }));
vi.mock('@/lib/AdminAuditApi', () => ({ AdminAuditApi: class { washTrends = washTrends; washCsv = washCsv; } }));

const NOW = new Date(2026, 9, 21, 15, 0).getTime();
const bucket = (o: Partial<TrendBucket>): TrendBucket => ({ total: 0, correctos: 0, reportados: 0, reiniciados: 0, interrumpidos: 0,
  lentos: 0, duracionMediaCorrectosMs: null, porcentajeCorrectos: null, ...o });
const trends = (): WashTrends => ({
  zonaHoraria: 'America/Bogota',
  total: bucket({ total: 7, correctos: 3, reportados: 1, interrumpidos: 2, reiniciados: 1, porcentajeCorrectos: 75, duracionMediaCorrectosMs: 52_000 }),
  dias: [{ fecha: '2026-10-20', metricas: bucket({ total: 4, correctos: 2, reportados: 1, interrumpidos: 1, porcentajeCorrectos: 66.7, duracionMediaCorrectosMs: 50_000 }) },
    { fecha: '2026-10-21', metricas: bucket({ total: 3, correctos: 1, reportados: 0, interrumpidos: 1, reiniciados: 1, porcentajeCorrectos: 100, duracionMediaCorrectosMs: 56_000 }) }],
  turnos: { MANANA: bucket({ total: 5, correctos: 3, porcentajeCorrectos: 100 }), TARDE: bucket({ total: 2, reportados: 1, porcentajeCorrectos: 0 }), NOCHE: bucket({}) },
  movimientosOmitidosEnReportados: { PASO_1_PALMAS: 0, PASO_2_DORSOS: 0, PASO_3_INTERDIGITALES: 1, PASO_6_PUNTA_DE_DEDOS: 3 },
});

describe('AdminWashTrends', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    auth.getAccessToken.mockReturnValue('access-token');
    washTrends.mockResolvedValue(trends());
  });

  it('loads the last seven local days and explains how the percentage is computed', async () => {
    render(<AdminWashTrends onSignOut={vi.fn()} now={() => NOW} />);

    expect(await screen.findByRole('status')).toHaveTextContent('75 % de lavados correctos (3 de 4 atribuibles)');
    expect(washTrends).toHaveBeenCalledWith('access-token', new Date(2026, 9, 15).getTime(), new Date(2026, 9, 22).getTime(), expect.any(AbortSignal));
    expect(screen.getByText(/fallas técnicas y\s*reinicios nunca cuentan en su contra/)).toBeInTheDocument();
  });

  it('shows days, shifts and the movements people skip most', async () => {
    render(<AdminWashTrends onSignOut={vi.fn()} now={() => NOW} />);

    const mañana = (await screen.findByRole('rowheader', { name: 'Mañana (06–14)' })).closest('tr')!;
    expect(within(mañana).getByText('100 %', { selector: 'td' })).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: 'Noche (22–06)' }).closest('tr')).toHaveTextContent('—');
    const list = screen.getByRole('list');
    expect(within(list).getByText('Punta de dedos').closest('li')).toHaveTextContent('3');
  });

  it('downloads the anonymous CSV with the server file name', async () => {
    washCsv.mockResolvedValue({ blob: new Blob(['x']), filename: 'handwash-lavados-20261015_20261021.csv' });
    const create = vi.fn(() => 'blob:csv');
    const revoke = vi.fn();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const user = userEvent.setup();
    render(<AdminWashTrends onSignOut={vi.fn()} now={() => NOW} />);

    await user.click(await screen.findByRole('button', { name: /Descargar CSV/ }));

    expect(washCsv).toHaveBeenCalledWith('access-token', new Date(2026, 9, 15).getTime(), new Date(2026, 9, 22).getTime());
    expect(click).toHaveBeenCalled();
    expect(revoke).toHaveBeenCalledWith('blob:csv');
    click.mockRestore();
  });

  it('rejects an inverted or too wide range without calling Java', async () => {
    render(<AdminWashTrends onSignOut={vi.fn()} now={() => NOW} />);
    await screen.findByRole('status');
    const calls = washTrends.mock.calls.length;

    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-09-01' } });
    fireEvent.submit(screen.getByRole('form', { name: 'Rango de tendencias' })); // native validation is bypassed on purpose

    expect(await screen.findByRole('alert')).toHaveTextContent('anterior o igual');
    expect(washTrends).toHaveBeenCalledTimes(calls);
  });

  it('says so when there are no washes and signs out on an expired session', async () => {
    washTrends.mockResolvedValueOnce({ ...trends(), total: bucket({}), dias: [] });
    const { unmount } = render(<AdminWashTrends onSignOut={vi.fn()} now={() => NOW} />);
    expect(await screen.findByText('No hay lavados finalizados en este rango.')).toBeInTheDocument();
    unmount();

    washTrends.mockRejectedValueOnce(new Error('Sesión ADMIN vencida. Inicia sesión de nuevo.'));
    const onSignOut = vi.fn();
    render(<AdminWashTrends onSignOut={onSignOut} now={() => NOW} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Sesión ADMIN vencida');
    expect(onSignOut).toHaveBeenCalled();
  });
});
