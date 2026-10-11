import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminAuditPage } from '../components/AdminAuditPage';

const { auth, api } = vi.hoisted(() => ({
  auth: {
    isConfigured: vi.fn(),
    completeRedirect: vi.fn(),
    getAccessToken: vi.fn(),
    getHumanRoles: vi.fn(),
    clear: vi.fn(),
    beginSignIn: vi.fn(),
  },
  api: {
    encounters: vi.fn(),
    events: vi.fn(),
    accessEvents: vi.fn(),
    failedAttempts: vi.fn(),
  },
}));

vi.mock('../lib/adminAuth', () => ({ cognitoAdminAuth: auth }));
vi.mock('../lib/AdminAuditApi', () => ({
  AdminAuditApi: class {
    encounters = api.encounters;
    events = api.events;
    accessEvents = api.accessEvents;
    failedAttempts = api.failedAttempts;
  },
}));

describe('AdminAuditPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.isConfigured.mockReturnValue(true);
    auth.completeRedirect.mockResolvedValue(false);
    auth.getAccessToken.mockReturnValue('access-token');
    auth.getHumanRoles.mockReturnValue(['ADMIN']);
    api.encounters.mockResolvedValue([]);
    api.events.mockResolvedValue([]);
    api.accessEvents.mockResolvedValue([{
      eventId: 1,
      sessionId: null,
      eventType: 'ADMIN_ACCESS_LOG_READ',
      actorSubject: 'cognito-admin-subject',
      stepCode: null,
      decisionCode: 'READ',
      reasonCode: null,
      attemptNumber: null,
      frameSequence: null,
      confidence: null,
      occurredAtEpochMs: 1_800_000_000_000,
    }]);
    api.failedAttempts.mockResolvedValue([{
      sessionId: '9d967e40-f80f-46ea-9478-f5842ff37be1',
      attemptNumber: 2,
      result: 'REINICIADO',
      reasonCode: 'PASO_FUERA_DE_SECUENCIA',
      durationMs: 12_000,
      createdAtEpochMs: 1_800_000_000_000,
    }]);
  });

  it('renders metadata-only failed attempts in the read-only admin console', async () => {
    render(<AdminAuditPage onBack={vi.fn()} />);

    expect(await screen.findByText('Intentos reiniciados')).toBeInTheDocument();
    expect(screen.getByText('PASO_FUERA_DE_SECUENCIA')).toBeInTheDocument();
    expect(screen.getByText('9d967e40-f80f-46ea-9478-f5842ff37be1')).toBeInTheDocument();
    expect(screen.getByText('12 s')).toBeInTheDocument();
    expect(screen.getByText(/sub cognito-admin-subject/)).toBeInTheDocument();
  });

  it('does not request audit records for an authenticated non-admin account', async () => {
    auth.getHumanRoles.mockReturnValue(['OPERATOR']);
    render(<AdminAuditPage onBack={vi.fn()} />);

    expect(await screen.findByText('Acceso ADMIN requerido')).toBeInTheDocument();
    expect(api.encounters).not.toHaveBeenCalled();
    expect(api.accessEvents).not.toHaveBeenCalled();
    expect(api.failedAttempts).not.toHaveBeenCalled();
  });

  it('ignores late event responses after the admin selects another encounter', async () => {
    const user = userEvent.setup();
    const firstId = 'session-first';
    const secondId = 'session-second';
    const encounter = (sessionId: string) => ({
      sessionId,
      protocolCode: 'FRICCION_PARCIAL',
      status: 'INTERRUPTED',
      startedAtEpochMs: 1_800_000_000_000,
      endedAtEpochMs: null,
      modelVersion: 'yolo26n',
      modelSha256: 'a'.repeat(64),
      datasetVersion: 'v1',
      attemptsRestarted: 0,
      producerClientId: null,
      producerEpoch: null,
    });
    const resolvers: Array<(events: Array<Record<string, unknown>>) => void> = [];
    api.encounters.mockResolvedValue([encounter(firstId), encounter(secondId)]);
    api.events.mockImplementation(() => new Promise((resolve) => resolvers.push(resolve)));

    render(<AdminAuditPage onBack={vi.fn()} />);
    const eventButtons = await screen.findAllByRole('button', { name: /Ver eventos/ });
    await user.click(eventButtons[0]!);
    await user.click(eventButtons[1]!);

    resolvers[1]!([{
      eventId: 2, sessionId: secondId, eventType: 'CURRENT_SESSION_EVENT', actorSubject: null,
      stepCode: null, decisionCode: 'READ', reasonCode: null, attemptNumber: null,
      frameSequence: null, confidence: null, occurredAtEpochMs: 1_800_000_000_000,
    }]);
    expect(await screen.findByText('CURRENT SESSION EVENT')).toBeInTheDocument();
    expect(screen.getByText(secondId)).toBeInTheDocument();

    resolvers[0]!([{
      eventId: 1, sessionId: firstId, eventType: 'STALE_SESSION_EVENT', actorSubject: null,
      stepCode: null, decisionCode: 'READ', reasonCode: null, attemptNumber: null,
      frameSequence: null, confidence: null, occurredAtEpochMs: 1_800_000_000_000,
    }]);

    expect(screen.queryByText('STALE SESSION EVENT')).not.toBeInTheDocument();
    expect(screen.getByText('CURRENT SESSION EVENT')).toBeInTheDocument();
    expect(screen.getByText(secondId)).toBeInTheDocument();
  });
});
