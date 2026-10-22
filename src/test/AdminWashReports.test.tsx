import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminWashReports } from '@/components/AdminWashReports';
import type { WashReportRecord } from '@/lib/AdminAuditApi';

const { auth, washReports, evidenceSettings, setEvidenceEnabled, evidencePhoto } = vi.hoisted(() => ({
  auth: { getAccessToken: vi.fn() },
  washReports: vi.fn(),
  evidenceSettings: vi.fn(),
  setEvidenceEnabled: vi.fn(),
  evidencePhoto: vi.fn(),
}));
vi.mock('@/lib/adminAuth', () => ({ cognitoAdminAuth: auth }));
vi.mock('@/lib/AdminAuditApi', () => ({ AdminAuditApi: class { washReports = washReports; evidenceSettings = evidenceSettings; setEvidenceEnabled = setEvidenceEnabled; evidencePhoto = evidencePhoto; } }));

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

const settings = (overrides: Record<string, unknown>) => ({
  deploymentEnabled: true, configured: true, switchOn: false, captureActive: false, retentionDays: 30,
  updatedBy: 'SYSTEM', updatedAtEpochMs: 0, ...overrides,
});

describe('AdminWashReports', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    auth.getAccessToken.mockReturnValue('access-token');
    evidenceSettings.mockResolvedValue(settings({}));
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

  it('opens a captured photo through the audited endpoint and revokes the object URL on close', async () => {
    washReports.mockResolvedValue([report({ resultado: 'REPORTADO', motivo: 'HANDS_ABSENT', pasos: steps(2),
      estadoEvidencia: 'CAPTURADA' })]);
    evidencePhoto.mockResolvedValue(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }));
    const create = vi.fn(() => 'blob:photo');
    const revoke = vi.fn();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke }));
    const user = userEvent.setup();
    render(<AdminWashReports onSignOut={vi.fn()} now={() => NOW} />);

    await user.click(await screen.findByRole('button', { name: /Ver foto/ }));

    expect(evidencePhoto).toHaveBeenCalledWith('access-token', '11111111-2222-3333-4444-555555555555', 1);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAttribute('src', 'blob:photo');
    await user.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(revoke).toHaveBeenCalledWith('blob:photo');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows no photo button for other states and explains expired photos', async () => {
    washReports.mockResolvedValue([
      report({ resultado: 'REPORTADO', estadoEvidencia: 'EXPIRADA', pasos: steps(2) }),
      report({ sessionId: 'abcdef12-0000-0000-0000-000000000000', resultado: 'REPORTADO', estadoEvidencia: 'NO_CAPTURADA', pasos: steps(2) }),
    ]);
    render(<AdminWashReports onSignOut={vi.fn()} now={() => NOW} />);

    expect(await screen.findByText('Venció (30 días)')).toBeInTheDocument();
    expect(screen.getByText('No capturada')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ver foto/ })).not.toBeInTheDocument();
  });

  it('turns the capture switch on and off from the ADMIN panel', async () => {
    washReports.mockResolvedValue([]);
    setEvidenceEnabled.mockResolvedValueOnce(settings({ switchOn: true, captureActive: true }))
      .mockResolvedValueOnce(settings({}));
    const user = userEvent.setup();
    render(<AdminWashReports onSignOut={vi.fn()} now={() => NOW} />);

    expect(await screen.findByText(/Foto de lavados reportados: apagada/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Encender captura' }));
    expect(setEvidenceEnabled).toHaveBeenLastCalledWith('access-token', true);
    expect(await screen.findByText(/Foto de lavados reportados: activa/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Apagar captura' }));
    expect(setEvidenceEnabled).toHaveBeenLastCalledWith('access-token', false);
    expect(await screen.findByText(/Foto de lavados reportados: apagada/)).toBeInTheDocument();
  });

  it('cannot switch on when the deployment does not allow photos', async () => {
    washReports.mockResolvedValue([]);
    evidenceSettings.mockResolvedValue(settings({ deploymentEnabled: false, configured: false }));
    render(<AdminWashReports onSignOut={vi.fn()} now={() => NOW} />);

    expect(await screen.findByRole('button', { name: 'Encender captura' })).toBeDisabled();
  });
});
