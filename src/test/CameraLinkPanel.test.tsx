import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CameraLinkPanel } from '@/components/CameraLinkPanel';

const base = {
  linked: false, busy: false, error: null as string | null, choices: [] as { deviceId: string; label: string; likelyIphone: boolean }[],
  chosen: '', onChoose: vi.fn(), onLink: vi.fn(), videoRef: createRef<HTMLVideoElement>(),
};

describe('CameraLinkPanel', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('offers one obvious button to link the iPhone or any camera', async () => {
    const onLink = vi.fn();
    render(<CameraLinkPanel {...base} onLink={onLink} />);

    expect(screen.getByRole('heading', { name: 'Vincular cámara' })).toBeTruthy();
    expect(screen.getByText(/iPhone .*o cualquier cámara/)).toBeTruthy();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Vincular cámara' }));

    expect(onLink).toHaveBeenCalledWith(undefined);
  });

  it('says it is working while it looks for cameras and offers to change once linked', () => {
    const { rerender } = render(<CameraLinkPanel {...base} busy />);
    expect(screen.getByRole('button', { name: /Buscando cámaras/ })).toHaveProperty('disabled', true);
    rerender(<CameraLinkPanel {...base} linked />);
    expect(screen.getByRole('button', { name: 'Cambiar cámara' })).toBeTruthy();
    expect(screen.getByLabelText(/Vista previa/)).toBeTruthy();
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
    render(<CameraLinkPanel {...base} error="El navegador bloqueó la cámara. Permítela en el candado de la barra." />);
    expect(screen.getByRole('alert')).toHaveTextContent('bloqueó la cámara');
  });
});
