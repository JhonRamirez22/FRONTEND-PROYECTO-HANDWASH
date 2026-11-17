import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QrImage } from '@/components/QrImage';

describe('QrImage', () => {
  afterEach(() => { cleanup(); });

  it('draws an https link as a QR with an accessible label', async () => {
    const { container } = render(<QrImage value="https://frontend.example/#/operator?phone=abc" label="QR para el celular" />);
    expect(await screen.findByRole('img', { name: 'QR para el celular' })).toBeTruthy();
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('refuses to draw anything that is not an https link', () => {
    const { container } = render(<QrImage value="javascript:alert(1)" label="x" />);
    expect(container.querySelector('svg')).toBeNull();
  });
});
