import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ControlPanel } from '../components/ControlPanel';

const session = vi.hoisted(() => ({
  start: vi.fn(),
  stop: vi.fn(),
  isActive: false,
  isOwner: true,
}));

vi.mock('../hooks/useSession', () => ({ useSession: () => session }));

describe('ControlPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    session.start.mockResolvedValue('SHOULD-NOT-BE-SHOWN');
  });

  it('starts a session without exposing or requesting pairing codes', async () => {
    render(<ControlPanel />);
    expect(screen.queryByLabelText(/código/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/vincular sesión/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Iniciar sesión' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    await waitFor(() => expect(session.start).toHaveBeenCalledWith('DOMESTICO'));
    expect(screen.queryByText('SHOULD-NOT-BE-SHOWN')).not.toBeInTheDocument();
  });
});
