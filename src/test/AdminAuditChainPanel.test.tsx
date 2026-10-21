import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminAuditChainPanel } from '@/components/AdminAuditChainPanel';

const { auth, auditChain, sealAuditChain } = vi.hoisted(() => ({
  auth: { getAccessToken: vi.fn() }, auditChain: vi.fn(), sealAuditChain: vi.fn(),
}));
vi.mock('@/lib/adminAuth', () => ({ cognitoAdminAuth: auth }));
vi.mock('@/lib/AdminAuditApi', () => ({ AdminAuditApi: class { auditChain = auditChain; sealAuditChain = sealAuditChain; } }));

const status = (overrides: Record<string, unknown> = {}, chain: Record<string, unknown> = {}) => ({
  chain: { ok: true, keyed: true, checked: 120, firstChainedEventId: 1, lastEventId: 120, headHash: 'h'.repeat(64),
    matchesLatestSeal: true, problems: [], ...chain },
  resultsMatchLatestSeal: true,
  seals: [{ sealId: 1, sealedAtEpochMs: Date.UTC(2026, 9, 21, 12), toEventId: 120, headHash: 'h'.repeat(64), eventCount: 120,
    resultsCount: 4, keyed: true, objectKey: 'seals/2026-10-21.json' }],
  ...overrides,
});

describe('AdminAuditChainPanel', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    auth.getAccessToken.mockReturnValue('access-token');
  });

  it('shows an intact chain with its write-once seal', async () => {
    auditChain.mockResolvedValue(status());
    render(<AdminAuditChainPanel onSignOut={vi.fn()} />);

    await userEvent.setup().click(screen.getByRole('button', { name: /Verificar ahora/ }));

    expect(await screen.findByText('Cadena íntegra')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('120 eventos verificados');
    expect(screen.getByRole('status')).toHaveTextContent('copia de solo escritura');
    expect(auditChain).toHaveBeenCalledWith('access-token');
  });

  it('explains every detected problem in plain language', async () => {
    auditChain.mockResolvedValue(status({}, { ok: false, problems: [
      { eventId: 7, code: 'HASH_MISMATCH' }, { eventId: 9, code: 'BROKEN_LINK' }, { eventId: null, code: 'HEAD_MISMATCH' }] }));
    render(<AdminAuditChainPanel onSignOut={vi.fn()} />);

    await userEvent.setup().click(screen.getByRole('button', { name: /Verificar ahora/ }));

    expect(await screen.findByText('Se detectó una inconsistencia')).toBeInTheDocument();
    expect(screen.getByText(/un evento fue modificado \(evento 7\)/)).toBeInTheDocument();
    expect(screen.getByText(/falta o sobra un evento en la cadena \(evento 9\)/)).toBeInTheDocument();
    expect(screen.getByText(/el final de la cadena no coincide/)).toBeInTheDocument();
  });

  it('does not call an altered set of washes intact even if the chain itself is fine', async () => {
    auditChain.mockResolvedValue(status({ resultsMatchLatestSeal: false }));
    render(<AdminAuditChainPanel onSignOut={vi.fn()} />);

    await userEvent.setup().click(screen.getByRole('button', { name: /Verificar ahora/ }));

    expect(await screen.findByText('Se detectó una inconsistencia')).toBeInTheDocument();
    expect(screen.getByText(/resultados de lavado ya no coinciden/)).toBeInTheDocument();
  });

  it('seals first and then verifies, and signs out when the session expired', async () => {
    auditChain.mockResolvedValue(status());
    sealAuditChain.mockResolvedValue(null);
    const onSignOut = vi.fn();
    const user = userEvent.setup();
    render(<AdminAuditChainPanel onSignOut={onSignOut} />);
    await user.click(screen.getByRole('button', { name: /Sellar ahora/ }));
    await screen.findByText('Cadena íntegra');
    expect(sealAuditChain).toHaveBeenCalledWith('access-token');

    auditChain.mockRejectedValue(new Error('Sesión ADMIN vencida. Inicia sesión de nuevo.'));
    await user.click(screen.getByRole('button', { name: /Verificar ahora/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Sesión ADMIN vencida');
    expect(onSignOut).toHaveBeenCalled();
  });
});
