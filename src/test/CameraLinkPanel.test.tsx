import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CameraLinkPanel } from '@/components/CameraLinkPanel';

const base = {
  linked: false, busy: false, error: null as string | null, choices: [] as { deviceId: string; label: string; likelyIphone: boolean }[],
  chosen: '', onChoose: vi.fn(), onLink: vi.fn(), onLinkIphone: vi.fn(), onLinkPhone: vi.fn(),
  isPhone: false, agentNote: null as { tone: 'ok' | 'wait' | 'warn'; text: string; browserFallback: boolean } | null, onUseBrowser: vi.fn(), phoneLink: null as { url: string; secondsLeft: number } | null, videoRef: createRef<HTMLVideoElement>(),
};

describe('CameraLinkPanel', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('offers two clear buttons: the iPhone through Continuity and an Android phone', async () => {
    const onLinkIphone = vi.fn();
    const onLinkPhone = vi.fn();
    render(<CameraLinkPanel {...base} onLinkIphone={onLinkIphone} onLinkPhone={onLinkPhone} />);
    const user = userEvent.setup();

    expect(screen.getByRole('heading', { name: 'Vincular cámara' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /Conectar iPhone \(Cámara de Continuidad\)/ }));
    await user.click(screen.getByRole('button', { name: 'Conectar un celular Android' }));

    expect(onLinkIphone).toHaveBeenCalledTimes(1);
    expect(onLinkPhone).toHaveBeenCalledTimes(1);
  });

  it('shows what the iPhone helper is doing and offers the browser only when the helper cannot be used', async () => {
    const onUseBrowser = vi.fn();
    const { rerender } = render(<CameraLinkPanel {...base} agentNote={{ tone: 'ok', text: 'Ayudante conectado.', browserFallback: false }} onUseBrowser={onUseBrowser} />);
    expect(screen.getByRole('status')).toHaveTextContent('Ayudante conectado.');
    expect(screen.queryByRole('button', { name: 'Probar con el navegador' })).toBeNull();

    rerender(<CameraLinkPanel {...base} agentNote={{ tone: 'warn', text: 'El ayudante del Mac no está abierto.', browserFallback: true }} onUseBrowser={onUseBrowser} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Probar con el navegador' }));
    expect(onUseBrowser).toHaveBeenCalledTimes(1);
  });

  it('on a phone the second button uses that phone own camera', () => {
    render(<CameraLinkPanel {...base} isPhone />);
    expect(screen.getByRole('button', { name: 'Usar la cámara de este celular' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Conectar un celular Android' })).toBeNull();
  });

  it('says what the iPhone needs while it searches, and disables both buttons', () => {
    render(<CameraLinkPanel {...base} busy />);
    expect(screen.getByRole('button', { name: /Buscando/ })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Conectar un celular Android' })).toHaveProperty('disabled', true);
    expect(screen.getByText(/desbloqueado/)).toBeTruthy();
  });

  it('shows the QR and its countdown for the phone to scan', async () => {
    render(<CameraLinkPanel {...base} phoneLink={{ url: 'https://frontend.example/#/operator?phone=abc', secondsLeft: 87 }} />);
    expect(await screen.findByRole('img', { name: /QR para abrir la consola en el celular/ })).toBeTruthy();
    expect(screen.getByText(/vence en 87 s/i)).toBeTruthy();
  });

  it('shows the preview and offers to change the camera once linked', () => {
    render(<CameraLinkPanel {...base} linked />);
    expect(screen.getByLabelText(/Vista previa/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Cambiar cámara|Conectar iPhone/ })).toBeTruthy();
  });

  it('lists the available cameras, marks the iPhone and links the chosen one', async () => {
    const onLink = vi.fn();
    render(<CameraLinkPanel {...base} onLink={onLink} chosen="b"
      choices={[{ deviceId: 'a', label: 'FaceTime HD', likelyIphone: false }, { deviceId: 'b', label: 'Cámara de Jhon', likelyIphone: true }]} />);

    expect(screen.getByRole('option', { name: 'Cámara de Jhon (iPhone)' })).toBeTruthy();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Usar esta cámara' }));
    expect(onLink).toHaveBeenCalledWith('b');
  });

  it('shows what went wrong so the operator knows what to allow', () => {
    render(<CameraLinkPanel {...base} error="El navegador bloqueó la cámara." />);
    expect(screen.getByRole('alert')).toHaveTextContent('bloqueó la cámara');
  });
});
