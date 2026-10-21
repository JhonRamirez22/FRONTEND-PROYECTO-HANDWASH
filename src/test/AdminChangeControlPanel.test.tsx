import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminChangeControlPanel } from '@/components/AdminChangeControlPanel';
import type { ChangeControlOverview, ProfileChange } from '@/lib/AdminAuditApi';

const { auth, changeControl, revertProfile, decideProfile, setSecondApprover, registerValidationReport } = vi.hoisted(() => ({
  auth: { getAccessToken: vi.fn() }, changeControl: vi.fn(), revertProfile: vi.fn(), decideProfile: vi.fn(),
  setSecondApprover: vi.fn(), registerValidationReport: vi.fn(),
}));
vi.mock('@/lib/adminAuth', () => ({ cognitoAdminAuth: auth }));
vi.mock('@/lib/AdminAuditApi', () => ({ AdminAuditApi: class {
  changeControl = changeControl; revertProfile = revertProfile; decideProfile = decideProfile;
  setSecondApprover = setSecondApprover; registerValidationReport = registerValidationReport;
} }));

const change = (version: number, estado: ProfileChange['estado'], extra: Partial<ProfileChange> = {}): ProfileChange => ({
  perfil: { version, tiemposPasoMs: {}, duracionTotalMs: 42_000, umbralLentoMs: 60_000, creadoPor: version === 1 ? 'SYSTEM' : 'admin-aaaa-1111', creadoEnEpochMs: 1_792_000_000_000 + version },
  motivo: version === 1 ? 'Perfil inicial del proyecto' : `Motivo de la versión ${version}`, revertidoDe: null, estado,
  decididoPor: null, decididoEnEpochMs: null, conInformeDeValidacion: version === 1, ...extra,
});
const overview = (extra: Partial<ChangeControlOverview> = {}): ChangeControlOverview => ({
  ajustes: { secondApproverRequired: false, updatedBy: 'SYSTEM', updatedAtEpochMs: 0 },
  vigente: change(2, 'ACTIVE'),
  cambios: [change(3, 'PENDING'), change(2, 'ACTIVE'), change(1, 'ACTIVE')],
  modelos: [
    { model: { modelSha256: 'a'.repeat(64), modelVersion: 'yolo26n_7pasos', datasetVersion: 'ds-1', firstSeenEpochMs: 1, lastSeenEpochMs: 2, encounters: 12, reports: 0 }, evidencia: 'SIN_EVIDENCIA' },
    { model: { modelSha256: 'b'.repeat(64), modelVersion: 'yolo26s', datasetVersion: 'ds-2', firstSeenEpochMs: 1, lastSeenEpochMs: 2, encounters: 3, reports: 1 }, evidencia: 'CON_INFORME' },
  ],
  informes: [], ...extra,
});

describe('AdminChangeControlPanel', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    auth.getAccessToken.mockReturnValue('access-token');
    changeControl.mockResolvedValue(overview());
  });

  it('shows versions with reason and state, the one in force, and models without evidence', async () => {
    render(<AdminChangeControlPanel onSignOut={vi.fn()} />);

    expect(await screen.findByText('Control de cambios')).toBeInTheDocument();
    expect(screen.getByText(/v2/).closest('tr')).toHaveTextContent('vigente');
    expect(screen.getByText('Motivo de la versión 3').closest('tr')).toHaveTextContent('Pendiente de aprobación');
    const rows = screen.getAllByRole('row');
    expect(within(rows.find((row) => row.textContent?.includes('yolo26n_7pasos'))!).getByText('Sin evidencia')).toBeInTheDocument();
    expect(within(rows.find((row) => row.textContent?.includes('yolo26s'))!).getByText('Con informe')).toBeInTheDocument();
    expect(screen.getByText(/no aprueba el modelo/)).toBeInTheDocument();
  });

  it('requires a reason before rolling back and refreshes afterwards', async () => {
    revertProfile.mockResolvedValue(change(4, 'ACTIVE', { revertidoDe: 1 }));
    const user = userEvent.setup();
    render(<AdminChangeControlPanel onSignOut={vi.fn()} />);

    await user.click(await screen.findByRole('button', { name: /Revertir a v1/ }));
    await user.type(screen.getByLabelText(/Motivo de la reversión a v1/), 'Los 8 s alargaban el lavado');
    await user.click(screen.getByRole('button', { name: 'Confirmar reversión' }));

    expect(revertProfile).toHaveBeenCalledWith('access-token', 1, 'Los 8 s alargaban el lavado');
    expect(changeControl).toHaveBeenCalledTimes(2);
    expect(screen.queryByLabelText(/Motivo de la reversión/)).not.toBeInTheDocument();
  });

  it('approves or rejects a pending version and explains a refusal in plain language', async () => {
    decideProfile.mockRejectedValueOnce(new Error('SE_REQUIERE_OTRO_ADMIN')).mockResolvedValueOnce(change(3, 'ACTIVE'));
    const user = userEvent.setup();
    render(<AdminChangeControlPanel onSignOut={vi.fn()} />);

    await user.click(await screen.findByRole('button', { name: 'Aprobar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Otro ADMIN debe aprobar este cambio.');
    await user.click(screen.getByRole('button', { name: 'Rechazar' }));
    expect(decideProfile).toHaveBeenLastCalledWith('access-token', 3, 'reject');
  });

  it('toggles the second approver and registers a validation report for a model', async () => {
    registerValidationReport.mockResolvedValue({});
    const user = userEvent.setup();
    render(<AdminChangeControlPanel onSignOut={vi.fn()} />);

    await user.click(await screen.findByRole('button', { name: 'Exigir segundo aprobador' }));
    expect(setSecondApprover).toHaveBeenCalledWith('access-token', true);

    await user.selectOptions(screen.getByLabelText('Modelo'), 'a'.repeat(64));
    await user.type(screen.getByLabelText('Título'), 'Validación F5');
    await user.type(screen.getByLabelText('Resumen de resultados'), '10 personas x 5 lavados, sensibilidad 0,93');
    await user.type(screen.getByLabelText('SHA-256 del documento'), 'd'.repeat(64));
    await user.click(screen.getByRole('button', { name: 'Registrar informe' }));

    expect(registerValidationReport).toHaveBeenCalledWith('access-token', {
      modeloSha256: 'a'.repeat(64), versionPerfil: null, titulo: 'Validación F5',
      resumen: '10 personas x 5 lavados, sensibilidad 0,93', documentoSha256: 'd'.repeat(64),
    });
  });

  it('signs out when the ADMIN session expired', async () => {
    changeControl.mockRejectedValue(new Error('Sesión ADMIN vencida. Inicia sesión de nuevo.'));
    const onSignOut = vi.fn();
    render(<AdminChangeControlPanel onSignOut={onSignOut} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Sesión ADMIN vencida');
    expect(onSignOut).toHaveBeenCalled();
  });
});
