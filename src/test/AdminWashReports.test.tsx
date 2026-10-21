import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminWashReports } from '@/components/AdminWashReports';
import type { WashReportRecord } from '@/lib/AdminAuditApi';

const { auth, washReports } = vi.hoisted(() => ({
  auth: { getAccessToken: vi.fn() },
  washReports: vi.fn(),
}));
vi.mock('@/lib/adminAuth', () => ({ cognitoAdminAuth: auth }));
vi.mock('@/lib/AdminAuditApi', () => ({ AdminAuditApi: class { washReports = washReports; } }));

const NOW = new Date(2026, 9, 21, 15, 30).getTime();
const steps = (validated: number) => ['PASO_1_PALMAS', 'PASO_2_DORSOS', 'PASO_3_INTERDIGITALES',
  'PASO_4_NUDILLOS', 'PASO_5_PULGAR', 'PASO_6_PUNTA_DE_DEDOS'].map((paso, index) => ({
  paso, estado: index < validated ? 'VALIDADO' as const : 'PENDIENTE' as const,
  tiempoAcreditadoMs: index < validated ? 7000 : 0, minimoRequeridoMs: 7000, motivo: null,
}));
function report(overrides: Partial<WashReportRecord>): WashReportRecord {
  return {
    sessionId: '11111111-2222-3333-4444-555555555555', attemptNumber: 1, policyVersion: 'FRICCION_BALANCEADA_V2',
    resultado: 'CORRECTO', motivo: null, inicioEpochMs: NOW - 50_000, finEpochMs: NOW, duracionMs: 50_000,
    lento: false, estadoEvidencia: null, pasos: steps(6), ...overrides,
  };
}

describe('AdminWashReports', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    auth.getAccessToken.mockReturnValue('access-token');
  });

  it('loads the last seven local days and shows exact times, outcome, slow mark and missing steps', async () => {
    washReports.mockResolvedValue([
      report({ lento: true, duracionMs: 64_500 }),
      report({ sessionId: 'abcdef12-0000-0000-0000-000000000000', resultado: 'REPORTADO', motivo: 'HANDS_ABSENT',
        pasos: steps(2), estadoEvidencia: 'DESACTIVADA', duracionMs: 21_000 }),
    ]);
    render(<AdminWashReports onSignOut={vi.fn()} now={() => NOW} />);

    const rows = await screen.findAllByRole('row');
    const [desde, hasta] = [new Date(2026, 9, 15).getTime(), new Date(2026, 9, 22).getTime()];
    expect(washReports).toHaveBeenCalledWith('access-token', { desde, hasta, resultado: null, limit: 100 }, expect.any(AbortSignal));
    expect(within(rows[1]!).getByText('Correcto')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('Lento')).toBeInTheDocument();
    expect(within(rows[1]!).getByText(/64,5 s/)).toBeInTheDocument();
    expect(within(rows[2]!).getByText('Reportado')).toBeInTheDocument();
    expect(within(rows[2]!).getByText(/Faltó: Interdigitales, Nudillos, Pulgar, Punta de dedos/)).toBeInTheDocument();
    expect(within(rows[2]!).getByText('Desactivada')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('1 correctos · 1 reportados · 0 otros');
  });

  it('applies the outcome filter and rejects an inverted date range without calling Java', async () => {
    washReports.mockResolvedValue([]);
    const user = userEvent.setup();
    render(<AdminWashReports onSignOut={vi.fn()} now={() => NOW} />);
    await screen.findByText('No hay lavados finalizados en este rango.');

    await user.selectOptions(screen.getByLabelText('Resultado'), 'REPORTADO');
    await user.click(screen.getByRole('button', { name: /Aplicar/ }));
    expect(washReports).toHaveBeenLastCalledWith('access-token',
      expect.objectContaining({ resultado: 'REPORTADO' }), expect.any(AbortSignal));

    const calls = washReports.mock.calls.length;
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-10-30' } });
    await user.click(screen.getByRole('button', { name: /Aplicar/ }));
    expect(washReports, 'the native max constraint blocks the submit').toHaveBeenCalledTimes(calls);
    fireEvent.submit(screen.getByRole('form', { name: 'Filtrar lavados' }));
    expect(screen.getByRole('alert')).toHaveTextContent('anterior o igual');
    expect(washReports).toHaveBeenCalledTimes(calls);
  });

  it('signs out when the ADMIN session expired', async () => {
    washReports.mockRejectedValue(new Error('Sesión ADMIN vencida. Inicia sesión de nuevo.'));
    const onSignOut = vi.fn();
    render(<AdminWashReports onSignOut={onSignOut} now={() => NOW} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Sesión ADMIN vencida');
    expect(onSignOut).toHaveBeenCalled();
  });
});
