import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConnectStationCard } from '@/components/ConnectStationCard';
import { connectStation } from '@/lib/connectStation';

const CODE = 'A'.repeat(43);

describe('connectStation', () => {
  it('creates only the station: the Mac opens a link, the PC pairs itself', async () => {
    const provisionStation = vi.fn(async () => ({ stationId: 'st-1', stationName: 'Lavamanos A' }));

    const result = await connectStation({ provisionStation } as never, 'admin-token', '  Lavamanos A ');

    expect(provisionStation).toHaveBeenCalledWith('admin-token', { stationName: 'Lavamanos A', producerClientId: '', operatorEmails: [] });
    expect(result).toEqual({ stationId: 'st-1', stationName: 'Lavamanos A' });
  });

  it('refuses an empty name without calling the backend', async () => {
    const provisionStation = vi.fn();
    await expect(connectStation({ provisionStation } as never, 't', '   ')).rejects.toThrow('nombre');
    expect(provisionStation).not.toHaveBeenCalled();
  });
});

describe('ConnectStationCard', () => {
  afterEach(() => { cleanup(); });

  it('turns a name into a station and a link for its Mac, with no key to type', async () => {
    const user = userEvent.setup();
    const onConnect = vi.fn(async () => ({ stationId: 'st-1', stationName: 'Lavamanos A' }));
    const onIssueLink = vi.fn(async () => ({ code: CODE, expiresInSeconds: 3600 }));
    render(<ConnectStationCard onConnect={onConnect} onIssueLink={onIssueLink} origin="https://frontend.example" />);

    await user.type(screen.getByLabelText('Nombre del puesto'), 'Lavamanos A');
    await user.click(screen.getByRole('button', { name: 'Crear puesto' }));

    expect(onConnect).toHaveBeenCalledWith('Lavamanos A');
    expect(await screen.findByText(/está listo/)).toBeTruthy();
    expect(screen.getByText(/En el PC con YOLO/)).toBeTruthy();
    expect(screen.getByText(/PCs esperando/)).toBeTruthy();
    expect(screen.queryByText(/hwk_/)).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Enlace para el Mac del puesto' }));
    expect(onIssueLink).toHaveBeenCalledWith('st-1', true);
    expect(await screen.findByDisplayValue(`https://frontend.example/#/operator?phone=${CODE}`)).toBeTruthy();
  });

  it('shows the failure and lets the admin try again', async () => {
    const user = userEvent.setup();
    const onConnect = vi.fn().mockRejectedValueOnce(new Error('Sin conexión')).mockResolvedValueOnce({ stationId: 'st-2', stationName: 'B' });
    render(<ConnectStationCard onConnect={onConnect} onIssueLink={vi.fn()} origin="https://x" />);

    await user.type(screen.getByLabelText('Nombre del puesto'), 'B');
    await user.click(screen.getByRole('button', { name: 'Crear puesto' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Sin conexión');

    await user.click(screen.getByRole('button', { name: 'Crear puesto' }));
    expect(await screen.findByText(/“B” está listo/)).toBeTruthy();
  });

  it('can be dismissed with Listo', async () => {
    const user = userEvent.setup();
    render(<ConnectStationCard onConnect={async () => ({ stationId: 's', stationName: 'A' })} onIssueLink={vi.fn()} origin="https://x" />);
    await user.type(screen.getByLabelText('Nombre del puesto'), 'A');
    await user.click(screen.getByRole('button', { name: 'Crear puesto' }));
    await user.click(await screen.findByRole('button', { name: 'Listo' }));
    expect(screen.queryByText(/está listo/)).toBeNull();
  });
});
