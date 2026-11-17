import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConnectStationCard } from '@/components/ConnectStationCard';
import { connectStation } from '@/lib/connectStation';

const KEY = `hwk_0123456789abcdef_${'A'.repeat(43)}`;

function fakeApi(overrides: Record<string, unknown> = {}) {
  return {
    provisionStation: vi.fn(async () => ({ stationId: 'st-1', stationName: 'Lavamanos A' })),
    createApiKey: vi.fn(async () => ({ keyId: '0123456789abcdef', key: KEY, stationId: 'st-1', label: 'Lavamanos A', scopes: ['CONSOLE', 'PRODUCER'] })),
    ...overrides,
  };
}

describe('connectStation', () => {
  it('creates the station and one key that serves the Mac console and the YOLO PC', async () => {
    const api = fakeApi();

    const result = await connectStation(api as never, 'admin-token', '  Lavamanos A ');

    expect(api.provisionStation).toHaveBeenCalledWith('admin-token', { stationName: 'Lavamanos A', producerClientId: '', operatorEmails: [] });
    expect(api.createApiKey).toHaveBeenCalledWith('admin-token', { stationId: 'st-1', label: 'Lavamanos A', scopes: ['CONSOLE', 'PRODUCER'] });
    expect(result).toEqual({ stationName: 'Lavamanos A', key: KEY });
  });

  it('refuses an empty name without calling the backend', async () => {
    const api = fakeApi();
    await expect(connectStation(api as never, 't', '   ')).rejects.toThrow('nombre');
    expect(api.provisionStation).not.toHaveBeenCalled();
  });

  it('says what to do when the station was created but its key was not', async () => {
    const api = fakeApi({ createApiKey: vi.fn(async () => { throw new Error('KEYS_NO_DISPONIBLES'); }) });
    await expect(connectStation(api as never, 't', 'Lavamanos A')).rejects.toThrow(/puesto se creó.*Avanzado/s);
  });
});

describe('ConnectStationCard', () => {
  afterEach(() => { cleanup(); });

  it('turns a name into a connection card with the key shown once and the two steps', async () => {
    const user = userEvent.setup();
    const onConnect = vi.fn(async () => ({ stationName: 'Lavamanos A', key: KEY }));
    render(<ConnectStationCard onConnect={onConnect} operatorUrl="https://frontend.example/#/operator" />);

    await user.type(screen.getByLabelText('Nombre del puesto'), 'Lavamanos A');
    await user.click(screen.getByRole('button', { name: 'Crear puesto' }));

    expect(onConnect).toHaveBeenCalledWith('Lavamanos A');
    expect(await screen.findByText(KEY)).toBeTruthy();
    expect(screen.getByText(/solo se muestra una vez/i)).toBeTruthy();
    expect(screen.getByText(/En el PC con YOLO/)).toBeTruthy();
    expect(screen.getByText(/En el Mac del lavamanos/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /https:\/\/frontend\.example\/#\/operator/ })).toBeTruthy();
  });

  it('shows the failure and lets the admin try again', async () => {
    const user = userEvent.setup();
    const onConnect = vi.fn().mockRejectedValueOnce(new Error('Sin conexión')).mockResolvedValueOnce({ stationName: 'B', key: KEY });
    render(<ConnectStationCard onConnect={onConnect} operatorUrl="https://x/#/operator" />);

    await user.type(screen.getByLabelText('Nombre del puesto'), 'B');
    await user.click(screen.getByRole('button', { name: 'Crear puesto' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión');

    await user.click(screen.getByRole('button', { name: 'Crear puesto' }));
    await waitFor(() => expect(screen.getByText(KEY)).toBeTruthy());
  });

  it('copies the key and can be dismissed once it is saved', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<ConnectStationCard onConnect={async () => ({ stationName: 'A', key: KEY })} operatorUrl="https://x/#/operator" />);

    await user.type(screen.getByLabelText('Nombre del puesto'), 'A');
    await user.click(screen.getByRole('button', { name: 'Crear puesto' }));
    await user.click(await screen.findByRole('button', { name: 'Copiar key' }));
    expect(writeText).toHaveBeenCalledWith(KEY);

    await user.click(screen.getByRole('button', { name: 'Ya la guardé' }));
    expect(screen.queryByText(KEY)).toBeNull();
  });
});
