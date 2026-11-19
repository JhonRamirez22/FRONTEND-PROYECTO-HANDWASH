import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StationLinkActions } from '@/components/StationLinkActions';
import { stationLinkUrl } from '@/lib/stationLink';

const CODE = 'A'.repeat(43);

describe('stationLinkUrl', () => {
  it('opens the operator console and trades the code, nothing else', () => {
    expect(stationLinkUrl('https://app.example', CODE)).toBe(`https://app.example/#/operator?phone=${CODE}`);
  });
});

describe('StationLinkActions', () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('gives ADMIN one link for the Mac and another for the phone, with the expiry', async () => {
    const user = userEvent.setup();
    const onIssue = vi.fn(async (_id: string, mac: boolean) => ({ code: mac ? CODE : 'B'.repeat(43), expiresInSeconds: 3600 }));
    render(<StationLinkActions stationId="st-1" stationName="Lavamanos A" origin="https://app.example" onIssue={onIssue} />);

    await user.click(screen.getByRole('button', { name: 'Enlace para el Mac del puesto' }));
    expect(onIssue).toHaveBeenLastCalledWith('st-1', true);
    expect(await screen.findByDisplayValue(`https://app.example/#/operator?phone=${CODE}`)).toBeTruthy();
    expect(screen.getByText(/una sola vez.*60 min/i)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Enlace para un celular' }));
    expect(onIssue).toHaveBeenLastCalledWith('st-1', false);
    expect(await screen.findByDisplayValue(`https://app.example/#/operator?phone=${'B'.repeat(43)}`)).toBeTruthy();
  });

  it('gives the professor a link that opens the live panel', async () => {
    const user = userEvent.setup();
    const onIssue = vi.fn(async () => ({ code: CODE, expiresInSeconds: 3600 }));
    render(<StationLinkActions stationId="st-1" stationName="Lavamanos A" origin="https://app.example" onIssue={onIssue} />);

    await user.click(screen.getByRole('button', { name: 'Enlace para el profesor' }));

    expect(onIssue).toHaveBeenLastCalledWith('st-1', false);
    expect(await screen.findByDisplayValue(`https://app.example/#/panel?phone=${CODE}`)).toBeTruthy();
  });

  it('copies the link', async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    render(<StationLinkActions stationId="st-1" stationName="A" origin="https://app.example"
      onIssue={async () => ({ code: CODE, expiresInSeconds: 3600 })} />);
    await user.click(screen.getByRole('button', { name: 'Enlace para el Mac del puesto' }));
    await user.click(await screen.findByRole('button', { name: 'Copiar enlace' }));
    expect(writeText).toHaveBeenCalledWith(`https://app.example/#/operator?phone=${CODE}`);
    expect(await screen.findByText('Enlace copiado.')).toBeTruthy();
  });

  it('shows the failure and lets ADMIN retry', async () => {
    const user = userEvent.setup();
    render(<StationLinkActions stationId="st-1" stationName="A" origin="https://app.example"
      onIssue={async () => { throw new Error('Sin conexión'); }} />);
    await user.click(screen.getByRole('button', { name: 'Enlace para un celular' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Sin conexión');
  });
});
