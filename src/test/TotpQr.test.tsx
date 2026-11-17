import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { TotpEnrollment } from '@/components/TotpEnrollment';

const URI = 'otpauth://totp/HandWash:admin?secret=ABCDEFGHIJKLMNOP&issuer=HandWash&algorithm=SHA1&digits=6&period=30';

describe('TotpEnrollment', () => {
  afterEach(() => { cleanup(); });

  it('draws the authenticator QR locally and keeps the typed secret as a fallback', async () => {
    const { container } = render(<TotpEnrollment secret="ABCDEFGHIJKLMNOP" otpauthUri={URI} />);

    expect(await screen.findByRole('img', { name: /Código QR/ })).toBeTruthy();
    expect(container.querySelector('svg')).not.toBeNull();
    expect(screen.getByText(/escanéalo con tu app de autenticación/i)).toBeTruthy();
    expect(screen.getByText('ABCDEFGHIJKLMNOP')).toBeTruthy();
  });

  it('rejects anything that is not an otpauth link instead of drawing it', () => {
    render(<TotpEnrollment secret="ABCDEFGHIJKLMNOP" otpauthUri="https://evil.example/phish" />);
    expect(screen.queryByRole('img', { name: /Código QR/ })).toBeNull();
    expect(screen.getByText('ABCDEFGHIJKLMNOP')).toBeTruthy();
  });
});
